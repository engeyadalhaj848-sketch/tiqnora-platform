# Growth Engine V1 — Architecture

## Canonical URL strategy
- Vercel `cleanUrls: true`
- Public canonicals are **extensionless** (e.g. `/services/web-design`)
- Sitemap and internal links must match the same form
- `.html` requests resolve to the clean URL

## Daily workflow (no auto-send)
1. Discover prospects (manual import / future connectors)
2. Deduplicate (domain, phone_norm, name+city)
3. Audit website signals → `audit_json`
4. Score via `score_prospect_from_audit` → priority HIGH/MEDIUM/LOW
5. Generate `outreach_drafts` with status=`draft`
6. Admin reviews in **Growth · Prospects**
7. Admin **Approve** (status=`approved`) — still no automatic send
8. Future: send only via authorized channel + Meta/opt-in rules
9. Track response → update prospect status → convert to lead when appropriate

## Analytics event names (suggested)
- page_view, cta_whatsapp, service_view, shop_view, lead_submit
- prospect_approved, outreach_sent, outreach_replied

## Scoring weights (v1)
| Signal | Points |
|--------|--------|
| No website | +30 |
| Weak/outdated website | +20 |
| Poor mobile | +10 |
| No WhatsApp | +10 |
| No Instagram | +5 |
| No Google CTA | +5 |
| No contact form | +5 |
| Needs booking & missing | +10 |
| Missing SEO basics | +10 |

HIGH ≥ 60 · MEDIUM ≥ 30 · LOW < 30
