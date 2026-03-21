# Power Automate / Logic Apps Connector

## Overview

A certified Microsoft Power Automate connector allows customers to:
- Trigger flows when Mysoft jobs complete, fail, or raise quota warnings
- Submit jobs directly from Power Automate (upload a file, start processing)
- Bridge between Microsoft 365, Dynamics 365, and Sage Intacct via Mysoft

This is distinct from the **Teams incoming webhook** (which Mysoft already supports). The Power Automate connector appears in the Power Automate UI as a first-class connector with triggers and actions.

---

## Connector Type

**Custom Connector** (independent publisher certification pathway via Microsoft).

For immediate MVP use, customers can use the **Generic HTTP** webhook endpoint with Power Automate's built-in HTTP trigger — no custom connector needed.

---

## OpenAPI Spec

The connector is defined by an OpenAPI 2.0 (Swagger) spec. Location: `public/openapi/mysoft-integration.json`

Key endpoints exposed via the connector:

### Triggers (webhook-based)

| Trigger | Description |
|---------|-------------|
| `When a job completes` | Subscribe to `job.completed` |
| `When a job fails` | Subscribe to `job.failed` |
| `When quota warning` | Subscribe to `quota.warning` |

### Actions

| Action | Method | Description |
|--------|--------|-------------|
| `Get job status` | `GET /api/jobs/{id}` | Poll job status |
| `List mappings` | `GET /api/mappings` | Retrieve available mappings |
| `Submit CSV data` | `POST /api/jobs` | Submit raw CSV content for processing |

---

## Authentication

The connector uses **API Key** authentication (header: `Authorization: Bearer mip_xxxx`).

Customers generate an API key from **Settings → API Keys**.

---

## Webhook Registration

Power Automate uses a **polling trigger** or **push (subscription) trigger** model. For Mysoft:

1. **Power Automate** calls `POST /api/webhooks` with its callback URL when a flow is activated
2. Mysoft fires the callback when the event occurs (existing `dispatchWebhooks`)
3. Power Automate calls `DELETE /api/webhooks/{id}` when the flow is deactivated

The existing webhook infrastructure handles steps 2–3. Step 1 requires a new public `POST /api/webhooks` endpoint that accepts an API key.

---

## Webhook Subscription Endpoint (to build)

```
POST /api/webhooks/subscribe
Authorization: Bearer mip_xxxx
Content-Type: application/json

{
  "event": "job.completed",
  "callback_url": "https://prod-12.westeurope.logic.azure.com/workflows/..."
}

Response 201:
{
  "id": "webhook-uuid",
  "event": "job.completed"
}
```

```
DELETE /api/webhooks/subscribe/{id}
Authorization: Bearer mip_xxxx
```

---

## OpenAPI 2.0 Spec (Swagger)

The full spec is at `public/openapi/mysoft-integration.json`. Key sections:

```json
{
  "swagger": "2.0",
  "info": {
    "title": "Mysoft Integration Platform",
    "description": "Connect your business systems to Sage Intacct and Sage X3 via Mysoft",
    "version": "1.0.0",
    "contact": {
      "name": "Mysoft Support",
      "url": "https://mysoft.co.uk/support",
      "email": "support@mysoft.co.uk"
    }
  },
  "host": "app.mysoft.com",
  "basePath": "/api",
  "schemes": ["https"],
  "securityDefinitions": {
    "apiKey": {
      "type": "apiKey",
      "name": "Authorization",
      "in": "header",
      "description": "Bearer mip_xxxx"
    }
  },
  "paths": {
    "/jobs/{id}": {
      "get": {
        "operationId": "GetJobStatus",
        "summary": "Get job status",
        "parameters": [{"name": "id", "in": "path", "required": true, "type": "string"}],
        "responses": {"200": {"description": "Job details"}}
      }
    }
  }
}
```

---

## Certification Pathway

Microsoft offers two paths:

### 1. Independent Publisher Connector (free, community)
- Submit via GitHub: `microsoft/PowerPlatformConnectors`
- No review SLA, visible to all Power Automate users
- Suitable for MVP / early access
- Requirements: OpenAPI spec, policy template, detailed documentation

### 2. Verified Publisher Connector (paid, partner)
- Requires Microsoft Partner Network membership
- Verified badge, appears in curated marketplace
- Suitable for GA launch
- Requirements: same as above + Microsoft review

### Timeline
1. Build OpenAPI spec and Mysoft API endpoints (1 week)
2. Build Power Automate connector definition + policy template (2 days)
3. Internal testing via custom connector in Power Automate (2 days)
4. Submit to Microsoft Independent Publisher program (async, 4–8 weeks review)

---

## Immediate MVP Path (no connector needed)

Until the certified connector is published, customers can use Power Automate today with:

1. **HTTP trigger** in Power Automate receiving Mysoft webhook POST
2. **HTTP action** in Power Automate calling Mysoft API with Bearer token
3. **Teams notification** via Mysoft's built-in Teams Adaptive Card channel type

This requires zero additional development and is fully functional.

---

## Dynamics 365 / Dataverse Integration

Once the Power Automate connector exists, common flows include:
- Sync Dynamics 365 Sales invoices → Mysoft → Sage Intacct AR
- New Dataverse records trigger Mysoft job submission
- Mysoft job completion updates Dynamics record status
- Error notifications to Teams via Power Automate approval flows

The existing webhook system (Slack/Teams/generic) and inbound receivers (`/api/inbound/{key}`) can handle most of these without waiting for the certified connector.
