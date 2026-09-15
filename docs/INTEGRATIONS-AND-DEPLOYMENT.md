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
3. Configure one AI provider key and test `/api/ai-workforce/chat` while authenticated. Gemini uses `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`) and optional `GEMINI_MODEL`; the default is `gemini-2.5-flash`.
4. Configure the selected payment gateway and webhook secret before enabling checkout.
5. Add SMSA or Saudi Post credentials only after merchant approval; keep rates and tracking server-side.
6. Connect Meta, WhatsApp Cloud and TikTok through official OAuth flows; never paste tokens into content records.
7. For WhatsApp Cloud, subscribe the Meta app to `messages` and set its callback URL to
   `https://tiqnora.com/api/social/webhook?platform=whatsapp`. Set
   `META_WEBHOOK_VERIFY_TOKEN` and `META_APP_SECRET` in Vercel. The first verified
   inbound message creates its active connection in the Tiqnora Social Inbox.
8. For TikTok, create an official TikTok developer app and OAuth connection, then point
   its trusted relay to `https://tiqnora.com/api/social/webhook?platform=tiktok` with
   header `x-tiqnora-webhook-secret` matching `SOCIAL_WEBHOOK_SHARED_SECRET` in Vercel.
   This keeps TikTok secrets server-side and normalizes its events into the same inbox.

## Safety

- Validate Supabase sessions and admin roles on every protected API route.
- Use RLS for every user-owned table.
- Verify payment and shipping webhook signatures.
- Rate-limit AI, login, checkout and social publishing endpoints.
- Keep audit logs for admin changes and provider actions.
- Use sandbox credentials until production verification is complete.

## Verification

Run `npm run build`, then deploy the repository root through the linked Vercel project. Never commit `.env` files or generated secrets.
