[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory)][ValidatePattern('^ami-[a-f0-9]+$')][string]$ImageId,
  [Parameter(Mandatory)][ValidatePattern('^sg-[a-f0-9]+$')][string]$SecurityGroupId,
  [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9._-]+$')][string]$KeyName,
  [Parameter(Mandatory)][ValidatePattern('^[a-z]{2}-[a-z]+-[0-9]+$')][string]$Region,
  [string]$OutputPath = (Join-Path $PSScriptRoot 'cluster-nodes.local.json')
)

$ErrorActionPreference = 'Stop'
$aws = (Get-Command aws -ErrorAction Stop).Source
$mapping = 'file://' + (Join-Path $PSScriptRoot 'ebs-mapping.json').Replace('\', '/')
$nodeSpecifications = @(
  @{ Role = 'vps1'; Name = 'plg-vps1-ingress-monitoring'; Type = 'm7i-flex.xlarge' },
  @{ Role = 'vps2'; Name = 'plg-vps2-backend-worker'; Type = 'm7i-flex.2xlarge' },
  @{ Role = 'vps3'; Name = 'plg-vps3-database-redis'; Type = 'm7i-flex.xlarge' }
)

if (Test-Path -LiteralPath $OutputPath) {
  throw 'The output inventory already exists. Choose a new path to preserve the existing inventory.'
}

$instanceIds = @()
foreach ($node in $nodeSpecifications) {
  if (!$PSCmdlet.ShouldProcess("$($node.Name) in $Region", 'Create a billable EC2 instance')) {
    continue
  }
  $arguments = @(
    'ec2', 'run-instances', '--region', $Region,
    '--image-id', $ImageId, '--count', '1', '--instance-type', $node.Type,
    '--key-name', $KeyName, '--security-group-ids', $SecurityGroupId,
    '--block-device-mappings', $mapping,
    '--tag-specifications', "ResourceType=instance,Tags=[{Key=Name,Value=$($node.Name)},{Key=Role,Value=$($node.Role)}]",
    '--output', 'json'
  )
  $response = & $aws @arguments
  if ($LASTEXITCODE -ne 0) { throw "EC2 launch failed for $($node.Name)." }
  $instanceIds += ($response | ConvertFrom-Json).Instances[0].InstanceId
}
if ($instanceIds.Count -eq 0) { return }

& $aws ec2 wait instance-running --region $Region --instance-ids @instanceIds
if ($LASTEXITCODE -ne 0) { throw 'EC2 instances did not reach the running state.' }
$response = & $aws ec2 describe-instances --region $Region --instance-ids @instanceIds --output json
if ($LASTEXITCODE -ne 0) { throw 'Could not retrieve the new instance inventory.' }
$description = $response | ConvertFrom-Json
$inventory = foreach ($reservation in $description.Reservations) {
  foreach ($instance in $reservation.Instances) {
    [PSCustomObject]@{
      Name = ($instance.Tags | Where-Object Key -eq 'Name').Value
      Role = ($instance.Tags | Where-Object Key -eq 'Role').Value
      Id = $instance.InstanceId
      PublicIp = $instance.PublicIpAddress
      PrivateIp = $instance.PrivateIpAddress
      Type = $instance.InstanceType
    }
  }
}
$inventory | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Host "Saved private node metadata to $OutputPath. Keep this file outside version control."
