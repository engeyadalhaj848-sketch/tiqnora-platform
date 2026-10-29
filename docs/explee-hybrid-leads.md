# Tiqnora V6 — Explee + Native Lead Research

## Objective
Reuse the current Lead Research → dedupe → enrichment → CRM draft → approval pipeline.
Add Explee as an **optional** company-discovery provider. Keep Google Places and
Apify as the independent native path. No new Supabase tables, migrations or
changes to existing customer records are required for this provider phase.

## Modes
- `google_places`: native Google Places API only (existing)
- `apify_maps`: native Apify Google Maps research (existing)
- `explee`: Explee company search only (new, explicitly gated)
- `hybrid`: Explee plus one available native provider, deduplicated by existing
  `runResearchJob`; if one API fails, the other can still supply candidates

Configure on the **server** (Vercel environment variables; never browser JS):
- `EXPLEE_API_KEY`: generated from https://explee.com/app-auto-gtm/api-keys
- `EXPLEE_LEAD_RESEARCH_ENABLED=true`: explicit spending/usage opt-in
- `GOOGLE_PLACES_API_KEY` or `APIFY_TOKEN`: native path (as currently supported)

Call from existing backend Lead Research integration:

```js
import { runResearchJob } from '../lib/v6/lead-research.js';
const preview = await runResearchJob({
  query: 'Saudi real estate businesses',
  city: 'Riyadh',
  industry: 'real_estate',
  target_count: 10,
  source: 'hybrid'
}, {
  existingCandidates: existingCrmBusinesses // retrieve current org's records first
});
// preview.candidates -> admin review -> existing CRM/action approval flow
```

### Important implementation boundaries
1. Explee uses `POST https://api.explee.com/public/api/v1/search/companies`
   with `X-API-Key`; searches are capped at **10 results per Explee call**
   and restricted to `SA` by default. Actual charges depend on Explee's
   current rules and account balance; provider must be explicitly enabled.
2. This adapter has **no outreach**: no Explee AutoGTM campaign creation,
   imports, email sending, WhatsApp sending or budget updates.
3. The normalized company output includes factual fields only. It never
   assumes a public business phone is opted in for promotional WhatsApp.
4. `runResearchJob` remains preview-only and sets
   `requires_approval=true`, `auto_outreach=false`.
5. Native mode remains usable if Explee is disabled or unavailable.
   An empty/unconfigured hybrid search throws an error — never returns
   fabricated fixture companies.
6. Data isolation: all later CRM writes must be scoped to the user's
   `organization_id` and pass existing Admin/Approval Engine checks.
   No new client-visible API route is opened by this change.
7. Rate limits, costs, logging and user-facing toggles should be surfaced
   through an admin-only UI before enabling regular scheduled runs.

### Validation
Run: `node --test tests/v6-explee-hybrid.test.mjs`
Also run the existing `tests/v6-lead-research.test.mjs`.
Do not set the Explee key in any test fixture.

### Production enablement (not performed by this PR)
1. Create an Explee account, verify the free preview/credit terms and obtain API key.
2. Add the key as a **server-only** environment variable in Vercel.
3. Explicitly opt in with `EXPLEE_LEAD_RESEARCH_ENABLED=true`.
4. Wire the chosen source mode to the existing **admin-only** research form/API,
   load existing org-scoped CRM records for dedup, and review results.
5. Add usage logs, daily budget caps and suppression lists before scheduled outreach.
6. All external sending is separately approved; Explee's independent AutoGTM
   autopilot must remain disabled unless deliberate opt-in and compliance review.

Official contract: https://api.explee.com/public/api/openapi.json
