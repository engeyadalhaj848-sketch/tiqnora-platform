# AI Provider Resilience

## Provider chain
1. Gemini (primary, multi-model fallback)
2. OpenAI (if OPENAI_API_KEY)
3. xAI / Grok (if XAI_API_KEY)
4. Anthropic (if ANTHROPIC_API_KEY)
5. Deterministic template fallback when `allowDeterministic=true`

## Error classification
- 429 / quota / rate limit → `AI_PROVIDER_QUOTA` (fallback-eligible)
- 5xx / timeout / high demand → `AI_PROVIDER_UNAVAILABLE`
- Missing key → `AI_PROVIDER_NOT_CONFIGURED`

## Cron safety
`runGrowthCron` never returns 503 for AI failures.
It always emits a Telegram report with degraded/fallback details.

## Approval gates
Unchanged. No auto-send or auto-publish.
