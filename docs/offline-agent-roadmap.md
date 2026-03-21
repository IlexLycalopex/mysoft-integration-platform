# Offline Agent — Architecture Roadmap

## Problem Statement

Some customer environments cannot expose inbound ports to the internet:
- On-premise Sage X3 or Sage Intacct installations behind a firewall
- Legacy ERP systems in isolated networks
- File servers (SFTP/shared drives) not reachable from Vercel

The **Offline Agent** solves this by running a small binary **inside** the customer's network. It:
1. **Polls** the platform outbound (HTTPS only — no inbound ports required)
2. Picks up queued jobs assigned to it
3. Executes locally (reads from local SFTP, transforms, posts to local Sage X3 API)
4. Reports results back to the platform

---

## Current State (MVP)

The platform currently supports:
- **Direct Intacct**: jobs are processed server-side by Vercel functions
- **SFTP polling**: cron at `/api/cron/sftp-poll` fetches files from remote SFTP
- **Inbound webhooks**: `/api/inbound/{receiverKey}` accepts payloads from external systems

These cover most cloud-hosted scenarios. The offline agent is required when:
- Customer Sage X3 is on-premise
- Customer SFTP is firewalled
- Customer requires data never to leave their network

---

## Proposed Architecture

```
Customer Network                     Platform (Vercel)
─────────────────────────────        ─────────────────────────────────

  ┌─────────────────┐                ┌──────────────────────────────┐
  │  Offline Agent  │──── HTTPS ────▶│  /api/agent/poll             │
  │  (Go binary)    │◀─── jobs ──────│  (auth: API key mip_agent_*) │
  │                 │                └──────────────────────────────┘
  │  ┌───────────┐  │
  │  │ Sage X3   │  │                ┌──────────────────────────────┐
  │  │ API       │  │──── results ──▶│  /api/agent/complete         │
  │  └───────────┘  │                └──────────────────────────────┘
  │                 │
  │  ┌───────────┐  │
  │  │ Local FS  │  │
  │  │ / SFTP    │  │
  │  └───────────┘  │
  └─────────────────┘
```

---

## Agent Design

### Language
**Go** — single compiled binary, no runtime dependencies, cross-platform (Windows/Linux/macOS). Small footprint, easy to deploy as a Windows Service or systemd unit.

### Configuration
```toml
# mysoft-agent.toml
[platform]
api_url    = "https://app.mysoft.com"
api_key    = "mip_agent_xxxxxxxxxxxx"
poll_interval = "30s"
tenant_id  = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

[target]
type = "sage_x3"           # or: sage_intacct | csv_export
base_url = "http://x3-server/api/..."
username = "ADMIN"
password = "secret"
solution = "X3V12"
folder   = "PROD"

[source]
type = "local_sftp"        # or: local_fs | sftp_remote
path = "C:/imports/staging"
```

### Poll Endpoint (to build)
```
GET /api/agent/poll
Authorization: Bearer mip_agent_xxxxx
X-Agent-Version: 1.0.0

Response:
{
  "jobs": [
    {
      "id": "uuid",
      "filename": "invoices.csv",
      "mapping_id": "uuid",
      "payload_url": "signed S3/Supabase Storage URL",
      "expires_at": "ISO8601"
    }
  ]
}
```

### Complete Endpoint (to build)
```
POST /api/agent/complete
Authorization: Bearer mip_agent_xxxxx

{
  "job_id": "uuid",
  "status": "completed | failed | partially_completed",
  "processed_count": 100,
  "error_count": 2,
  "errors": [{"row": 5, "message": "Invalid account code"}],
  "agent_version": "1.0.0"
}
```

### Heartbeat (to build)
```
POST /api/agent/heartbeat
Authorization: Bearer mip_agent_xxxxx

{ "agent_version": "1.0.0", "queue_depth": 0, "last_processed_at": "ISO8601" }
```

---

## Database Changes Required (when implementing)

```sql
-- Agent registrations
CREATE TABLE agent_registrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  api_key_hash  TEXT NOT NULL,        -- bcrypt hash of mip_agent_* key
  connector_key TEXT NOT NULL,        -- 'sage_x3' | etc.
  last_seen_at  TIMESTAMPTZ,
  agent_version TEXT,
  enabled       BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Queue jobs for agent pickup
ALTER TABLE upload_jobs
  ADD COLUMN agent_id UUID REFERENCES agent_registrations(id),
  ADD COLUMN agent_claimed_at TIMESTAMPTZ,
  ADD COLUMN agent_completed_at TIMESTAMPTZ;
```

---

## Deployment Options

### Windows (most common for X3 customers)
```cmd
# Install as Windows Service
sc create MysoftAgent binPath="C:\mysoft\mysoft-agent.exe" start=auto
sc start MysoftAgent
```

### Linux / Docker
```bash
# systemd
sudo systemctl enable mysoft-agent
sudo systemctl start mysoft-agent

# or Docker
docker run -d --name mysoft-agent \
  -v /etc/mysoft-agent.toml:/app/config.toml \
  ghcr.io/mysoft/integration-agent:latest
```

### Auto-update
The agent checks for updates on startup and can self-update from a signed binary hosted on Supabase Storage.

---

## Security

- **Outbound HTTPS only** — no inbound ports, no VPN required
- **API key** is tenant-scoped and rotatable from the platform UI
- **Payload URLs** are signed, expiring, single-use (Supabase Storage signed URLs)
- **No raw credentials** transmitted — agent holds target system creds locally
- **Audit log** on platform: every job pickup and completion is recorded

---

## Production Timeline (rough estimate)

| Phase | Work | Notes |
|-------|------|-------|
| API endpoints | `/api/agent/poll`, `/api/agent/complete`, `/api/agent/heartbeat` | 1–2 days |
| DB migrations | `agent_registrations`, alter `upload_jobs` | 0.5 days |
| Go binary v1 | Sage X3 target, local FS source | 1 week |
| Windows installer | MSI or zip with instructions | 1 day |
| Platform UI | Agent management page, heartbeat status | 1 day |
| Testing | End-to-end with X3 sandbox | Variable |

---

## Current Workarounds (until agent is built)

1. **SFTP with public IP**: If customer can expose an SFTP server, the existing SFTP cron (`/api/cron/sftp-poll`) handles file pickup
2. **File upload via UI**: Manual upload to the platform, processed server-side
3. **REST API**: External systems can trigger processing via `POST /api/jobs` with an API key
4. **Inbound receiver**: External systems POST raw payloads to `/api/inbound/{receiverKey}`
