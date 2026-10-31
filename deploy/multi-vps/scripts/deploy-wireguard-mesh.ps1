[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory)][string]$SshKeyPath,
  [string]$InventoryPath = (Join-Path $PSScriptRoot '..\cluster-nodes.local.json'),
  [string]$GeneratedDirectory = (Join-Path $PSScriptRoot '..\wireguard\generated'),
  [ValidatePattern('^[a-z_][a-z0-9_-]*$')][string]$SshUser = 'ubuntu'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'read-cluster-inventory.ps1')
$key = (Resolve-Path -LiteralPath $SshKeyPath).Path
$nodes = Read-ClusterInventory -InventoryPath $InventoryPath

# Verify server host keys first; do not disable SSH host-key checking.
foreach ($node in $nodes) {
  $configuration = (Resolve-Path -LiteralPath (Join-Path $GeneratedDirectory "wg0-$($node.Role).conf")).Path
  $target = "${SshUser}@$($node.PublicIp)"
  if (!$PSCmdlet.ShouldProcess($node.Name, 'Install and enable the generated WireGuard configuration')) { continue }
  Invoke-ClusterCommand 'scp' @('-i', $key, '-o', 'BatchMode=yes', $configuration, "${target}:/tmp/wg0.conf")
  Invoke-ClusterCommand 'ssh' @(
    '-i', $key, '-o', 'BatchMode=yes', $target,
    'sudo install -m 600 /tmp/wg0.conf /etc/wireguard/wg0.conf && rm /tmp/wg0.conf && sudo systemctl enable --now wg-quick@wg0'
  )
}
