# Mysoft Integration Agent

**Version 1.0.0** · Windows Service · .NET 8 · x64

A lightweight Windows background service that monitors local (or network) folders for new data files and automatically uploads them to the **Mysoft Integration Platform** for processing into Sage Intacct.

---

## How it works

```
Watched folder          Agent                      Platform              Intacct
─────────────          ─────                      ────────              ───────
payroll.csv  ──FSW──►  SHA-256 hash               POST /check
                       ──────────►  duplicate? ─► no: POST /ingest ──► process ──► GL entry
                                                   yes: archive, skip
```

1. **Detects** new files via `FileSystemWatcher` (real-time) + polling fallback (every 5 min by default)
2. **Waits** for the file to finish writing — probes for exclusive open before proceeding
3. **Deduplicates** — hashes the file with SHA-256 and checks against already-processed jobs
4. **Uploads** to the platform with the tenant API key
5. **Archives** (moves / deletes / leaves) the file based on your watcher configuration
6. **Retries** failed uploads with exponential backoff (3 attempts: immediately, +2s, +4s)
7. **Heartbeats** every 5 minutes so the platform knows the agent is alive
8. **Refreshes config** every 10 minutes — watcher changes made in the platform UI take effect without a restart

---

## Quick start

### Prerequisites

| Requirement | Details |
|-------------|---------|
| OS | Windows 10 / Windows Server 2016 or later (x64) |
| .NET 8 Runtime | [Download](https://aka.ms/dotnet/8.0/dotnet-runtime-win-x64.exe) — Runtime only, not SDK |
| API key | Tenant Admin → Settings → API Keys → Generate |
| Network | Outbound HTTPS to `mysoft-integration-platform.vercel.app` on port 443 |

### 1. Obtain an API key

1. Log in to the platform as a **Tenant Admin**
2. Navigate to **Settings → API Keys**
3. Click **Generate new key**, give it a name (e.g. `Windows Agent — SERVER01`)
4. Copy the key — it is shown **once only**

### 2. Configure watcher(s) in the platform

1. Navigate to **Settings → Integrations → Watchers**
2. Click **Add watcher**
3. Set: folder path, file pattern (e.g. `payroll_*.csv`), mapping, archive action
4. Save and enable the watcher

### 3. Install the agent

```powershell
# Run PowerShell as Administrator
cd C:\MysoftAgent

.\install.ps1 -ApiKey "mip_xxxxxxxxxxxxxxxxxx"
```

The service starts automatically and picks up your watcher configuration from the platform.

### 4. Verify

```powershell
# Check service is running
Get-Service MysoftIntegrationAgent

# Watch live logs
Get-Content "C:\ProgramData\MysoftAgent\logs\agent-*.log" -Tail 20 -Wait
```

---

## Installation in detail

### Building from source

You need the [.NET 8 SDK](https://aka.ms/dotnet/8.0/dotnet-sdk-win-x64.exe) on your build machine (not required on the target server — output is self-contained).

```powershell
cd agent
.\build.ps1
# Output: agent/publish/MysoftAgent.exe  (~70 MB self-contained)
```

Copy the contents of `agent/publish/` plus `install.ps1` and `uninstall.ps1` to the target machine.

Alternatively use `package.ps1` to produce a ready-to-deploy ZIP:
```powershell
.\package.ps1
# Output: agent/dist/MysoftAgent-v1.0.0-win-x64.zip
```

### `install.ps1` parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `-ApiKey` | *(required for new install)* | API key from Settings → API Keys |
| `-ApiBaseUrl` | `https://mysoft-integration-platform.vercel.app/api/v1` | Platform API URL |
| `-InstallPath` | `C:\Program Files\MysoftAgent` | Where the exe is installed |
| `-LogPath` | `C:\ProgramData\MysoftAgent\logs` | Rolling log file folder |
| `-ServiceName` | `MysoftIntegrationAgent` | Windows Service identifier |
| `-SourceExe` | `.\MysoftAgent.exe` | Path to the exe to install |

**Upgrade in-place** (preserves existing API key):
```powershell
.\install.ps1   # no -ApiKey needed — read from existing appsettings.json
```

### Securing the API key

For production, store the key in an environment variable rather than a config file:

```powershell
# Set at machine level (survives reboots)
[System.Environment]::SetEnvironmentVariable(
    "MysoftAgent__ApiKey",
    "mip_xxxxxxxxxxxxxxxxxx",
    [System.EnvironmentVariableTarget]::Machine)
```

Leave `ApiKey` blank in `appsettings.json`. The `__` double-underscore maps to nested config in .NET.

---

## Watcher behaviour

Watcher configuration lives in the platform (Settings → Integrations → Watchers). The agent pulls it on startup and refreshes every 10 minutes.

### Archive actions

| `archive_action` | What happens after a successful upload |
|------------------|---------------------------------------|
| `move` *(default)* | Moved to `archive_folder` (or `{watch_folder}\processed\`). Timestamp suffix added on name collision. |
| `delete` | Deleted immediately after upload |
| `leave` | Left in place — not recommended; will be deduplicated on next poll but creates noise |

### File patterns

| Pattern | Matches |
|---------|---------|
| `*.csv` | All CSV files |
| `payroll_*.csv` | Files starting with `payroll_` |
| `*.xlsx` | All Excel files |
| `export_????-??-??.csv` | Date-stamped exports |

---

## Logging

Logs are written to `C:\ProgramData\MysoftAgent\logs\` by default.

- **Rolling daily** — one file per day, e.g. `agent-20260316.log`
- **30-day retention**, 10 MB max per file
- **Warnings and errors** also written to Windows Event Log (Application → MysoftIntegrationAgent)

```powershell
# Tail live
Get-Content "C:\ProgramData\MysoftAgent\logs\agent-$(Get-Date -Format yyyyMMdd).log" -Wait

# Errors only
Get-Content "C:\ProgramData\MysoftAgent\logs\agent-*.log" | Select-String "\[ERR\]|\[WRN\]"

# Windows Event Log (warnings+)
Get-EventLog -LogName Application -Source MysoftIntegrationAgent -Newest 20
```

---

## Service management

```powershell
Get-Service     MysoftIntegrationAgent        # Status
Start-Service   MysoftIntegrationAgent        # Start
Stop-Service    MysoftIntegrationAgent        # Stop
Restart-Service MysoftIntegrationAgent        # Restart

.\uninstall.ps1               # Remove service (files kept)
.\uninstall.ps1 -RemoveFiles  # Remove service + all files + logs
```

The service has **automatic restart recovery**: restarts after 60s for the first two failures, then after 5 minutes.

---

## Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md) for the full guide.

| Symptom | First check |
|---------|-------------|
| Service won't start | `appsettings.json` syntax valid; API key not blank |
| Files not picked up | Folder path exists; pattern matches filename; watcher enabled |
| 401 Unauthorized | API key revoked — generate a new one in Settings → API Keys |
| Duplicate skip (expected) | SHA-256 matches a previous upload — file already processed |
| File stays locked 60s | Another process still writing; agent logs a warning and skips |
| No log file created | Check Event Viewer for startup errors; verify log path permissions |

---

## Security notes

- API key grants upload access scoped to a single tenant — treat it like a password
- Store in environment variable (`MysoftAgent__ApiKey`) in production, not config file
- Service makes **outbound HTTPS only** — no inbound ports opened
- TLS 1.2+ enforced for all platform communication
- SHA-256 deduplication prevents re-sending even if the service restarts unexpectedly

---

## Further reading

- [Deployment Guide](docs/deployment-guide.md) — full IT admin deployment, domain accounts, group policy
- [Troubleshooting](docs/troubleshooting.md) — complete error reference
- [Changelog](CHANGELOG.md) — version history
