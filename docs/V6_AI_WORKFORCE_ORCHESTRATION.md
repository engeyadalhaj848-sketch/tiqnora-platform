# Tiqnora V6 — AI Workforce Orchestration

## Architecture

Manager Agent orchestrates **whitelisted** workflows. Each step produces **structured JSON**, validates contracts, and never executes external side effects without Human Approval.

```
Trigger → workflow_run → steps[] → waiting_approval → (human) → external adapter
```

## Agents

See `lib/v6/workforce/registry.js` (`AGENT_REGISTRY`).

Status is **not** “active” merely because a DB row exists. Use `resolveAgentStatus()`.

## Workflows

See `WORKFLOW_REGISTRY`:

- lead_to_proposal
- lead_followup
- daily_marketing
- social_content
- reputation_response
- seo_opportunity
- customer_success
- sales_reactivation
- morning_operations / evening_operations

## Approval gates

External actions (WhatsApp, social publish, review reply, proposal send) always:

`requires_approval=true` · `auto_send=false` · `auto_publish=false`

Enforced in code via `GLOBAL_GUARDS`, not prompts alone.

## Safety

- No dynamic user-selected function execution
- Idempotency keys per org + workflow + event/entity
- Max steps / retries
- Retry only on transient provider/network errors
- No price invention; proposal pricing remains human-controlled

## Observability

`workflow_runs` + `workflow_steps` (migration 055). Reuses `ai_tasks` / `actions` where useful.

## API

`/api/v6?route=workforce&op=...`

ops: status, agents, workflow_list, workflow_start, workflow_runs, daily_report, analytics, next_best_action
