# Phase 035 — CJ Dropshipping Connector + Product Import Test

**Commit message:** `feat(commerce): CJ dropshipping connector and import workflow`  
**Date:** 2026-09-18  
**Depends on:** Phase 034 (supplier_connections, supplier_product_mapping, inventory_sync_logs)

## Safety (enforced)

| Rule | Status |
|------|--------|
| No automatic purchase from CJ | ✅ |
| No automatic publish to storefront | ✅ (`is_active = false`) |
| No automatic customer fulfillment | ✅ |
| All imports → `product_import_queue` status `pending_review` | ✅ |
| Secrets only in Vercel env (`CJ_API_KEY`) | ✅ |
| Missing key does not crash the system | ✅ returns `not_configured` |

## What was built

### 1. Real CJ connector — `lib/suppliers/cj.js`

| Function | Behaviour |
|----------|-----------|
| `testConnection()` | Auth via CJ `getAccessToken`; `not_configured` if no key |
| `searchProducts(query, limit)` | Live `listV2` when key present; safe error otherwise |
| `getProductDetails(id)` | Live product query / fallback |
| `getProductInventory(id)` | Stock from details |
| `getProductPrice(id)` | Cost from details |
| `getShippingInfo(id)` | Estimate for SA (7–15 days) |
| `getDemoCatalog()` | Offline admin test products (tech accessories) |

Token is cached in-process (24h). Never stored in DB.

### 2. Connector registry — `api/commerce/connectors.js`

- `cj_dropshipping` uses the real CJ module
- Other providers remain mock/base (AliExpress, Alibaba, DSers)
- When `CJ_API_KEY` is missing, CJ search returns **demo catalog** so the admin UI remains usable

### 3. Supplier Center API — fixed + extended

**Bug fixed:** recursive `rest()` in `handleSupplierCenter` → now correctly calls `sbRest`.

**New actions:**

| action | Purpose |
|--------|---------|
| `import_product` / `import_test` / `import_one` | Import **one** product into queue + draft |
| `sync_prices` | Alias of inventory/price check (alerts only) |

Import pipeline:

```
CJ product (live or demo)
  → product_import_queue (pending_review)
  → products row (is_active = false)
  → supplier_product_mapping
  → AI research blob (market + pricing + verification)
  → inventory_sync_logs alert
```

### 4. AI processing on import (deterministic)

- **Market intelligence:** demand / competition / SEO opportunity  
- **Dynamic pricing:** landed SAR cost, recommended selling price (~35%+ margin target), VAT-aware  
- **Product verification:** image/content/SEO checks → `ai_score` 0–100  
- **Recommendation:** `PUBLISH_READY` | `REVIEW_FIRST` | `NEEDS_WORK`  

Nothing is published automatically.

### 5. Admin UI

Commerce → **Supplier Center**:

- Status chips  
- Test / Sync / Inventory / **استيراد منتج تجريبي (CJ)** / Logs  
- Import report card: AI score, recommendation, cost, suggested price, queue id  

### 6. Migration 035

`supabase/migrations/035_cj_dropshipping_import_workflow.sql`

- Ensures CJ rows in `supplier_connections` + `commerce_suppliers`
- Optional columns: `ai_score`, `ai_recommendation`, `import_source` on queue

## Files changed

| Path | Change |
|------|--------|
| `lib/suppliers/cj.js` | **New** — CJ API client |
| `api/commerce/connectors.js` | CJ live + demo fallback |
| `api/commerce/ai.js` | Fixed rest bug + import workflow |
| `js/admin-app.js` | Import test button + report |
| `supabase/migrations/035_cj_dropshipping_import_workflow.sql` | **New** |
| `.env.example` | CJ / supplier key placeholders |
| `docs/PHASE-035-CJ-CONNECTOR-REPORT.md` | This report |

## Owner steps

1. **Run SQL** in Supabase (if not already):
   - `034_supplier_connectors_sync.sql` (if pending)
   - `035_cj_dropshipping_import_workflow.sql`
2. (Optional) Set `CJ_API_KEY` in Vercel → Environment Variables when official CJ access is ready.
3. Push to `main` → Vercel auto-deploy.
4. Admin → Commerce → Supplier Center:
   - Test Connection
   - **استيراد منتج تجريبي (CJ)**
   - Confirm queue entry + `is_active=false` product
   - Review logs

## Expected test result (demo path, no key)

```
Imported products: 1
AI Score: ~70–75/100
Recommended: REVIEW_FIRST
Reason: Need better images / Arabic SEO polish before publish
is_active: false
status: pending_review
auto_purchase: false
auto_publish: false
```

## Sync test expectations

| Event | Result |
|-------|--------|
| Supplier price 50 → 60 | `inventory_sync_logs` row `change_type=price`, `requires_review=true` |
| Stock → 0 | `change_type=availability`, alert “out of stock” |
| Selling price on `products` | **Unchanged** |

## Remaining (out of 035)

- Wire live CJ variant/stock endpoints once production key is approved  
- Cron for scheduled inventory checks (still alerts-only)  
- Admin “Approve & Publish” action that flips `is_active=true` after review  
- Real image download into Supabase Storage (currently URL references)

## Security check

- Missing `CJ_API_KEY` → `not_configured`, no exception  
- No secrets in response payloads  
- No secrets in DB (`env_key_refs` stores key **names** only)  
- RLS admin-only on queue / mapping / logs  
