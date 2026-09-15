# Tiqnora AI — Integration and deployment checklist

## Implemented

- Arabic RTL / English LTR site and shop
- Admin dashboard for services, packages, products, orders, SEO, themes and settings
- Supabase schema and seed data
- AI workforce and social inbox API surfaces
- Vercel security headers, sitemap, robots and llms.txt

## Vercel configuration

Add values from `.env.example` in Vercel. Never put service-role keys or provider secrets in `js/config.js` or browser code. Public browser configuration may contain only the Supabase URL and anon key.

## Activation order

1. Run `supabase/schema.sql`, `supabase/seed.sql`, then migrations in filename order.
2. Create the owner account and verify the owner email in the admin application.
3. Configure one AI provider key and test `/api/ai-workforce/chat` while authenticated. Gemini uses `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`) and optional `GEMINI_MODEL`.
4. Configure the selected payment gateway and webhook secret before enabling checkout.
5. Add SMSA or Saudi Post credentials only after merchant approval; keep rates and tracking server-side.
6. Connect Meta, WhatsApp Cloud, TikTok, or LinkedIn through the official OAuth routes: `/api/social/oauth/{provider}`. Tokens are exchanged server-side and encrypted in `social_provider_tokens`; never paste tokens into content records.
7. For WhatsApp Cloud, subscribe the Meta app to `messages` and set callback URL `https://tiqnora.com/api/social/webhook?platform=whatsapp`. Set `META_WEBHOOK_VERIFY_TOKEN` and `META_APP_SECRET` in Vercel.
8. For TikTok, request only approved scopes and use `https://tiqnora.com/api/social/webhook?platform=tiktok` for trusted relays.
9. Set `OAUTH_STATE_SECRET` and a base64-encoded 32-byte `SOCIAL_TOKEN_ENCRYPTION_KEY` in Vercel before enabling OAuth. Apply migration `008_social_oauth_tokens.sql`.

## Safety

- Validate Supabase sessions and admin roles on every protected API route.
- Use RLS for every user-owned table.
- Verify payment and shipping webhook signatures.
- Rate-limit AI, login, checkout and social publishing endpoints.
- Keep audit logs for admin changes and provider actions.
- Use sandbox credentials until production verification is complete.

## Verification

Run `npm run build`, then deploy the repository root through the linked Vercel project. Never commit `.env` files or generated secrets.
