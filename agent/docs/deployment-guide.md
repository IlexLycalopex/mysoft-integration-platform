# Deployment Guide — Mysoft Integration Agent

**Audience:** IT administrators deploying the agent to on-premises or hosted Windows environments.

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Build](#2-build)
3. [Package for distribution](#3-package-for-distribution)
4. [Install on target server](#4-install-on-target-server)
5. [Post-install verification](#5-post-install-verification)
6. [Service account configuration](#6-service-account-configuration)
7. [Group Policy / mass deployment](#7-group-policy--mass-deployment)
8. [Upgrading](#8-upgrading)
9. [Uninstalling](#9-uninstalling)
10. [Firewall and proxy](#10-firewall-and-proxy)
11. [Security hardening](#11-security-hardening)

---

## 1. Prerequisites

### Build machine (Mysoft internal / developer machine)

| Requirement | Version | Download |
|-------------|---------|----------|
| Windows | 10 / Server 2016+ | — |
| .NET 8 SDK | 8.0.x | https://aka.ms/dotnet/8.0/dotnet-sdk-win-x64.exe |
| Git | Any | https://git-scm.com |
| PowerShell | 5.1+ (built into Windows) | — |

### Target server (customer environment)

| Requirement | Version | Notes |
|-------------|---------|-------|
| Windows | 10 / Server 2016+ (x64) | Server 2019 or 2022 recommended |
| .NET 8 Runtime | 8.0.x | Runtime only — SDK not needed |
| Outbound HTTPS | Port 443 | To `mysoft-integration-platform.vercel.app` |
| Disk space | 200 MB | 70 MB exe + logs |
| RAM | 64 MB | Typical idle usage < 30 MB |

Install .NET 8 Runtime (if not already present):
```powershell
# Check existing
dotnet --list-runtimes

# Download and install silently (run as admin)
$url = "https://aka.ms/dotnet/8.0/dotnet-runtime-win-x64.exe"
Invoke-WebRequest -Uri $url -OutFile "$env:TEMP\dotnet-runtime.exe"
Start-Process "$env:TEMP\dotnet-runtime.exe" -ArgumentList "/quiet /norestart" -Wait
```

---

## 2. Build

From the repository root on your build machine:

```powershell
cd agent
.\build.ps1
```

This runs `dotnet publish` with:
- Target: `win-x64`
- Self-contained: `true` (no .NET installation needed on target — except the runtime is bundled)
- Single-file: `true`
- Compressed: `true`

Output: `agent\publish\MysoftAgent.exe` (~70 MB)

### Build with a specific version

The version is set in `MysoftAgent\MysoftAgent.csproj`. Update before a release:

```xml
<Version>1.1.0</Version>
<AssemblyVersion>1.1.0.0</AssemblyVersion>
<FileVersion>1.1.0.0</FileVersion>
```

Then:
```powershell
.\build.ps1
.\package.ps1  # creates dist\MysoftAgent-v1.1.0-win-x64.zip
```

---

## 3. Package for distribution

```powershell
cd agent
.\package.ps1
```

This:
1. Runs `build.ps1` to compile
2. Creates `agent\dist\MysoftAgent-v{version}\` with:
   - `MysoftAgent.exe`
   - `appsettings.json` (template)
   - `install.ps1`
   - `uninstall.ps1`
   - `INSTALL.txt` (plain-text quick start)
   - `docs\` folder
3. Zips to `agent\dist\MysoftAgent-v{version}-win-x64.zip`

The ZIP is the deliverable to hand to the customer's IT team.

---

## 4. Install on target server

### Step 1 — Copy files

Transfer `MysoftAgent-v{version}-win-x64.zip` to the target server. Extract to a temporary folder, e.g. `C:\Temp\MysoftAgent-setup\`.

### Step 2 — Obtain an API key

Before running the installer you need an API key for this agent:

1. Log into the **Mysoft Integration Platform** as a Tenant Admin for the relevant customer
2. Navigate to **Settings → API Keys**
3. Click **Generate new key**
4. Name it something identifiable: `SERVER01 — Payroll Agent`
5. Copy the full key (shown once only): `mip_xxxxxxxxxxxxxxxxxxxx`

### Step 3 — Run the installer

```powershell
# Open PowerShell as Administrator
cd C:\Temp\MysoftAgent-setup

.\install.ps1 -ApiKey "mip_xxxxxxxxxxxxxxxxxxxx"
```

Optional parameters:
```powershell
.\install.ps1 `
    -ApiKey         "mip_xxxxxxxxxxxxxxxxxxxx" `
    -ApiBaseUrl     "https://mysoft-integration-platform.vercel.app/api/v1" `
    -InstallPath    "C:\Program Files\MysoftAgent" `
    -LogPath        "C:\ProgramData\MysoftAgent\logs" `
    -ServiceName    "MysoftIntegrationAgent"
```

The installer:
- Copies `MysoftAgent.exe` to the install path
- Writes `appsettings.json` with your API key and log path
- Creates the log directory
- Registers the Windows Service (startup type: Automatic)
- Configures service recovery (restart on failure)
- Starts the service

### Step 4 — Configure watchers in the platform

The agent fetches its watcher configuration from the platform. After installation, set up at least one watcher:

1. Log into the platform as Tenant Admin
2. Navigate to **Settings → Integrations → Watchers**
3. Add a watcher:
   - **Source type:** Local folder
   - **Folder path:** UNC or local path the agent can access (e.g. `C:\Exports\Payroll` or `\\FS01\Payroll\exports`)
   - **File pattern:** e.g. `*.csv`
   - **Mapping:** choose an existing field mapping template
   - **Archive action:** `move` (recommended)
   - **Archive folder:** e.g. `C:\Exports\Payroll\processed`
4. Enable the watcher and save

The agent picks up the new watcher within 10 minutes (on next config refresh), or immediately after a service restart.

---

## 5. Post-install verification

```powershell
# 1. Service running?
Get-Service MysoftIntegrationAgent
# Expected: Status = Running

# 2. Logs appearing?
Get-Content "C:\ProgramData\MysoftAgent\logs\agent-$(Get-Date -Format yyyyMMdd).log" -Tail 20
# Expected: lines like:
#   [INF] Mysoft Integration Agent starting up
#   [INF] Fetching config from platform...
#   [INF] Config refreshed — 1 watcher(s) active
#   [INF] Watcher 'Payroll Export': starting on 'C:\Exports\Payroll' (pattern=*.csv)

# 3. Heartbeat reaching the platform?
# Check Settings → API Keys in the platform — the key's "Last used" should update within 5 minutes.

# 4. Test file upload
# Drop a correctly-formatted CSV into the watched folder.
# Within seconds, the log should show:
#   [INF] Watcher 'Payroll Export': detected file 'test.csv'
#   [INF] Watcher 'Payroll Export': uploading 'test.csv'...
#   [INF] Watcher 'Payroll Export': uploaded 'test.csv' — job abc123
```

---

## 6. Service account configuration

By default the service runs as **Local System**. For production, run under a dedicated **Managed Service Account (MSA)** or a standard domain service account.

### Option A — Group Managed Service Account (gMSA) — recommended for domain environments

```powershell
# On a Domain Controller (run once per organisation):
New-ADServiceAccount -Name "MysoftAgentSvc" `
    -DNSHostName "mysoftagentsvc.domain.local" `
    -PrincipalsAllowedToRetrieveManagedPassword "SERVER01$"

# On the target server:
Install-ADServiceAccount "MysoftAgentSvc"
Test-ADServiceAccount "MysoftAgentSvc"  # Should return True

# Reconfigure the service
sc.exe config MysoftIntegrationAgent obj= "domain\MysoftAgentSvc$" password= ""
```

### Option B — Standard local service account

```powershell
# Create local account
$pw = ConvertTo-SecureString "P@ssw0rdH3re!" -AsPlainText -Force
New-LocalUser "MysoftAgentSvc" -Password $pw -PasswordNeverExpires -Description "Mysoft Agent service account"

# Grant "Log on as a service" right
# Computer Configuration → Windows Settings → Security Settings →
#   Local Policies → User Rights Assignment → Log on as a service

# Reconfigure
sc.exe config MysoftIntegrationAgent obj= ".\MysoftAgentSvc" password= "P@ssw0rdH3re!"
Restart-Service MysoftIntegrationAgent
```

### Folder permissions

The service account needs:
- **Read** on the watched folder
- **Read + Write + Delete** on the archive folder (if using `move`)
- **Write** on the log path (`C:\ProgramData\MysoftAgent\logs`)

```powershell
# Grant access (replace with your paths and account)
$account = ".\MysoftAgentSvc"
icacls "C:\Exports\Payroll"           /grant "${account}:(R,RD)"       /T
icacls "C:\Exports\Payroll\processed" /grant "${account}:(M)"           /T
icacls "C:\ProgramData\MysoftAgent"   /grant "${account}:(OI)(CI)(M)"  /T
```

---

## 7. Group Policy / mass deployment

For rollout to multiple servers, use a startup script or software deployment tool (SCCM, Intune, PDQ Deploy).

### Silent install script (no interaction required)

```powershell
# deploy-agent.ps1 — run as SYSTEM or Admin
param(
    [string]$SharePath  = "\\FS01\IT\MysoftAgent",
    [string]$ApiKey     = "",       # set per-machine or via config management
    [string]$ApiBaseUrl = "https://mysoft-integration-platform.vercel.app/api/v1"
)

$ErrorActionPreference = 'Stop'

# Copy files locally
$dest = "C:\Temp\MysoftAgent-setup"
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item "$SharePath\*" $dest -Recurse -Force

# Install
& "$dest\install.ps1" -ApiKey $ApiKey -ApiBaseUrl $ApiBaseUrl

# Clean up
Remove-Item $dest -Recurse -Force
```

### API key management per machine

Rather than hardcoding the API key in a deployment script, use an environment variable set via GPO or your secrets management tool:

**GPO:** Computer Configuration → Windows Settings → Scripts → Startup

```powershell
# GPO startup script — sets per-machine API key from GPO preference variable
[System.Environment]::SetEnvironmentVariable(
    "MysoftAgent__ApiKey",
    $env:MYSOFT_AGENT_KEY,   # set as a GPO preference environment variable
    [System.EnvironmentVariableTarget]::Machine)
```

**SCCM / Intune:** Use application secrets or Azure Key Vault references.

---

## 8. Upgrading

```powershell
# On the target server, from the new package folder (run as Admin):
.\install.ps1   # no -ApiKey needed — existing key is read from appsettings.json
```

The installer stops the service, replaces the exe, and restarts.

To upgrade multiple servers simultaneously, use your deployment tool with the silent install approach above.

---

## 9. Uninstalling

```powershell
# Remove service only (files and logs kept)
.\uninstall.ps1

# Full removal
.\uninstall.ps1 -RemoveFiles
```

After uninstalling, revoke the API key in the platform under **Settings → API Keys** to prevent unauthorised use.

---

## 10. Firewall and proxy

### Firewall rules

The agent only makes **outbound** HTTPS connections. No inbound rules are needed.

| Direction | Protocol | Port | Destination |
|-----------|----------|------|-------------|
| Outbound | TCP / HTTPS | 443 | `mysoft-integration-platform.vercel.app` |
| Outbound | TCP / HTTPS | 443 | `api.vercel.com` (Vercel edge network) |

If your organisation uses IP allowlisting, Vercel's edge IPs can be found at:
https://vercel.com/docs/security/accessing-vercel-deployments

### Web proxy

If the server routes outbound traffic through a proxy, set the standard .NET environment variables before starting the service:

```powershell
[System.Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://proxy.corp.local:8080", "Machine")
[System.Environment]::SetEnvironmentVariable("NO_PROXY", "localhost,127.0.0.1", "Machine")
```

Or configure in `appsettings.json` using `System.Net.Http.IWebProxy` if your proxy requires NTLM authentication.

---

## 11. Security hardening

| Control | Recommendation |
|---------|----------------|
| Service account | Dedicated MSA / gMSA — not Local System |
| API key storage | Environment variable, not `appsettings.json` |
| Folder permissions | Minimum: service account read-only on source, write on archive |
| Log access | Restrict `C:\ProgramData\MysoftAgent\logs` to Admins + service account |
| API key rotation | Rotate annually or on staff change — generate new key in platform before revoking old |
| Network | Restrict outbound to required Vercel endpoints only |
| Exe integrity | Verify file hash after copying from share: `(Get-FileHash MysoftAgent.exe).Hash` |
| Audit | Monitor Windows Event Log for service start/stop events (Event ID 7036) |

---

*For troubleshooting, see [troubleshooting.md](troubleshooting.md).*
*For version history, see [../CHANGELOG.md](../CHANGELOG.md).*
