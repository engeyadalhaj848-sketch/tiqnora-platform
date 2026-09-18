# AI Product Verification Agent

**Commit:** feat(ai): product verification agent

## API
`POST /api/commerce/ai` with `mode: "product_verification"`

Returns section scores: image, content, specifications, seo, business + overall.

## Status
READY_TO_PUBLISH (≥90) · MINOR_FIXES (75–89) · NEEDS_IMPROVEMENT (50–74) · BLOCKED (<50)

## Migration 031
`product_verification_reports` table

## Publish
Score < 75 blocks publish unless admin override with reason.

No auto-publish. No auto-purchase.
