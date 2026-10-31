function Read-ClusterInventory {
  param([Parameter(Mandatory)][string]$InventoryPath)

  $nodes = @(Get-Content -LiteralPath $InventoryPath -Raw | ConvertFrom-Json)
  if ($nodes.Count -ne 3) { throw 'The cluster inventory must contain exactly three nodes.' }
  $roles = @()
  foreach ($node in $nodes) {
    if ($node.Role -notin @('vps1', 'vps2', 'vps3') -or $node.Role -in $roles) {
      throw 'Provide one inventory entry for each role: vps1, vps2, vps3.'
    }
    $roles += $node.Role
    $address = $null
    if (![Net.IPAddress]::TryParse($node.PublicIp, [ref]$address) -or
        $address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
        $node.PublicIp -match '^(0\.|127\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)') {
      throw "Replace the example address for $($node.Role) with your server's IPv4 address."
    }
  }
  return $nodes
}

function Invoke-ClusterCommand {
  param([Parameter(Mandatory)][string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE." }
}
