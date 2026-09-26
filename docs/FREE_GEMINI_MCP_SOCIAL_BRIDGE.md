# Tiqnora Free AI + MCP Social Bridge

## Goal
Use the existing Gemini integration and Social AI Studio without requiring a paid OpenAI API key.

## Existing building blocks
- `api/ai-workforce/chat.js` already supports Google Gemini via `GEMINI_API_KEY`, `GOOGLE_GEMINI_API_KEY`, or `GOOGLE_AI_API_KEY`.
- `lib/v6/social-studio.js` creates campaigns, drafts, platform variants, creative briefs, approval gates, schedules and publishing queue records.
- Migration `050_v6_social_ai_studio.sql` provides the content and publishing tables.
- Social Inbox/webhooks remain the source of truth for inbound interactions.

## MCP contract
Expose these server-side tools from Tiqnora (or a free-tier MCP gateway):

1. `social.create_draft` — generate a brand-safe draft with Gemini and persist it as `draft`.
2. `social.create_variants` — adapt an approved draft for Instagram, Facebook, TikTok and WhatsApp.
3. `social.create_creative_brief` — return the visual brief/prompt using the locked Tiqnora brand.
4. `social.submit_review` — move content to human review.
5. `social.approve` — admin-only approval.
6. `social.publish` — publish only an approved item through the existing provider connection.
7. `social.status` — return per-platform delivery status/errors.

## Safety and cost rules
- Gemini is the default AI provider when a Gemini key exists.
- Never require `OPENAI_API_KEY` for the social workflow.
- Never expose provider keys to the browser or MCP client.
- No automatic publishing. `social.publish` must reject content without explicit admin approval.
- WhatsApp broadcasts must use the platform's existing compliant messaging path and recipient consent rules.
- Keep Meta/TikTok/WhatsApp provider tokens server-side.
- All writes must be organization-scoped and authenticated.

## Suggested MCP response shape
```json
{
  "ok": true,
  "content_id": "uuid",
  "status": "draft|review|approved|queued|published|failed",
  "platforms": ["instagram", "facebook", "tiktok", "whatsapp"],
  "requires_approval": true
}
```

## Environment
Required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- one of `GEMINI_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`

Existing social-provider secrets remain unchanged.

## Deployment sequence
1. Verify migration 050 has been applied.
2. Verify Gemini provider reports configured in AI Workforce.
3. Implement the MCP server adapter over the existing Social Studio functions/API.
4. Test draft → variants → creative brief → review → approval → queue.
5. Test each provider independently before enabling the unified “Publish to selected platforms” action.
6. Keep publishing approval-gated in production.
