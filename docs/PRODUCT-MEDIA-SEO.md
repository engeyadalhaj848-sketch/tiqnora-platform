# Product Media Manager + AI SEO

**Commit:** feat(admin): product media manager and AI SEO content

## Migration 029
`supabase/migrations/029_product_media_quality.sql`
- `product_images` table (url, type, sort_order, source, approval_status)
- `products.quality_score`, `quality_notes`, `image_source`, `media_status`

Run in Supabase SQL Editor after 028.

## Admin
- Filters: missing images/SEO, needs review, ready (≥75), low quality
- Per product: Media manager, SEO AI, quality badge
- Bulk: generate SEO (max 25), quality score (max 100)

## API (merged into `/api/commerce/ai`)
- `mode: product_seo` — bilingual SEO package
- `mode: quality_score` — 0–100 readiness

No auto-publish.
