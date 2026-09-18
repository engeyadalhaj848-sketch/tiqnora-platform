# Tiqnora Commerce AI — Phase 3 Verticals Upgrade

**Commit message:** `feat(commerce): POS hotel local suppliers and AI scout upgrade`

## What shipped

### Migration 027
- Categories: `pos-systems`, `hotel-technology`, `construction-tech`, `safety-security`
- Local Saudi supplier seeds (Riyadh / Jeddah / Dammam manuals)
- Scout table columns: `vat_amount`, `score`, `seo_opportunity`
- Extra supplier fields: city, contact_phone, contact_email

### API (`api/commerce/ai.js` — single function, Hobby limit)
- Product Scout with **VAT 15% estimate**, **score 0–100**, recommendation `suitable|review|not_suitable`
- Optional `save=true` → `product_scout_results`
- **GET** `?action=status|suppliers|scout_history` (merged; no extra serverless routes)
- POST modes unchanged + scout

### Admin Commerce AI
- Product Opportunities table (saved scout scores)
- Supplier Center (local vs international + env key presence)
- Scout UI shows VAT + score; save draft
- Profit calculator VAT-aware
- Approval workflow labels clarified (no auto publish/purchase)

### SEO
- `/solutions/pos-solutions-saudi`
- `/solutions/hotel-technology-saudi`
- Existing `/solutions/retail-digital-solutions-saudi` kept
- Sitemap +2 URLs (~94)

## Owner actions (required)
1. Supabase SQL Editor: run **025** (if not done) → **026** → **027**
2. Vercel Redeploy `main`
3. Admin → Commerce AI → test Scout (150 cost / 25 ship / 399 price)
4. Confirm local suppliers appear after 027

## Non-goals (unchanged)
- No auto-purchase
- No auto-publish
- No extra serverless functions (stay ≤12 Hobby)
- No rebuild of checkout/orders/customer UI
