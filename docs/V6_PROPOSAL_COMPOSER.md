# Tiqnora V6 — Proposal Composer

Pure business logic for preparing reviewable proposal drafts after Inbox Intelligence, Lead Enrichment, and Sales Playbooks.

## Architecture
Inbox → Enrichment → Sales Playbook → Proposal Composer → Human Review.

## Safety
The composer performs no DB writes, sends nothing externally, schedules nothing, and never invents price or delivery duration. Approval is always required.

## Readiness
Proposal readiness is deterministic. Missing scope, timeline, budget, decision-maker, contact method, and industry are tracked. Non-sales/support/spam cases are not treated as sales-ready proposals.

## Scope & deliverables
Scope is generated only from requested or enrichment-recommended services. Each recommended solution carries a source such as `customer_request` or `vertical_recommendation`. Unknown service details remain confirmation items rather than invented facts.

## Pricing
Without `confirmed_pricing`, pricing is always:
`requires_human_pricing`, with null subtotal/VAT/total and null line-item prices.
Confirmed pricing is passed through as input only. VAT is never calculated by this module.

## Timeline
The module preserves only a customer/CRM-provided requested timeline. It never invents delivery durations.

## Human approval
Every proposal returns:
```json
{"requires_human_review":true,"can_send":false,"auto_send":false}
```

## Languages
`buildProposalDraft(input, { language: 'ar' })` defaults to Arabic. English is supported with `language:'en'`.

## Integration
```js
const inbox_analysis = await analyzeInboxEvent(event, { existingCandidates });
const enrichment = await enrichLead({ inbox_analysis, lead });
const playbook = buildSalesPlaybookResult({ inbox_analysis, enrichment, lead });
const proposal = buildProposalDraft({ inbox_analysis, enrichment, playbook, lead, confirmed_pricing }, { language:'ar' });
```

The next server layer may persist a proposal draft or create a human-review Action, but this module itself does neither.
