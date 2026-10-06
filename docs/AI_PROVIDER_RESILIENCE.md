# AI Provider Resilience

## Provider chain
Tiqnora uses a free-first provider chain for text generation, structured analysis, WhatsApp replies, and supported social comment replies:

1. Groq — default model `openai/gpt-oss-20b`
2. Gemini — multi-model fallback, default `gemini-3.8-flash`
3. OpenRouter — default `openrouter/free`
4. Vercel AI Gateway — only when explicitly enabled
5. OpenAI — optional legacy/paid fallback
6. xAI / Grok — optional fallback
7. Anthropic — optional fallback
8. Deterministic template fallback when `allowDeterministic=true`

The social webhook uses the same free-first intent: Groq → Gemini → OpenRouter before any paid provider.

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
