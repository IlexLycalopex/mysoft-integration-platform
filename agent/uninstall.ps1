#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Stops and removes the Mysoft Integration Agent Windows Service.

.PARAMETER ServiceName
    Windows Service name. Default: MysoftIntegrationAgent

.PARAMETER RemoveFiles
    If specified, also deletes the install directory and log files.

.PARAMETER InstallPath
    Install directory (only used if -RemoveFiles is specified). Default: C:\Program Files\MysoftAgent

.PARAMETER LogPath
    Log directory (only used if -RemoveFiles is specified). Default: C:\ProgramData\MysoftAgent\logs
#>
param(
    [string]$ServiceName = 'MysoftIntegrationAgent',
    [switch]$RemoveFiles,
    [string]$InstallPath = 'C:\Program Files\MysoftAgent',
    [string]$LogPath = 'C:\ProgramData\MysoftAgent\logs'
)

$ErrorActionPreference = 'Stop'

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Warning "Service '$ServiceName' not found — nothing to uninstall."
    exit 0
}

Write-Host "Stopping service '$ServiceName'..."
Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "Deleting service '$ServiceName'..."
sc.exe delete $ServiceName | Out-Null

if ($RemoveFiles) {
    if (Test-Path $InstallPath) {
        Write-Host "Removing install directory: $InstallPath"
        Remove-Item -Path $InstallPath -Recurse -Force
    }
    if (Test-Path $LogPath) {
        Write-Host "Removing log directory: $LogPath"
        Remove-Item -Path $LogPath -Recurse -Force
    }
}

Write-Host "Uninstall complete." -ForegroundColor Green
