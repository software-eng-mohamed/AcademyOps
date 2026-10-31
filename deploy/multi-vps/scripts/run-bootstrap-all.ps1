[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory)][string]$SshKeyPath,
  [string]$InventoryPath = (Join-Path $PSScriptRoot '..\cluster-nodes.local.json'),
  [ValidatePattern('^[a-z_][a-z0-9_-]*$')][string]$SshUser = 'ubuntu'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'read-cluster-inventory.ps1')
$key = (Resolve-Path -LiteralPath $SshKeyPath).Path
$bootstrap = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'bootstrap-node.sh')).Path
$nodes = Read-ClusterInventory -InventoryPath $InventoryPath

# Verify each server's host key with SSH before using this batch script.
# BatchMode preserves normal host-key verification and fails on unknown hosts.
foreach ($node in $nodes) {
  $target = "${SshUser}@$($node.PublicIp)"
  if (!$PSCmdlet.ShouldProcess($node.Name, 'Install the cluster prerequisites over SSH')) { continue }
  Invoke-ClusterCommand 'scp' @('-i', $key, '-o', 'BatchMode=yes', $bootstrap, "${target}:/tmp/bootstrap-node.sh")
  Invoke-ClusterCommand 'ssh' @('-i', $key, '-o', 'BatchMode=yes', $target, 'sudo bash /tmp/bootstrap-node.sh')
}
