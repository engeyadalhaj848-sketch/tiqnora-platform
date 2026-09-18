# AI Product Quality Review Agent

**Commit:** feat(ai): automated product quality review agent

## Migration 030
`product_quality_reviews` + products.last_review_*

## Checks
Images, info (AR/EN), specs/FAQ, SEO, commerce (cost/price/margin/supplier)

## Score bands
90–100 ready · 75–89 minor · 50–74 improve · <50 not ready

## Publish gate
Score < 75 blocks publish unless admin override with note (audit log).

## API
`POST /api/commerce/ai` mode: `product_review` | `quality_score` | `ai_review`

No auto-publish.
