# Troubleshooting — Mysoft Integration Agent

---

## Quick diagnostics

```powershell
# 1. Is the service running?
Get-Service MysoftIntegrationAgent

# 2. Last 50 log lines
Get-Content "C:\ProgramData\MysoftAgent\logs\agent-*.log" | Select-Object -Last 50

# 3. Recent errors and warnings only
Get-Content "C:\ProgramData\MysoftAgent\logs\agent-*.log" | Select-String "\[ERR\]|\[WRN\]" | Select-Object -Last 20

# 4. Windows Event Log
Get-EventLog -LogName Application -Source MysoftIntegrationAgent -Newest 20

# 5. Test network connectivity to the platform
Test-NetConnection -ComputerName mysoft-integration-platform.vercel.app -Port 443
```

---

## Service issues

### Service won't start

**Symptom:** `Get-Service MysoftIntegrationAgent` shows `Stopped`; attempting to start gives an error.

**Check 1 — appsettings.json syntax**
```powershell
# Parse the JSON — will throw on syntax error
Get-Content "C:\Program Files\MysoftAgent\appsettings.json" | ConvertFrom-Json
```
Fix any JSON syntax errors (missing comma, unmatched bracket, unescaped backslash — use `\\` not `\`).

**Check 2 — API key present**
Open `C:\Program Files\MysoftAgent\appsettings.json` and verify `ApiKey` is not empty, or that the environment variable `MysoftAgent__ApiKey` is set.

**Check 3 — .NET 8 Runtime installed**
```powershell
dotnet --list-runtimes
# Should include: Microsoft.NETCore.App 8.x.x
```
If missing: [download and install](https://aka.ms/dotnet/8.0/dotnet-runtime-win-x64.exe).

**Check 4 — Event Viewer for startup exception**
Open Event Viewer → Windows Logs → Application → filter by source `MysoftIntegrationAgent`. The exception message and stack trace will be there.

**Check 5 — Permissions on log path**
```powershell
# The service account must be able to write to the log directory
icacls "C:\ProgramData\MysoftAgent\logs"
```

---

### Service starts then stops immediately

Usually a crash on startup. See Check 4 above (Event Viewer). Common causes:

- `ApiBaseUrl` is invalid or unreachable
- `appsettings.json` has a `Serilog` configuration error (e.g. invalid sink path)
- .NET runtime version mismatch

---

### Service keeps restarting

The service is configured to restart automatically on failure. If it's cycling, check Event Viewer for the crash reason. Common causes:

- Platform unreachable (check firewall / proxy — see [deployment-guide.md](deployment-guide.md#10-firewall-and-proxy))
- Persistent config fetch failure after startup (rate-limited or auth rejected)

---

## File detection issues

### Files are not being picked up

**Check 1 — Watcher enabled in the platform**
Settings → Integrations → Watchers → confirm the watcher is enabled and the folder path matches exactly.

**Check 2 — Folder path exists and is accessible**
```powershell
# Does the path exist from the server?
Test-Path "C:\Exports\Payroll"

# For UNC paths:
Test-Path "\\FS01\Payroll\exports"
```

If the service runs under a specific account (not Local System), that account needs read access.

**Check 3 — File pattern matches**
The pattern `*.csv` will match `payroll.csv` but not `payroll.CSV` on case-sensitive file systems. Use a pattern that matches your actual filenames.

**Check 4 — File arrives and disappears too quickly**
If another process moves or deletes the file before the agent reads it, the agent will log a warning but take no action. Check if an upstream process is touching the file.

**Check 5 — Check the log for "skipped" messages**
```powershell
Get-Content "C:\ProgramData\MysoftAgent\logs\agent-*.log" | Select-String "skip|not ready|locked"
```

---

### Files are detected but upload fails

**Check the log for the specific error:**
```powershell
Get-Content "C:\ProgramData\MysoftAgent\logs\agent-*.log" | Select-String "upload fail|ERR"
```

Common upload errors:

| Log message | Cause | Fix |
|-------------|-------|-----|
| `Unauthorized` / `401` | API key revoked, expired, or wrong | Generate a new key in Settings → API Keys |
| `Not Found` / `404` | Wrong `ApiBaseUrl` | Check `appsettings.json` — should end with `/api/v1` |
| `connection refused` / `unable to connect` | Network / firewall blocking port 443 | See [firewall section](deployment-guide.md#10-firewall-and-proxy) |
| `SSL/TLS` error | Corporate proxy intercepting TLS | Configure proxy trust store or bypass |
| `Storage upload failed: The resource already exists` | Platform storage collision | Rare; retry will succeed |

---

### File stays "locked" for 60 seconds then skipped

**Cause:** The writing process did not release its file lock within 60 seconds.

This is expected for very large files or slow network shares. The agent logs:
```
[WRN] Watcher '{Name}': file '{File}' not ready after 60s — skipping
```

**Fixes:**
- Increase the wait timeout (requires code change — contact Mysoft)
- Ensure the writing process closes the file handle before the agent watches the folder
- Use a staging folder: write the file to `staging\`, then move it atomically to the watched folder (`move` is atomic on the same volume)

---

### Same file uploaded repeatedly

**Cause:** `archive_action = leave` — the file is never moved or deleted.

**Fix:** Change the archive action in the platform (Settings → Integrations → Watchers) to `move` or `delete`. The SHA-256 deduplication will reject re-uploads, but the log will fill with "duplicate" messages.

---

## Duplicate / deduplication issues

### File skipped as duplicate but it shouldn't be

The agent computes a SHA-256 hash of the file content. If the content is byte-for-byte identical to a previous upload, it will be treated as a duplicate regardless of filename.

**Cause:** The upstream system is generating files with identical content. Common with:
- Reports that always include the same historical data
- Test files re-used without modification

**Fix:** Ensure the file content is genuinely different (e.g. the upstream system should always generate a new export, not copy an old one). If the same data genuinely needs to be resubmitted, modify the file slightly (e.g. add a run timestamp in a comment row).

**Check existing job:** The "duplicate" log message includes the existing job ID:
```
[INF] Watcher '...': 'payroll.csv' is a duplicate (existing job abc123-...) — archiving without upload
```
Navigate to `/jobs/abc123-...` in the platform to see the original job.

---

## Platform / Intacct processing issues

These errors occur after the file is successfully uploaded — check the job's processing log in the platform (Jobs → View log).

### XL03000006 — Sender not authorized

```
errorno: XL03000006
description: You are not authorized to use Web Services under the company...
```

**Fix:** In Sage Intacct, go to **Company Admin → Web Services Authorizations** and add your Sender ID. The Sender ID is configured in the platform under **Platform → Settings → Intacct Sender Credentials**. Ask your Mysoft consultant for the correct Sender ID value.

---

### BL03000018 — Missing Location dimension

```
errorno: BL03000018
description: Missing the Location dimension for Account XXXXX
```

**Fix:** Set the Entity ID in the platform credentials. Navigate to **Settings → Integrations → Credentials**, enter the Entity / Location ID for the correct Sage Intacct entity, and save. The Entity ID can be found in Intacct under **General Ledger → Setup → Locations**.

---

### Date format not recognised

The platform supports UK (DD/MM/YYYY, default), US (MM/DD/YYYY), and ISO (YYYY-MM-DD) formats. If dates are being rejected or misread:

1. Check the `region` setting for the tenant (platform admin → Tenant → Settings)
2. Use ISO format (YYYY-MM-DD) to eliminate ambiguity
3. Check the date column in the source CSV matches the expected format

---

### Job stuck in `processing`

**Cause:** The serverless function timed out before completing (rare — Vercel has a 60s limit).

**Fix:** Use the **Process** button on the Job detail page to re-trigger processing. If it consistently times out, the file may be too large — split it into smaller batches.

---

## API key issues

### "Last used" never updates in the platform

The key's `last_used_at` is updated on every authenticated API call (heartbeat, check, upload). If it's not updating:

1. Confirm the agent is actually running: `Get-Service MysoftIntegrationAgent`
2. Check the log for heartbeat messages: `Select-String "heartbeat" agent-*.log`
3. Verify `ApiBaseUrl` points to the correct platform URL

### Key was lost / only shown once

Generate a new key:
1. Settings → API Keys → Generate new key
2. Update `appsettings.json` on the server (or the `MysoftAgent__ApiKey` environment variable)
3. Restart the service: `Restart-Service MysoftIntegrationAgent`
4. Revoke the old key from the API Keys list

---

## Log file issues

### No log files created

**Check 1 — Log directory permissions**
The service account needs write access to the log path configured in `appsettings.json`.

**Check 2 — Log path in appsettings**
Backslashes in JSON must be doubled: `"C:\\ProgramData\\MysoftAgent\\logs"` not `"C:\ProgramData\MysoftAgent\logs"`.

**Check 3 — Startup error (before Serilog initialised)**
Check Windows Event Viewer → Application for errors from `MysoftIntegrationAgent` before the log file was created.

---

## Getting help

If the issue is not covered here:

1. Collect the last 200 lines of the log: `Get-Content "C:\ProgramData\MysoftAgent\logs\agent-*.log" | Select-Object -Last 200 | Out-File C:\Temp\agent-log.txt`
2. Include the Windows Event Log entries: `Get-EventLog -LogName Application -Source MysoftIntegrationAgent -Newest 50 | Export-Csv C:\Temp\eventlog.csv`
3. Send both files to your Mysoft support contact along with the platform job ID (if applicable)
