#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the Mysoft Integration Agent and packages it as a deployable ZIP.

.DESCRIPTION
    1. Reads the version from MysoftAgent.csproj
    2. Runs build.ps1 to compile a self-contained win-x64 executable
    3. Assembles a clean distribution folder:
         MysoftAgent-v{version}-win-x64\
           MysoftAgent.exe
           appsettings.json        (template — user fills in ApiKey)
           install.ps1
           uninstall.ps1
           INSTALL.txt             (plain-text quick-start for IT teams)
           docs\
             deployment-guide.md
             troubleshooting.md
    4. Creates MysoftAgent-v{version}-win-x64.zip in agent\dist\
    5. Prints SHA-256 of the ZIP for integrity verification

.PARAMETER SkipBuild
    Skip the dotnet build step. Use this if you have already run build.ps1
    and just want to repackage from the existing publish\ output.

.PARAMETER OutputDir
    Where to write the dist folder and ZIP. Default: .\dist

.EXAMPLE
    .\package.ps1

.EXAMPLE
    .\package.ps1 -SkipBuild -OutputDir "C:\Releases"
#>
param(
    [switch]$SkipBuild,
    [string]$OutputDir = (Join-Path $PSScriptRoot 'dist')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
Write-Host '  Mysoft Integration Agent — Package'               -ForegroundColor Cyan
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
Write-Host ''

# ── Read version from csproj ─────────────────────────────────────────────────
$csprojPath = Join-Path $PSScriptRoot 'MysoftAgent\MysoftAgent.csproj'
if (-not (Test-Path $csprojPath)) {
    Write-Error "MysoftAgent.csproj not found at: $csprojPath"
    exit 1
}

[xml]$csproj = Get-Content $csprojPath
$version = $csproj.Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1
if (-not $version) {
    Write-Warning "Version not found in csproj — defaulting to 0.0.0"
    $version = '0.0.0'
}
Write-Host "Version : $version"

# ── Build ─────────────────────────────────────────────────────────────────────
$publishDir = Join-Path $PSScriptRoot 'publish'
$exeSource  = Join-Path $publishDir 'MysoftAgent.exe'

if (-not $SkipBuild) {
    Write-Host "Building..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'build.ps1')
    if ($LASTEXITCODE -ne 0) {
        Write-Error "build.ps1 failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} else {
    Write-Host "Skipping build (using existing publish\ output)" -ForegroundColor Yellow
}

if (-not (Test-Path $exeSource)) {
    Write-Error "MysoftAgent.exe not found at: $exeSource`nRun build.ps1 first, or omit -SkipBuild."
    exit 1
}

# ── Assemble dist folder ──────────────────────────────────────────────────────
$packageName = "MysoftAgent-v${version}-win-x64"
$packageDir  = Join-Path $OutputDir $packageName

Write-Host "Assembling package: $packageDir" -ForegroundColor Cyan

# Clean and recreate
if (Test-Path $packageDir) { Remove-Item $packageDir -Recurse -Force }
New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $packageDir 'docs') -Force | Out-Null

# Executable
Copy-Item $exeSource (Join-Path $packageDir 'MysoftAgent.exe')

# Config template
$settingsTemplate = @'
{
  "MysoftAgent": {
    "ApiBaseUrl": "https://mysoft-integration-platform.vercel.app/api/v1",
    "ApiKey": "",
    "LogPath": "C:\\ProgramData\\MysoftAgent\\logs"
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
          "path": "C:\\ProgramData\\MysoftAgent\\logs\\agent-.log",
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
'@
$settingsTemplate | Set-Content -Path (Join-Path $packageDir 'appsettings.json') -Encoding UTF8

# Scripts
Copy-Item (Join-Path $PSScriptRoot 'install.ps1')   (Join-Path $packageDir 'install.ps1')
Copy-Item (Join-Path $PSScriptRoot 'uninstall.ps1') (Join-Path $packageDir 'uninstall.ps1')

# Plain-text install instructions (for IT teams without Markdown viewers)
$installTxt = @"
MYSOFT INTEGRATION AGENT v$version
===================================

QUICK INSTALL
-------------
1. Ensure .NET 8 Runtime is installed:
   https://aka.ms/dotnet/8.0/dotnet-runtime-win-x64.exe

2. Obtain an API key from the Mysoft Integration Platform:
   Settings -> API Keys -> Generate new key
   (Copy the key -- it is shown only once)

3. Open PowerShell as Administrator and run:

   cd C:\Path\To\This\Folder
   .\install.ps1 -ApiKey "mip_xxxxxxxxxxxxxxxxxx"

4. Configure your watched folder(s) in the platform:
   Settings -> Integrations -> Watchers -> Add watcher

5. Verify the service is running:
   Get-Service MysoftIntegrationAgent

   View live logs:
   Get-Content "C:\ProgramData\MysoftAgent\logs\agent-*.log" -Tail 20 -Wait


UPGRADE
-------
   .\install.ps1     (no -ApiKey needed -- existing key is preserved)


UNINSTALL
---------
   .\uninstall.ps1              (service only)
   .\uninstall.ps1 -RemoveFiles (service + all files and logs)


SUPPORT
-------
For detailed guidance, see:
  docs\deployment-guide.md   -- full IT admin guide
  docs\troubleshooting.md    -- common errors and fixes

Contact Mysoft support: support@mysoft.co.uk
"@
$installTxt | Set-Content -Path (Join-Path $packageDir 'INSTALL.txt') -Encoding UTF8

# Docs
$docsDir = Join-Path $PSScriptRoot 'docs'
if (Test-Path $docsDir) {
    Get-ChildItem $docsDir -Filter '*.md' | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $packageDir 'docs' $_.Name)
    }
}

# CHANGELOG
$changelog = Join-Path $PSScriptRoot 'CHANGELOG.md'
if (Test-Path $changelog) {
    Copy-Item $changelog (Join-Path $packageDir 'CHANGELOG.md')
}

# README
$readme = Join-Path $PSScriptRoot 'README.md'
if (Test-Path $readme) {
    Copy-Item $readme (Join-Path $packageDir 'README.md')
}

# ── Create ZIP ────────────────────────────────────────────────────────────────
$zipPath = Join-Path $OutputDir "${packageName}.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Write-Host "Creating ZIP: $zipPath" -ForegroundColor Cyan
Compress-Archive -Path "$packageDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

# ── SHA-256 of the ZIP ────────────────────────────────────────────────────────
$hash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower()

# Write hash file alongside the ZIP
"$hash  ${packageName}.zip" | Set-Content -Path (Join-Path $OutputDir "${packageName}.zip.sha256") -Encoding ASCII

# ── Summary ───────────────────────────────────────────────────────────────────
$zipSize = (Get-Item $zipPath).Length / 1MB

Write-Host ''
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Green
Write-Host "  Package complete!" -ForegroundColor Green
Write-Host ''
Write-Host ("  ZIP    : $zipPath") -ForegroundColor Green
Write-Host ("  Size   : {0:N1} MB" -f $zipSize) -ForegroundColor Green
Write-Host "  SHA-256: $hash" -ForegroundColor Green
Write-Host ''
Write-Host "  Package contents:" -ForegroundColor Gray
Get-ChildItem $packageDir -Recurse | ForEach-Object {
    $rel = $_.FullName.Substring($packageDir.Length + 1)
    if ($_.PSIsContainer) {
        Write-Host "    $rel\" -ForegroundColor DarkGray
    } else {
        $sz = if ($_.Length -ge 1MB) { "{0:N1} MB" -f ($_.Length / 1MB) } else { "{0:N0} KB" -f ($_.Length / 1KB) }
        Write-Host ("    {0,-45} {1,8}" -f $rel, $sz) -ForegroundColor Gray
    }
}
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Green
Write-Host ''
Write-Host "Deliver $zipPath to the customer's IT team." -ForegroundColor White
Write-Host "Provide the SHA-256 hash for integrity verification:" -ForegroundColor Gray
Write-Host "  $hash" -ForegroundColor DarkCyan
Write-Host ''
