# Tiqnora V6.1 CORE — Implementation Plan

**Branch:** `tiqnora-v6-growth-os`  
**Principle:** Additive only. Extend existing tables. No production breakage.

---

## Step 0 — Branch & baseline

1. Create branch `tiqnora-v6-growth-os` from `main`.
2. Confirm latest migrations applied in owner’s Supabase (owner runs SQL; code assumes 045+).
3. No code deploy to production until owner merges + runs migrations.

---

## Step 1 — Database migrations (safe, versioned)

**File:** `supabase/migrations/046_v6_crm_core.sql`

Contents (idempotent):

1. Extend `leads`:
   - `company_name`, `contact_name`, `whatsapp`, `website`, `city`, `country`, `industry`
   - `pipeline_stage`, `lead_score`, `opportunity_score`, `score_breakdown jsonb`
   - `estimated_value`, `assigned_agent` (text/slug), `last_contact_at`, `next_followup_at`
   - Keep all existing columns.

2. New tables:
   - `crm_companies`
   - `crm_contacts`
   - `crm_pipelines` + `crm_pipeline_stages` (seed default sales pipeline)
   - `crm_opportunities`
   - `crm_activities`
   - `conversations`
   - `messages`
   - `appointments`
   - `appointment_services` (minimal)
   - `follow_ups`
   - `actions` (approval engine)

3. Extend `ai_tasks`:
   - `related_entity_type`, `related_entity_id`, `requires_approval`, `approved_by`, `goal`, `context`

4. Indexes + FKs + RLS (admin + org-scoped patterns).

5. Seed one default pipeline: Lead → Contacted → Qualified → Proposal → Negotiation → Won / Lost.

**File:** `supabase/migrations/047_v6_link_social_to_crm.sql`  
- Add `lead_id`, `contact_id`, `conversation_id` to `social_events` / `social_event_actions` where useful.

---

## Step 2 — AI Provider abstraction

```
lib/ai/provider.js
lib/ai/providers/gemini.js   (reuse existing call patterns)
lib/ai/sales-agent.js
lib/ai/intent.js
```

Functions: `generateText`, `generateStructured`, `classifyIntent`, `scoreLead` (stub for V6.2), `generateSalesReply`.

---

## Step 3 — Action Approval Engine (API + logic)

```
api/actions/create.js
api/actions/list.js
api/actions/approve.js
api/actions/reject.js
api/actions/execute.js   (internal, after approve)
lib/actions/engine.js
```

Statuses enforced in one place. Execution adapters for WhatsApp / Meta reply reuse existing social code.

---

## Step 4 — CRM APIs & Admin UI

- APIs (or direct Supabase from admin with RLS): list/filter leads, update stage, create activity, link conversation.
- Admin sections:
  - **CRM** — companies, contacts, opportunities (lightweight)
  - **Leads** — upgraded list + detail drawer (score, stage, timeline, conversations)
  - Keep existing leads section working; enhance progressively.

---

## Step 5 — Unified Inbox V2

- Map `social_events` → `conversations` + `messages` on ingest (webhook enhancement).
- Admin Inbox UI: threads, AI intent badge, “Create/Link Lead”, “Draft reply” → creates `action` pending approval.
- Reuse `js/social-inbox-admin.js` / admin-app section; extend, don’t replace.

---

## Step 6 — AI Sales Agent

- On conversation or lead open: load context (lead + recent messages).
- Classify intent, suggest qualification questions, propose next best action.
- Always produce **draft** message → `actions` row status=`pending_approval`.
- Extract structured fields (budget, timeline, interest…) into lead/opportunity when approved path runs.

---

## Step 7 — Booking + Follow-up (minimal)

- Create appointment from approved action or manual form.
- Schedule `follow_ups` when stage changes or no-reply window detected (rule-based, not AI auto-send).
- Dashboard shows upcoming appointments + pending follow-ups.

---

## Step 8 — Dashboard Growth Home

New home view cards:
- Leads Today, Qualified, Hot Opportunities
- Appointments, Pipeline Value, Won (period)
- Unread Conversations, Actions Awaiting Approval
- Growth Funnel strip
- Today’s AI Actions (from ai_tasks + actions completed today)

---

## Step 9 — Observability

- Structured log helper for AI runs and action execution (no secrets).
- `actions.error_code` / `error_message` / `retry_count`.

---

## Step 10 — Testing scenario (acceptance)

1. Insert or receive a lead.
2. Create/link conversation.
3. Sales Agent generates draft reply → action pending.
4. Approve → execute (or simulate execute).
5. Mark qualified → stage moves.
6. Create appointment.
7. Create follow-up.
8. Dashboard counters update.
9. History (activities + actions) intact.
10. Existing commerce / social / workforce still work.

---

## Commit strategy (examples)

```
feat(v6): add CRM core migration 046
feat(v6): action approval engine
feat(crm): extend leads and opportunities models
feat(inbox): conversations and CRM linkage
feat(ai-sales): qualification and draft reply flow
feat(booking): appointments minimal
feat(dashboard): growth funnel home
docs(v6): audit architecture plan
```

Small, reviewable commits.

---

## Environment variables (new / required for V6.1)

No new secrets strictly required for core CRM UI.  
For live AI + send:
- Existing: `GEMINI_API_KEY` (or other providers), Meta/WhatsApp tokens, `SUPABASE_SERVICE_ROLE_KEY`
- Optional later: calendar credentials

---

## Rollback plan

- Migrations are additive; rollback = stop using new tables / feature flags off in UI.
- Branch can be abandoned; main untouched until merge.
- If a migration must be reversed: write compensating migration (drop only empty new tables after confirmation).

---

## Next after V6.1

**V6.2** — Lead Intelligence + Opportunity Score + Research Agent.

---

## Owner actions required

1. Review this plan + audit.
2. After code lands on branch: run `046` then `047` in Supabase SQL Editor.
3. Set any missing env vars.
4. Test acceptance scenario on Preview URL.
5. Merge to main when green.
