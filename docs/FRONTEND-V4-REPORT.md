# Tiqnora Frontend V4 — Cyber Luxury Redesign

**Date:** 2026-09-22  
**Scope:** Interface + performance only. No backend or data changes.

## What changed

### Homepage (`index.html` + `styles.css`)
- Full dark cyber-navy identity (Deep Navy `#030712` / `#060B1E` + Electric Cyan `#00E5FF` + Blue `#0A5CFF`)
- Strong hero with pure-CSS live visual (6 pulsing nodes = 6 systems) — idea in ~5 seconds
- Exactly **6 systems**, no fixed prices
- Primary CTAs: **ناقش مشروعك معنا** / **اطلب عرض سعر مخصص** (WhatsApp)
- Process (4 steps) + Why Tiqnora + final CTA banner
- Lightweight: single CSS file, minimal JS (menu + year), IBM Plex Sans Arabic with `display=swap`
- Target: Lighthouse 95+ (no heavy video, no layout-shifting libs, CSS-only motion, `prefers-reduced-motion` respected)

### New service pages (world-class structure)
1. `services/web-design.html` — mockup frame (CSS), before/after, scope without numbers, CTAs
2. `services/ai-agents.html` — same pattern + chat-style mock visual
3. `services/social-automation.html` — same pattern + calendar-style mock visual

All pages share the same design system, RTL Arabic primary, performance-first.

## Files delivered
```
tiqnora-frontend-v4/
  index.html
  styles.css
  FRONTEND-V4-REPORT.md
  services/
    web-design.html
    ai-agents.html
    social-automation.html
```

## How to deploy
1. Replace root `index.html` and `styles.css` in the repo with these versions.
2. Add/overwrite the three files under `services/`.
3. Commit + push to `main` → Vercel auto-deploys.
4. Keep existing `shop.html`, admin, API, and Supabase untouched.

## Performance notes
- No external JS frameworks
- No video, no Lottie, no heavy image carousels on homepage
- Animations limited to opacity/transform on 6 small nodes
- Font: one family, weights 400–700 only
- Critical path: HTML + one CSS + one font request

## Next optional steps (not done in this pass)
- Wire i18n (EN) if still required
- Add 1–2 real project screenshots later (optimized WebP)
- Soft-link remaining old service SEO pages to new structure
- Lighthouse audit on production after deploy
