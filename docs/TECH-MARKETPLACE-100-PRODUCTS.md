# Tech Marketplace — 100 Product Expansion

**Commit:** feat(commerce): seed 100 tech marketplace draft products

## Migration 028
`supabase/migrations/028_tech_marketplace_100_products.sql`

- 25 POS Systems
- 25 CCTV & Security
- 25 Networking
- 25 Hotel & Business Technology

All products: **`is_active = false`** (draft — admin approval required).

### Per product fields
Arabic/English name, brand, category, SKU, slug, description, price, cost, margin in specifications, VAT estimate, FAQ, SEO title/description, shipping note, supplier label.

### Images
Reuses existing `/assets/products/*` paths as **placeholders**.  
`specifications.image_status = placeholder_reuse_pending_official`  
Admin must replace with official manufacturer/supplier photos before publish.

## SEO pages
- `/products/pos-systems-saudi`
- `/products/cctv-security-saudi`
- `/products/network-equipment-saudi`
- `/products/hotel-technology-products-saudi`

## Admin
Products manager: filters (all / draft / live), publish & unpublish buttons, draft counters.

## Owner steps
1. Run SQL **028** in Supabase (after 025–027 if pending)
2. Vercel deploy from main
3. Admin → Products → مسودات فقط → review → اعتماد نشر
4. Replace placeholder images with authorized model photos

No auto-publish. No auto-purchase.
