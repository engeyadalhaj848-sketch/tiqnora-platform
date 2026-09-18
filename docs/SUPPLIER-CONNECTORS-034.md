# Phase 034 — Real Supplier Connectors & Inventory Sync

**Commit:** feat(commerce): real supplier connectors and inventory sync

## Connectors
CJ · AliExpress · Alibaba · DSers

Env only (Vercel):
CJ_API_KEY, ALIEXPRESS_API_KEY, ALIBABA_API_KEY, DSERS_API_KEY

## API
POST /api/commerce/ai
mode: supplier_center
action: status | test | search | sync | sync_inventory | logs

## Migration 034
supplier_connections, supplier_product_mapping, inventory_sync_logs

## Safety
No auto-purchase. No auto-publish. No auto selling-price updates. Alerts only.
