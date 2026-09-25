# Tiqnora V6 — Architecture
**AI Business Growth OS**  
**Target:** Unified growth workflow, not a toolbox of 100 tools.

---

## 1. North-Star Workflow

```
Lead discovered
  → Lead enriched
  → AI opportunity score
  → Added to CRM
  → Sales Agent assigned
  → Conversation started (Unified Inbox)
  → Lead qualified
  → Meeting / appointment
  → Quote
  → Follow-up
  → Won / Lost
  → Customer support
  → Review request
  → Marketing retention
```

All steps share the same entities: Organization → Company → Contact → Lead → Opportunity → Conversation → Appointment → Action.

---

## 2. Domain Model (V6.1 focus)

### Core entities (new or extended)

| Entity | Purpose | Key fields |
|--------|---------|------------|
| organizations | Tenant | already exists |
| crm_companies | Account | name, industry, city, country, website, size |
| crm_contacts | Person | name, phone, whatsapp, email, company_id |
| crm_leads (extend `leads`) | Sales interest | contact/company refs, source, status, pipeline_stage_id, lead_score, opportunity_score, score_breakdown JSONB, assigned_user, assigned_agent, estimated_value, last_contact_at, next_followup_at |
| crm_pipelines | Sales process | name, industry defaults |
| crm_pipeline_stages | Stages | pipeline_id, name, position, probability |
| crm_opportunities | Deal | lead_id, stage_id, value, expected_close |
| crm_activities | Timeline | type (call/note/email/meeting/task), entity refs, body |
| conversations | Thread | platform, external_thread_id, contact_id, lead_id, status, sentiment, intent, priority |
| messages | Message | conversation_id, direction, body, external_id, ai_meta |
| appointments | Booking | service, staff, start/end, status, lead_id, conversation_id |
| follow_ups | Scheduled next action | lead_id, due_at, reason, status, draft_message |
| actions | Approval gate | type, payload, status (draft→pending_approval→approved→executing→completed/failed/cancelled), related entity |
| ai_tasks (extend) | Agent work | related_entity_type/id, requires_approval, approved_by, input/output |
| brand_profiles | Brand Brain (V6.3) | later |

### Score storage

```sql
lead_score numeric
opportunity_score numeric
score_breakdown jsonb  -- { reasons: [...], factors: {...}, computed_at }
```

Never store score alone.

---

## 3. Action / Approval Engine (critical)

Any external side-effect must become an `action` row first:

```
draft → pending_approval → approved → executing → completed
                                      ↘ failed (retryable)
                                      ↘ cancelled
```

Action types (V6.1):
- `send_whatsapp`
- `send_instagram_dm`
- `send_facebook_message`
- `reply_comment`
- `create_appointment`
- `send_quote` (placeholder)
- `create_followup`

AI never mutates CRM or sends messages directly.  
AI proposes → business logic validates → human approves (default) → system executes.

Later: per-channel / per-customer Auto Mode flag.

---

## 4. AI Layer

```
lib/ai/
  provider.js          # generateText | generateStructured | classify | summarize | scoreLead | generateReply
  providers/
    gemini.js
    openai.js
    ...
  sales-agent.js       # qualification, next-best-action, draft reply
  intent.js            # classify message intent
```

Rules:
- Structured JSON outputs preferred.
- Validate schema before persist.
- Log every AI run (provider, model, tokens if available, latency, success/fail) without secrets.
- Prefer existing Gemini + multi-provider env already in repo.

---

## 5. Unified Inbox V2

Build on `social_events` + new `conversations` / `messages`.

- Ingest webhook → normalize → upsert conversation + message → optional AI classify → link or create lead → suggest action (draft).
- UI: single inbox filtered by platform / status / assigned / intent.
- Reply always creates draft action requiring approval (default).

Platforms architecture: WhatsApp, Instagram, Facebook Messenger, Comments, TikTok, Telegram, Website Chat, Email (future), Google Business (future).

---

## 6. Booking Engine (V6.1 minimal)

Tables: `appointment_services`, `appointment_staff` (optional), `appointment_availability`, `appointments`.

Flow:
1. Intent = booking detected in conversation.
2. AI suggests slots (from availability or free-text).
3. Draft reply with slots → human approves.
4. Customer selects → appointment created → CRM activity + opportunity stage update → follow-up reminder scheduled.

Google Calendar adapter later (interface only in V6.1).

---

## 7. Follow-up Engine

`follow_ups` table + rules engine (time since last contact, stage, score, sentiment).

Sales Agent proposes draft; never auto-sends in V6.1.

---

## 8. Dashboard (Home)

Outcomes only:
- Leads Today / Qualified / Hot Opportunities
- Appointments / Pipeline Value / Won
- Unread Conversations / Tasks Awaiting Approval
- AI Workforce Status
- Growth Funnel visualization
- Today’s AI Actions summary

Navigation:
```
Dashboard | Inbox | CRM | Leads | Sales | Marketing | AI Workforce | Growth | Analytics | Settings
```

Growth houses SEO / Local / Reputation / AI Visibility (later phases).

---

## 9. Multi-tenancy & White-label readiness

- Every new table carries `organization_id` where data is tenant-scoped.
- RLS policies use organization membership (extend existing helpers).
- Brand / domain / colors later via organization settings + brand_profiles.

---

## 10. Performance & Mobile

- Server-side pagination + filters for leads/conversations.
- Count via `head: true` / exact count.
- Avoid loading full message history without limit.
- Admin UI must be usable at 390 / 768 / 1440.
- Gradual extraction of modules from `admin-app.js` (do not big-bang rewrite).

---

## 11. Security

- All secrets server-only (Vercel env).
- Webhook signature verification retained.
- Action execution only after approval + authz check.
- Tenant ownership check on every read/write.
- No AI direct DB mutation for sensitive tables.

---

## 12. Phased delivery

| Version | Scope |
|---------|--------|
| **V6.1 CORE** | CRM Core, Unified Inbox V2 (conversation model), AI Sales Agent + drafts, Booking minimal, Follow-up, Approval Engine, Growth Dashboard |
| V6.2 | Lead Intelligence, Opportunity Score, Lead Research Agent |
| V6.3 | Social Studio, Brand Brain, AI Workforce multi-agent workflows |
| V6.4 | Reputation, Local SEO, GEO / AI Visibility |
| Later | Vertical packs, White-label, Voice placeholder |

---

## 13. Non-goals for V6.1

- Full auto-send to customers
- Voice Agent (architecture placeholder only)
- Scraping that violates platform ToS
- Rebuilding commerce or public marketing site
- Destructive data migration
