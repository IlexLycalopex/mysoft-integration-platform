# Pending Setup — Actions Required Before Testing

This file tracks configuration steps that must be completed before specific features
can be tested end-to-end. These are infrastructure/account setup items, not code tasks.

---

## Source Connectors (Xero, QuickBooks Online, Sage 50cloud)

**Status:** Code complete and deployed. Database migration 047 applied.
**Blocked on:** OAuth app registration at each provider's developer portal.

### Steps required

| Provider | Portal | Redirect URI to register |
|---|---|---|
| Xero | https://developer.xero.com/app/manage | `https://{your-domain}/api/oauth/xero/callback` |
| QuickBooks Online | https://developer.intuit.com | `https://{your-domain}/api/oauth/quickbooks/callback` |
| Sage 50cloud | https://developer.sage.com/accounting | `https://{your-domain}/api/oauth/sage50/callback` |

### Environment variables to set (Vercel + local)

```
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
SAGE50_CLIENT_ID=
SAGE50_CLIENT_SECRET=
```

### Notes
- Sage 50cloud connector requires the customer to have a **Sage 50cloud subscription**
  (not standalone Sage 50 desktop). Customers on desktop-only should use CSV export + file upload.
- Xero: after connecting, the callback automatically selects the first Xero organisation.
  If the user has multiple organisations, a future enhancement will let them choose.
- QBO: the `realmId` (Company ID) is passed automatically in the OAuth callback URL.

---

## Sage X3 Target Connector

**Status:** Code complete and deployed.
**Blocked on:** A Sage X3 test environment with API access enabled.

### Requirements
- Sage X3 v12+ (Syracuse server with REST/GraphQL API enabled)
- An API user account with appropriate object-level permissions
- Server URL, solution code, and folder code

### Environment variables (none — credentials are stored per-tenant in the platform)

### Notes
- Basic auth is used by default (username + password via Authorization header)
- Syracuse REST API must be enabled on the X3 server (`/api/v1/` endpoint accessible)
- GraphQL endpoint (`/api/graphql`) is used for health checks and field discovery

---

## General Pre-Test Checklist

- [ ] `NEXT_PUBLIC_APP_URL` is set correctly in Vercel (used in OAuth redirect URIs)
- [ ] `ENCRYPTION_KEY` is set in Vercel (used for encrypting all credentials)
- [ ] Supabase storage bucket `uploads` exists and is accessible
