# Apify Integration — Tiqnora AI

## Overview

1. **REST client** (`lib/integrations/apify.js`) for backend + admin workflows.
2. **MCP readiness** via https://mcp.apify.com — currently **`available_not_enabled`**.
3. **Supabase** stores run observability (`apify_runs`) + registry row; **never** the API token.

## Authentication

| Variable | Where |
|----------|--------|
| `APIFY_TOKEN` | Vercel → Project → Settings → Environment Variables (Production + Preview) |

Server-only. Never commit. Never expose in HTML/JS/API responses/logs.

Without the token, status is `not_configured` (no crash).

## Admin APIs (Bearer admin required)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/integrations/apify/status` | Config + health |
| POST | `/api/integrations/apify/test` | Connection test (no expensive actor) |
| POST | `/api/integrations/apify/actors-run` | Start Actor |
| GET | `/api/integrations/apify/runs/:id` | Run status |
| GET | `/api/integrations/apify/datasets/:id` | Dataset items (capped) |
| POST | `/api/integrations/apify/maps-leads` | Google Maps lead workflow **preview** |

## Cost safeguards

- Default maxResults = **10**
- Hard cap = **50**
- maps-leads default test = **3**
- Connection test does not start scrapers

## Approval gates

| Action | Status |
|--------|--------|
| Public search / scrape | Allowed (admin tool) |
| Enrich + score | Allowed |
| CRM import | Preview by default |
| WhatsApp / IG / FB / email / TikTok outreach | **Blocked** |
| Social publish / ads | **Blocked** |

## Enable live connection

1. Create Apify API token (console.apify.com).
2. Vercel → Environment Variables → `APIFY_TOKEN` (Production + Preview).
3. Redeploy.
4. Optional: run SQL `056_apify_integration.sql` in Supabase.
5. `GET /api/integrations/apify/status` as admin → `connected`.

Do **not** paste the token into chat or GitHub.
