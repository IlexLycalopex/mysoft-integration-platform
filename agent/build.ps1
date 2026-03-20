#Requires -Version 5.1
<#
.SYNOPSIS
    Builds and publishes the Mysoft Integration Agent as a self-contained Windows executable.

.PARAMETER Configuration
    Build configuration: Release (default) or Debug.

.PARAMETER OutputPath
    Destination folder for the published output. Default: ./publish

.EXAMPLE
    .\build.ps1
    .\build.ps1 -Configuration Debug -OutputPath C:\Temp\AgentBuild
#>
param(
    [ValidateSet('Release', 'Debug')]
    [string]$Configuration = 'Release',

    [string]$OutputPath = (Join-Path $PSScriptRoot 'publish')
)

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
Write-Host '  Mysoft Integration Agent — Build'      -ForegroundColor Cyan
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan
Write-Host ''

# Verify dotnet is available
if (-not (Get-Command 'dotnet' -ErrorAction SilentlyContinue)) {
    Write-Error '.NET SDK is not installed or not on PATH. Download from https://dotnet.microsoft.com/download'
    exit 1
}

$dotnetVersion = (dotnet --version)
Write-Host "Using .NET SDK $dotnetVersion"

$projectPath = Join-Path $PSScriptRoot 'MysoftAgent\MysoftAgent.csproj'

if (-not (Test-Path $projectPath)) {
    Write-Error "Project file not found: $projectPath"
    exit 1
}

Write-Host "Publishing $Configuration build to: $OutputPath"
Write-Host ''

dotnet publish $projectPath `
    --configuration $Configuration `
    --runtime win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    --output $OutputPath

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

$exePath = Join-Path $OutputPath 'MysoftAgent.exe'
if (Test-Path $exePath) {
    $size = (Get-Item $exePath).Length / 1MB
    Write-Host ''
    Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Green
    Write-Host "  Build complete!" -ForegroundColor Green
    Write-Host "  Output : $exePath"  -ForegroundColor Green
    Write-Host ("  Size   : {0:N1} MB" -f $size) -ForegroundColor Green
    Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Green
} else {
    Write-Error "Build succeeded but MysoftAgent.exe not found at $exePath"
    exit 1
}
