# Tiqnora V6 — Sales Playbooks + Follow-up Intelligence

This module runs after Inbox CRM Intelligence and Lead Enrichment. It is deterministic and side-effect free: no database writes, no scheduling and no outbound messaging.

## Architecture

Inbox event -> `analyzeInboxEvent()` -> `enrichLead()` -> `buildSalesPlaybookResult()`

The result provides:
- selected vertical playbook
- one-at-a-time qualification plan
- conversation strategy
- quote readiness
- follow-up recommendation
- next sales action
- human-approval boundary

## Vertical playbooks

Supported:
- dental_clinic
- clinics
- real_estate
- restaurants
- hotels
- salons
- retail
- contracting
- professional_services
- general

The module consumes `VERTICALS` from `lead-enrichment.js`; it does not duplicate the service packs.

## Qualification

Each vertical has an ordered question flow. Only one `next_question` is exposed for the next reply. `remaining_questions` are internal planning data. `qualification_progress` is deterministic.

## Quote readiness

`evaluateQuoteReadiness()` scores whether enough scope data exists to prepare a quote draft. It never invents a price. Service interest, vertical, timeline, budget, decision maker and a contact method contribute to readiness.

## Follow-up

`recommendFollowUp()` returns recommendations only:
- no_follow_up
- same_day
- next_day
- 2_days
- 3_days
- 7_days

It never schedules a job and never sends a message.

## Approval boundary

Every potentially external sales action has `requires_approval:true`. The result also hard-codes:
- `auto_send:false`
- `auto_schedule:false`
- `invent_prices:false`

## Integration

```js
const inbox_analysis = await analyzeInboxEvent(event, { existingCandidates });
const enrichment = await enrichLead({ inbox_analysis, lead });
const playbook = buildSalesPlaybookResult({
  inbox_analysis,
  enrichment,
  lead,
  conversation: {
    unanswered_inbound,
    message_count
  }
});
```

The authenticated server integration may use this result to create draft Actions or follow-up recommendations, but must preserve human approval before external communication.
