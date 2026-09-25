# Tiqnora V6 — Full Repository Audit
**Date:** 2026-09-25  
**Repo:** https://github.com/engeyadalhaj848-sketch/tiqnora-platform  
**Production:** https://tiqnora.com  
**Supabase:** mndyabvlhvrhdbgmepkg  
**Branch audited:** main (latest ~04a7f4c / Sep 22–24 2026)

---

## 1. Architecture Snapshot

| Layer | Technology | Status |
|-------|------------|--------|
| Frontend public site | Static HTML/CSS/JS (no framework), RTL/LTR, Vercel | EXISTS — production |
| Admin panel | `admin.html` + monolithic `js/admin-app.js` (~18 sections) | EXISTS — production |
| AI Workforce UI | `/admin/ai-workforce/` (dedicated page) | EXISTS |
| Backend | Supabase (Postgres + Auth + RLS + Storage) | EXISTS |
| Serverless APIs | Vercel `/api/*` (Node) | EXISTS |
| Mobile | Flutter under `mobile/` (Customer + Admin by role) | EXISTS (M0–M3) |
| Commerce | Products, checkout, dropshipping (CJ), National Day | EXISTS |
| Social | Meta (FB/IG/WA), TikTok, Telegram, webhook adapters | EXISTS / PARTIAL |

**Style:** Static site + thin serverless + thick admin SPA (vanilla JS). Not a Next.js/React app. Multi-tenant foundation via `organizations` + `organization_members` already present.

---

## 2. Supabase Migrations (45 files)

Ordered list observed:

```
002_security_hardening → 003_ai_workforce → 004_social_inbox → 005_integrations_registry
006_social_channels → 007_gemini → 008_oauth_tokens → 009_commerce_dropship
010_phase1 → 011_saas_phase2 → 012_subscription_billing → 013_notifications_analytics
014_growth_demo → 015_blog_seo → 016_leads_analytics_sales → 017_mobile_foundation
018–028 commerce/catalog → 029–035 quality/CJ → 036–045 payments/Telegram/security
```

**Core tables present:**

- Auth & tenancy: `profiles`, `organizations`, `organization_members`, `role_permissions`
- Catalog/commerce: `services`, `products`, `orders`, `customers`, `shipments`, suppliers, CJ workflow
- SaaS: `saas_plans`, `subscriptions`, `usage_meters`, `customer_projects`, `service_requests`
- AI Workforce: `ai_agents`, `ai_conversations`, `ai_tasks`, `ai_memory`
- Social: `social_connections`, `social_events`, `social_automation_rules`, `social_event_actions`, OAuth tokens
- Leads (basic): `leads` (+ enrichment columns from 016/042)
- Analytics: `analytics_events`, `page_views`, `marketing_automations`
- Notifications, Telegram command center, etc.

---

## 3. Status Matrix (EXISTS / PARTIAL / MISSING / BROKEN / DEPRECATED)

### Authentication & Roles
| Item | Status | Notes |
|------|--------|-------|
| Supabase Auth | EXISTS | profiles + role enum (customer/admin/super_admin) |
| RLS helpers (`is_admin()`) | EXISTS | Used widely |
| Organization membership | EXISTS | Multi-tenant ready |
| Fine-grained permissions | PARTIAL | role_permissions table exists; not fully driven in UI |

### CRM Core (V6 target)
| Item | Status | Notes |
|------|--------|-------|
| `leads` table | PARTIAL | Basic: name, email, phone, message, source, status (new/contacted/qualified/converted/closed). Extra: notes, company, interest, UTM, assigned_to, updated_at |
| Contacts / Companies separate | MISSING | Only flat leads |
| Opportunities | MISSING | |
| Pipelines / Stages | MISSING | Status is simple enum, not pipeline stages |
| Activities / Tasks (CRM) | MISSING | ai_tasks exist but agent-centric, not CRM-entity-centric |
| Notes (structured) | PARTIAL | free-text notes on lead only |
| Conversations linked to lead | MISSING | social_events not joined to leads |
| Appointments / Booking | MISSING | |
| Quotes | MISSING | |
| Follow-ups engine | PARTIAL | marketing_automations has follow_up kind; no full engine |
| Lead score / Opportunity score | MISSING | |
| Custom fields / Tags | MISSING | |
| assigned_agent + assigned_user | PARTIAL | assigned_to (user) only |

### Social / Unified Inbox
| Item | Status | Notes |
|------|--------|-------|
| social_connections | EXISTS | platform + external_account_id |
| social_events (inbound) | EXISTS | events, intent, processing_status |
| Automation rules | EXISTS | keyword/intent → create_lead / reply template |
| social_event_actions | EXISTS | pending/completed/failed |
| Meta webhook + signature | EXISTS | `api/social/webhook.js` + adapters |
| OAuth Meta / WhatsApp | EXISTS | recent commits |
| Outbound reply | PARTIAL | Meta reply path exists; approval layer incomplete |
| Unified conversation model (threads) | MISSING | Event-centric, not thread/conversation-centric |
| Link event → lead_id / contact_id | MISSING / PARTIAL | create_lead flag but weak linkage |
| TikTok / Telegram | PARTIAL | TikTok content + Telegram command center |

### AI Workforce
| Item | Status | Notes |
|------|--------|-------|
| ai_agents | EXISTS | marketing, content, social-media, developer + sales |
| ai_conversations / ai_tasks / ai_memory | EXISTS | |
| Chat API (`/api/ai-workforce/chat`) | EXISTS | Admin-gated, multi-provider |
| Providers abstraction | PARTIAL | providers.js + Gemini/OpenAI/Anthropic/xAI env |
| Sales agent | EXISTS | Public `/api/sales/chat` + autonomous-sales lib (commerce oriented) |
| Shared Task System with approval | PARTIAL | ai_tasks exist; no full Action/Approval engine for external side-effects |
| Brand Brain | MISSING | |
| Multi-agent workflow orchestration | MISSING | Agents mostly isolated chat |

### Booking / Appointments
| Item | Status | Notes |
|------|--------|-------|
| Services / Staff / Availability / Slots | MISSING | |
| Appointments table | MISSING | |
| Reminders / Reschedule | MISSING | |

### Lead Intelligence / Opportunity Score
| Item | Status | Notes |
|------|--------|-------|
| Discovery (Places / import / CSV) | MISSING | |
| Enrichment (website, social, reviews) | MISSING | |
| Opportunity Score + breakdown JSONB | MISSING | |

### Approval / Action Engine
| Item | Status | Notes |
|------|--------|-------|
| Generic action layer (draft → pending_approval → …) | MISSING | social_event_actions is narrow |
| Human approval for outbound messages | PARTIAL | Commerce has owner-approval pattern; social weaker |

### Dashboard / Growth Funnel
| Item | Status | Notes |
|------|--------|-------|
| Admin home counters | PARTIAL | Some counts (leads, etc.) |
| Growth Funnel (Discover→Retain) | MISSING | |
| Today's AI Actions | MISSING | |
| Business outcomes focus | PARTIAL | Commerce/product heavy |

### Other
| Item | Status | Notes |
|------|--------|-------|
| White-label ready (tenant_id) | PARTIAL | organizations exist; not fully enforced everywhere |
| Vertical packs | MISSING | |
| Reputation / Reviews engine | MISSING | |
| Local SEO / GEO AI Visibility | MISSING | |
| Content Calendar / Social Studio | PARTIAL | Agents can generate; no full campaign workflow |
| Observability / structured logs | PARTIAL | activity_logs; limited AI run logging |
| Performance indexes | EXISTS | 039_admin_performance_indexes |

---

## 4. Existing APIs (high level)

```
api/
  ai-workforce/chat.js, providers.js
  billing/providers.js
  commerce/ai.js, connectors.js
  customer/ai-chat.js
  mobile/[action].js
  products/bulk-action.js
  reports/telegram.js          (cron)
  sales/chat.js
  social/oauth/[provider].js, webhook.js
```

No dedicated CRM / appointments / actions / approval APIs yet.

---

## 5. Admin Navigation (current)

From `admin-app.js` (observed sections):
- Dashboard / services / products / orders / shipping
- Leads (basic list + status/notes)
- Social Inbox
- AI Workforce (link-out)
- Commerce / suppliers / CJ
- Users, CMS, SEO, settings, logs, etc.

**Proposed V6 nav (target):** Dashboard · Inbox · CRM · Leads · Sales · Marketing · AI Workforce · Growth · Analytics · Settings

---

## 6. Environment Variables (from .env.example)

Public: `SUPABASE_URL`, `SUPABASE_ANON_KEY`  
Server: `SUPABASE_SERVICE_ROLE_KEY`, Gemini/OpenAI/Anthropic/xAI keys, Meta/WhatsApp, Telegram, CJ/AliExpress, `SOCIAL_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`

**No secrets observed in frontend source** (good). Keep this discipline.

---

## 7. Vercel

- Static build (`build.mjs` → `dist/`)
- Serverless functions under `/api`
- Crons: Telegram reports (05:00 & 17:00)
- Security headers present
- Hobby function limit previously addressed (merge)

---

## 8. Critical Gaps for V6.1 CORE

1. **CRM model incomplete** — no opportunities, pipelines, appointments, structured activities, conversation↔lead link.
2. **No Approval/Action engine** for outbound AI messages.
3. **Social Inbox is event-based**, not conversation/thread-based with CRM linkage.
4. **No Booking Engine**.
5. **No Follow-up Engine** beyond basic marketing_automations.
6. **Dashboard not outcome-oriented** (Growth Funnel missing).
7. **Lead score / opportunity score** missing.
8. **admin-app.js is monolithic** — risk of size/performance; gradual modularization recommended.

---

## 9. Strengths to Build On (do not rebuild)

- Organizations + multi-tenant seed
- ai_agents / ai_tasks / ai_conversations / ai_memory
- social_events + automation rules + webhook adapters
- leads table (extend, don’t replace)
- Sales agent + Gemini provider patterns
- Commerce approval pattern (owner must approve) — reuse philosophy for AI actions
- RLS + is_admin() helpers
- Mobile foundation already shipping

---

## 10. Engineering Decisions (locked for V6)

1. Extend `leads` via safe additive migrations; introduce `crm_contacts`, `crm_companies`, `crm_opportunities`, `crm_pipelines`, `crm_pipeline_stages`, `crm_activities`, `appointments`, `follow_ups`, `actions` (approval engine).
2. Keep `social_events`; add `conversations` + `messages` that can reference events and link to `lead_id` / `contact_id`.
3. Reuse `ai_tasks` and extend with `related_entity_type/id`, `requires_approval`, `approved_by`.
4. Introduce `actions` table as the single gate for any external side-effect.
5. AI Provider abstraction in `lib/ai/` (generateText, classify, scoreLead, generateReply).
6. Branch: `tiqnora-v6-growth-os`.
7. No destructive migrations. No force-push. Production stays stable until explicit merge + owner SQL run.

---

**Audit complete. Proceeding to Architecture + Implementation Plan, then V6.1 code.**
