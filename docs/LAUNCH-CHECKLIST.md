# Tiqnora AI — Internal Commercial Launch Checklist

## Ready
- [x] Public website + SEO basics (meta, schema, sitemap, robots)
- [x] Admin portal + AI workforce
- [x] Customer portal (auth, AI, projects, services, plans, invoices, notifications)
- [x] SaaS plans + subscriptions + usage limits
- [x] Billing architecture (no live payment)
- [x] Notifications + analytics
- [x] Health endpoint `/api/health`
- [x] Security headers

## Needs attention before public marketing push
- [ ] Run smoke test on real devices (iOS/Android)
- [ ] Rotate any secrets previously shared in chat
- [ ] Configure Telegram env for daily reports (optional)
- [ ] Google Search Console property + sitemap submit
- [ ] Confirm owner email + support channel on public site

## Deferred (next phase)
- [ ] Live payment (HyperPay / Tap / Stripe + Mada)
- [ ] Email notification delivery
- [ ] Edge rate limiting / CAPTCHA on signup
- [ ] Full e-commerce checkout activation
- [ ] Dropshipping auto-order
