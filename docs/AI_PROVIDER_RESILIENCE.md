# AI Provider Resilience

## Provider chains

### Social replies
WhatsApp and supported social comment replies use the free-first chain:

1. Groq — default model `openai/gpt-oss-20b`
2. Gemini — multi-model fallback, default `gemini-3.8-flash`
3. OpenRouter — default `openrouter/free`
4. OpenAI — optional legacy/paid fallback
5. xAI / Grok — optional fallback
6. Anthropic — optional fallback

### Shared workforce / commerce provider
The existing Vercel AI Gateway priority is preserved when Gateway is explicitly enabled. Direct-provider fallback then proceeds through Groq → Gemini → OpenRouter → OpenAI → xAI → Anthropic. This avoids changing established workforce routing while still adding the new free providers.

A deterministic template fallback remains available where `allowDeterministic=true`.

## Environment variables
Required for the free-first chain:
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

Optional model overrides:
- `GROQ_MODEL`
- `GEMINI_MODEL`
- `OPENROUTER_MODEL`

Provider secrets must remain server-side and should be stored as Vercel Sensitive/Secret environment variables.

## Error classification
- 429 / quota / rate limit → `AI_PROVIDER_QUOTA` (fallback-eligible)
- 5xx / timeout / high demand → `AI_PROVIDER_UNAVAILABLE`
- 401 / 403 / invalid key → `AI_PROVIDER_AUTH` (fallback-eligible)
- missing key → provider is skipped

## Social reply behavior
- WhatsApp inbound text messages can be answered through the YCloud conversation path.
- Facebook and Instagram comment replies use the Meta adapter.
- TikTok comment replies use the TikTok Business adapter when connected.
- If all live AI providers fail, existing deterministic/context recovery behavior remains available rather than fabricating facts.
- Specialist handoff rules remain unchanged.

## Cron safety
`runGrowthCron` never returns 503 solely because an AI provider is unavailable.
It continues to emit degraded/fallback details.

## Approval gates
Publishing approval gates remain unchanged. This provider routing change affects AI generation and inbound reply intelligence; it does not remove existing publish approvals.
