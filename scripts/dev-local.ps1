[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$SkipGenerate,
  [switch]$SkipMigrations,
  [switch]$Seed
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Write-Step {
  param([Parameter(Mandatory)][string]$Message)

  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Native {
  param(
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][string]$Command,
    [string[]]$Arguments = @()
  )

  Write-Step $Label
  & $Command @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }
}

function Assert-Command {
  param([Parameter(Mandatory)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "'$Name' is required but was not found in PATH."
  }
}

function Resolve-PnpmLauncher {
  $pnpm = Get-Command 'pnpm.cmd', 'pnpm' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pnpm) {
    return [pscustomobject]@{
      Command = $pnpm.Source
      PrefixArguments = @()
    }
  }

  $corepack = Get-Command 'corepack.cmd', 'corepack' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $corepack) {
    throw "Neither pnpm nor Corepack was found. Reinstall Node.js 22 with Corepack enabled."
  }

  & $corepack.Source pnpm --version *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Corepack was found but could not start the pnpm version required by this project.'
  }

  $shimDirectory = Join-Path $PSScriptRoot 'bin'
  $shimPath = Join-Path $shimDirectory 'pnpm.cmd'
  if (-not (Test-Path -LiteralPath $shimPath)) {
    throw "The local pnpm launcher is missing: $shimPath"
  }
  $env:Path = "$shimDirectory;$env:Path"

  return [pscustomobject]@{
    Command = $shimPath
    PrefixArguments = @()
  }
}

function Invoke-Pnpm {
  param(
    [Parameter(Mandatory)][string]$Label,
    [string[]]$Arguments = @()
  )

  Invoke-Native $Label $script:pnpmLauncher.Command @($script:pnpmLauncher.PrefixArguments + $Arguments)
}

function Test-DockerDaemon {
  & docker info --format '{{.ServerVersion}}' *> $null
  return $LASTEXITCODE -eq 0
}

function Start-DockerDesktopIfNeeded {
  if (Test-DockerDaemon) {
    return
  }

  $dockerDesktopCandidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
  )
  $dockerDesktop = $dockerDesktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

  if (-not $dockerDesktop) {
    throw 'Docker is installed, but its daemon is not running. Start Docker Desktop and run this file again.'
  }

  Write-Step 'Starting Docker Desktop'
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null

  $deadline = (Get-Date).AddMinutes(2)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if (Test-DockerDaemon) {
      return
    }
  }

  throw 'Docker Desktop did not become ready within two minutes.'
}

function Assert-PortAvailable {
  param(
    [Parameter(Mandatory)][int]$Port,
    [Parameter(Mandatory)][string]$Service
  )

  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  if ($listeners.Count -eq 0) {
    return
  }

  $processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  $details = $processIds | ForEach-Object {
    $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
    if ($process) { "$($process.ProcessName) (PID $($_))" } else { "PID $($_)" }
  }
  throw "$Service cannot start because port $Port is already in use by $($details -join ', ')."
}

try {
  Write-Host 'AcademyOps - local development' -ForegroundColor Green
  Write-Host "Project: $projectRoot"

  Assert-Command 'node'
  Assert-Command 'docker'
  $script:pnpmLauncher = Resolve-PnpmLauncher

  $nodeVersion = (& node --version).Trim()
  $nodeMajor = [int](($nodeVersion.TrimStart('v') -split '\.')[0])
  if ($nodeMajor -lt 22) {
    throw "Node.js 22 or newer is required. Current version: $nodeVersion"
  }

  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose v2 is required."
  }

  Start-DockerDesktopIfNeeded

  if (-not (Test-Path -LiteralPath 'apps/api/.env')) {
    if (-not (Test-Path -LiteralPath '.env.example')) {
      throw 'apps/api/.env is missing and .env.example was not found.'
    }
    Write-Step 'Creating apps/api/.env from .env.example'
    Copy-Item -LiteralPath '.env.example' -Destination 'apps/api/.env'
  }

  if (-not $SkipInstall) {
    if (-not (Test-Path -LiteralPath 'node_modules/.pnpm')) {
      Invoke-Pnpm 'Installing workspace dependencies' @('install', '--frozen-lockfile')
    } else {
      Write-Host 'Dependencies already installed.' -ForegroundColor DarkGray
    }
  } elseif (-not (Test-Path -LiteralPath 'node_modules/.pnpm')) {
    throw 'Dependencies are missing. Run again without -SkipInstall.'
  }

  Invoke-Native 'Starting PostgreSQL, Redis, and Mailpit' 'docker' @(
    'compose', 'up', '-d', '--wait', 'postgres', 'redis', 'mailpit'
  )

  if (-not $SkipGenerate) {
    Invoke-Pnpm 'Generating Prisma Client' @('db:generate')
  }

  if (-not $SkipMigrations) {
    Invoke-Pnpm 'Applying database migrations' @('db:deploy')
  }

  if ($Seed) {
    Invoke-Pnpm 'Seeding local development data' @('db:seed')
  }

  Assert-PortAvailable -Port 3001 -Service 'API'
  Assert-PortAvailable -Port 3130 -Service 'Web'
  Assert-PortAvailable -Port 9464 -Service 'Worker metrics'

  $env:NODE_ENV = 'development'
  $env:WEB_ORIGIN = 'http://localhost:3130'
  $env:API_ORIGIN = 'http://localhost:3001'
  $env:API_INTERNAL_URL = 'http://localhost:3001/api/v1'
  $env:NEXT_PUBLIC_REALTIME_URL = 'http://localhost:3001'

  Write-Step 'Starting the complete development workspace'
  Write-Host 'Web:     http://localhost:3130' -ForegroundColor Green
  Write-Host 'API:     http://localhost:3001/api/v1' -ForegroundColor Green
  Write-Host 'Mailpit: http://localhost:58025' -ForegroundColor Green
  Write-Host 'Press Ctrl+C to stop API, worker, and web. Confirm with Y if Windows asks.' -ForegroundColor Yellow
  Write-Host ''

  $devArguments = @($script:pnpmLauncher.PrefixArguments) + @('dev')
  & $script:pnpmLauncher.Command @devArguments
  $devExitCode = $LASTEXITCODE
  if ($devExitCode -ne 0) {
    throw "Development workspace stopped with exit code $devExitCode."
  }
} catch {
  Write-Host "`nLocal development failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
