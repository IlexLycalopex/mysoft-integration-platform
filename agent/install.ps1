#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs or upgrades the Mysoft Integration Agent as a Windows Service.

.DESCRIPTION
    Copies MysoftAgent.exe to the install path, writes appsettings.json with
    the provided credentials, and registers (or updates) the Windows Service.
    Safe to re-run for upgrades — the service is stopped and restarted.

.PARAMETER ApiBaseUrl
    The base URL of the Mysoft Integration Platform API (e.g. https://mysoft-integration-platform.vercel.app/api/v1).

.PARAMETER ApiKey
    The API key for this agent (obtain from Settings → API Keys in the platform).

.PARAMETER InstallPath
    Folder where the agent executable is installed. Default: C:\Program Files\MysoftAgent

.PARAMETER LogPath
    Folder where rolling log files are written. Default: C:\ProgramData\MysoftAgent\logs

.PARAMETER ServiceName
    Windows Service name. Default: MysoftIntegrationAgent

.PARAMETER ServiceDisplayName
    Display name shown in Services. Default: Mysoft Integration Agent

.PARAMETER SourceExe
    Path to MysoftAgent.exe to install. Defaults to MysoftAgent.exe in the same folder as this script.

.EXAMPLE
    .\install.ps1 -ApiBaseUrl "https://mysoft-integration-platform.vercel.app/api/v1" -ApiKey "mip_xxxxx"

.EXAMPLE
    # Upgrade only (keeps existing credentials)
    .\install.ps1 -UpgradeOnly
#>
param(
    [string]$ApiBaseUrl = 'https://mysoft-integration-platform.vercel.app/api/v1',

    [string]$ApiKey = '',

    [string]$InstallPath = 'C:\Program Files\MysoftAgent',

    [string]$LogPath = 'C:\ProgramData\MysoftAgent\logs',

    [string]$ServiceName = 'MysoftIntegrationAgent',

    [string]$ServiceDisplayName = 'Mysoft Integration Agent',

    [string]$SourceExe = (Join-Path $PSScriptRoot 'MysoftAgent.exe'),

    [switch]$UpgradeOnly
)

$ErrorActionPreference = 'Stop'

# ─── Banner ──────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
Write-Host '  Mysoft Integration Agent — Installer'         -ForegroundColor Cyan
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
Write-Host ''

# ─── Validate source executable ──────────────────────────────────────────────
if (-not (Test-Path $SourceExe)) {
    Write-Error "MysoftAgent.exe not found at: $SourceExe`nRun build.ps1 first, or specify -SourceExe."
    exit 1
}

# ─── Validate API key (new install only) ─────────────────────────────────────
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$isUpgrade = $null -ne $existingService

if (-not $UpgradeOnly -and [string]::IsNullOrWhiteSpace($ApiKey) -and -not $isUpgrade) {
    Write-Error "ApiKey is required for a new installation. Obtain it from Settings → API Keys in the platform."
    exit 1
}

# ─── Stop service if running ─────────────────────────────────────────────────
if ($isUpgrade) {
    Write-Host "Existing service found — stopping for upgrade..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

# ─── Create install directory ────────────────────────────────────────────────
if (-not (Test-Path $InstallPath)) {
    Write-Host "Creating install directory: $InstallPath"
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

# ─── Copy executable ─────────────────────────────────────────────────────────
$destExe = Join-Path $InstallPath 'MysoftAgent.exe'
Write-Host "Copying MysoftAgent.exe → $destExe"
Copy-Item -Path $SourceExe -Destination $destExe -Force

# ─── Write appsettings.json ──────────────────────────────────────────────────
$settingsPath = Join-Path $InstallPath 'appsettings.json'

# For upgrades without a new ApiKey, preserve the existing key
$resolvedApiKey = $ApiKey
if ($isUpgrade -and [string]::IsNullOrWhiteSpace($ApiKey) -and (Test-Path $settingsPath)) {
    try {
        $existingSettings = Get-Content $settingsPath -Raw | ConvertFrom-Json
        $resolvedApiKey = $existingSettings.MysoftAgent.ApiKey
        Write-Host "Upgrade: preserving existing API key from $settingsPath"
    } catch {
        Write-Warning "Could not read existing settings — API key will be blank."
    }
}

# Escape log path backslashes for JSON
$escapedLogPath = $LogPath.Replace('\', '\\')

$settingsJson = @"
{
  "MysoftAgent": {
    "ApiBaseUrl": "$ApiBaseUrl",
    "ApiKey": "$resolvedApiKey",
    "LogPath": "$escapedLogPath"
  },
  "Serilog": {
    "Using": ["Serilog.Sinks.File", "Serilog.Sinks.EventLog"],
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "System": "Warning"
      }
    },
    "WriteTo": [
      {
        "Name": "File",
        "Args": {
          "path": "$escapedLogPath\\agent-.log",
          "rollingInterval": "Day",
          "retainedFileCountLimit": 30,
          "fileSizeLimitBytes": 10485760,
          "rollOnFileSizeLimit": true,
          "outputTemplate": "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}"
        }
      },
      {
        "Name": "EventLog",
        "Args": {
          "source": "MysoftIntegrationAgent",
          "logName": "Application",
          "restrictedToMinimumLevel": "Warning"
        }
      }
    ]
  }
}
"@

Write-Host "Writing configuration to: $settingsPath"
$settingsJson | Set-Content -Path $settingsPath -Encoding UTF8

# ─── Create log directory ────────────────────────────────────────────────────
if (-not (Test-Path $LogPath)) {
    Write-Host "Creating log directory: $LogPath"
    New-Item -ItemType Directory -Path $LogPath -Force | Out-Null
}

# ─── Register or update the Windows Service ──────────────────────────────────
if ($isUpgrade) {
    Write-Host "Updating existing service '$ServiceName'..."
    sc.exe config $ServiceName binpath= "`"$destExe`"" | Out-Null
} else {
    Write-Host "Creating Windows Service '$ServiceName'..."
    New-Service `
        -Name $ServiceName `
        -DisplayName $ServiceDisplayName `
        -Description "Watches local folders for files and uploads them to the Mysoft Integration Platform." `
        -BinaryPathName "`"$destExe`"" `
        -StartupType Automatic `
        | Out-Null

    # Configure recovery actions: restart after 60s for first 2 failures, then restart after 5 min
    sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/300000 | Out-Null
}

# ─── Start the service ────────────────────────────────────────────────────────
Write-Host "Starting service '$ServiceName'..."
Start-Service -Name $ServiceName
Start-Sleep -Seconds 3

$svc = Get-Service -Name $ServiceName
$statusColor = if ($svc.Status -eq 'Running') { 'Green' } else { 'Red' }

Write-Host ''
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  Service : $ServiceName" -ForegroundColor Green
Write-Host "  Status  : $($svc.Status)" -ForegroundColor $statusColor
Write-Host "  Logs    : $LogPath" -ForegroundColor Green
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Green
Write-Host ''
Write-Host "Verify the agent is running by checking the log file:" -ForegroundColor Gray
Write-Host "  Get-Content '$LogPath\agent-*.log' -Tail 20" -ForegroundColor Gray
Write-Host ''
