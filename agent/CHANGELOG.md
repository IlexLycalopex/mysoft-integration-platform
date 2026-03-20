# Changelog — Mysoft Integration Agent

All notable changes are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version numbers follow [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-03-17

### Initial release

**Core functionality**
- Windows Worker Service (.NET 8) installable via `install.ps1`
- `FileSystemWatcher` for real-time file detection + polling fallback (configurable interval, default 5 min)
- SHA-256 deduplication — checks against platform before uploading (`POST /api/v1/check`)
- Multipart file upload to `POST /api/v1/ingest` with API key authentication
- Three archive modes: `move` (default), `delete`, `leave`
- Timestamp-suffix collision avoidance when archiving to a folder with an existing file of the same name
- Heartbeat every 5 minutes to `POST /api/v1/heartbeat`
- Config auto-refresh every 10 minutes — watcher changes in the platform take effect without restart
- Graceful shutdown — all active watchers stopped cleanly on `SIGTERM` / service stop

**Robustness**
- File lock detection: `WaitForFileReadyAsync` probes for exclusive open with 9-step backoff (up to ~60s) before processing — handles slow network shares and large files
- Retry with exponential backoff on config fetch, duplicate check, and file upload (3 attempts: 2s, 4s delays)
- Startup retry loop — agent retries platform config fetch every 30s until successful
- Windows Service recovery actions: restart after 60s (×2), then after 5 min; reset after 24h

**Observability**
- Serilog structured logging: rolling daily files (`agent-YYYYMMDD.log`), 30-day retention, 10 MB per file
- Windows Event Log sink for warnings and errors (source: `MysoftIntegrationAgent`)
- Log includes: file detected, hash computed, duplicate check result, upload success/failure, archive action, heartbeat, config refresh

**Deployment**
- `build.ps1`: self-contained `win-x64` single-file exe via `dotnet publish`
- `package.ps1`: produces `dist\MysoftAgent-v{version}-win-x64.zip` ready for customer delivery
- `install.ps1`: full install/upgrade script — service registration, config write, recovery actions, start
- `uninstall.ps1`: stop + delete service, optional full file removal
- `appsettings.Production.json`: production overlay template with EventLog sink
- Assembly metadata: version, company, copyright, product name embedded in exe

**Platform endpoints consumed**
- `GET  /api/v1/config` — fetch watcher configurations
- `POST /api/v1/check` — SHA-256 duplicate check
- `POST /api/v1/ingest` — file upload
- `GET  /api/v1/jobs/{id}` — job status query
- `POST /api/v1/heartbeat` — agent liveness signal

**Documentation**
- `README.md`: quick start, install reference, watcher config, logging, service management
- `docs/deployment-guide.md`: full IT admin guide — build, package, install, service accounts, GPO, upgrade, firewall, security hardening
- `docs/troubleshooting.md`: comprehensive error reference — service, file detection, upload, dedup, Intacct errors

---

## Roadmap

### [1.1.0] — Planned
- SFTP source support (poll remote SFTP server on a schedule)
- Per-watcher retry queue with persistent state (survive service restart)
- Health endpoint for monitoring integration (e.g. Prometheus / Zabbix)
- Configurable file age filter (ignore files older than N hours)

### [1.2.0] — Planned
- XLSX pre-validation before upload (column header check against mapping)
- Email/Teams alert on repeated upload failure
- Windows Installer (MSI) for enterprise deployment
