# Commerce AI Supplier & B2B Marketplace Upgrade

## Owner actions (required)
1. Supabase SQL Editor — run in order if not applied:
   - `025_supplier_integration_layer.sql`
   - `026_supplier_b2b_marketplace_upgrade.sql`
2. Vercel → Deployments → Redeploy latest `main` (production was lagging on `782ad13`)
3. Optional env: `CJ_API_KEY`, `ALIEXPRESS_API_KEY`, `ALIBABA_API_KEY`, `DSERS_API_KEY`

## New
- Migration 026: supplier profile fields, Saudi local suppliers, POS/hotel categories, `product_scout_results`
- `POST /api/commerce/scout` structured profit + recommendation
- Admin: AI Product Scout panel

## Rules unchanged
- No automatic publishing
- No automatic supplier purchase
- API keys only in Vercel env
