# Tiqnora V6 — Lead Enrichment + Vertical Packs

This module sits after `lib/v6/inbox-crm.js`. It is deterministic by default, performs no database writes, and does not send outbound messages.

## Input

`enrichLead({ inbox_analysis, lead, intent, opportunity_score, engagement_count }, { useAI })`

The recommended source is the result of `analyzeInboxEvent()`. Existing CRM lead fields can be supplied through `lead`.

## Output

The result contains:
- `vertical`: vertical id, confidence, and detection reason
- `pack`: Tiqnora vertical pack, pipeline, recommended agents
- `quality`: 0–100 deterministic quality score, grade, reasons, missing data
- `services`: primary/secondary recommendations and reasons
- `missing`: missing qualification fields and sector-aware questions
- `next_best_action`: ask_qualification, propose_meeting, prepare_quote, create_opportunity, follow_up, nurture, support_handoff, or no_action
- `enrichment_payload`: DB-safe suggestion payload for the authenticated integration layer

## Quality grades

- 0–29: low
- 30–59: medium
- 60–79: high
- 80–100: very_high

Scoring uses current opportunity score plus intent, direct contact data, company/city/industry/website availability, service breadth, budget, timeline, decision-maker signal, and prior engagement. Non-sales intents such as support, complaints, existing customers, spam, and general questions are not promoted as sales opportunities.

## Vertical packs

Implemented:
- clinics
- dental_clinic
- real_estate
- restaurants
- hotels
- salons
- retail
- contracting
- professional_services
- general

Each pack defines a recommended pipeline, agents, service set, and vertical qualification questions.

## AI enrichment

Default behavior is deterministic. With `useAI:true`, the module uses `lib/ai/provider.js` only to refine vertical classification. Weak or failed AI results fall back to deterministic output.

## Integration example

```js
import { analyzeInboxEvent } from './lib/v6/inbox-crm.js';
import { enrichLead } from './lib/v6/lead-enrichment.js';

const inbox = await analyzeInboxEvent(event, { existingCandidates });
const enrichment = await enrichLead({
  inbox_analysis: inbox,
  lead: existingLead || null,
  engagement_count: conversationMessageCount
});

// authenticated server layer may persist:
// enrichment.enrichment_payload
// enrichment.pack
// enrichment.next_best_action
```

No migration is required. The integration layer remains responsible for organization_id, RLS-safe writes, opportunity creation, and approval-controlled outbound actions.
