# National Day Dropshipping MVP

**Date:** 2026-09-17  
**Campaign end:** 2026-09-30 (countdown on landing)

## Delivered
1. Landing `/national-day` — hero, countdown, product cards, filters, order steps
2. Admin products — cost, sell price, margin %, supplier name/url, campaign_tags, DS badge
3. `/api/commerce/ai` — modes: research, profit, trend, campaign, content (Gemini; no auto-buy)
4. Migration `018_national_day_dropship_mvp.sql` — tags, supplier fields, category, demo products
5. Future suppliers stay `approval_required` (AliExpress/Alibaba placeholders)

## Owner actions
1. Run migration 018 in Supabase SQL Editor
2. Confirm GEMINI_API_KEY on Vercel
3. Add real product images (URLs) in admin
4. Process orders manually from Admin → Orders (no auto supplier purchase)

## Order flow
Customer: Product → Cart → Checkout → Confirmation  
Admin: Orders → status update → fulfill manually / supplier_products approval path
