# Tiqnora Supplier Integration Readiness

**Commit feature:** supplier integrations and AI dropshipping architecture  
**Auto-purchase:** OFF  
**Auto-publish:** OFF  

## Migrations

| File | Purpose |
|------|---------|
| `009_commerce_ai_dropshipping.sql` | `commerce_suppliers`, `supplier_products`, `fulfillment_requests` |
| `025_supplier_integration_layer.sql` | `supplier_accounts`, `product_import_queue`, `supplier_sync_logs`, `supplier_orders`, `commerce_audit_logs`, CJ + Amazon providers |

Run in Supabase SQL Editor (service role / dashboard), in order.

## Tables mapping (requested → implemented)

| Requested | Implemented |
|-----------|-------------|
| supplier_accounts | `supplier_accounts` (+ existing `commerce_suppliers`) |
| supplier_products | `supplier_products` (009) |
| supplier_sync_logs | `supplier_sync_logs` |
| supplier_orders | `supplier_orders` |
| product_import_queue | `product_import_queue` |

## APIs

| Endpoint | Role |
|----------|------|
| `GET /api/commerce/suppliers?action=status` | Provider readiness (env key presence only) |
| `GET /api/commerce/suppliers?action=queue` | Import queue snapshot |
| `POST /api/commerce/suppliers` `queue_import` / `log_sync` | Stage import / log sync (service role) |
| `POST /api/commerce/ai` | research, profit, trend, content, market_compare, import_brief |

Secrets: Vercel env only (`CJ_API_KEY`, `ALIEXPRESS_*`, etc.). Never in DB or client.

## Admin screens

Admin → **Tiqnora Commerce AI**:
- Supplier list & fulfillment mode
- Profit calculator
- AI research agent
- Import queue (approve/reject)
- Supplier product candidates
- Fulfillment approval → prepare `supplier_orders`
- Sync logs

## Order flow

1. Customer order  
2. Admin fulfillment approval  
3. Supplier order preparation (`supplier_orders` status ready)  
4. Tracking update (manual / future API)  
5. Customer notification  

## Official API wiring (next)

Connect provider SDKs server-side only after credentials + legal agreements. Keep `fulfillment_mode = approval_required` until explicitly changed.
