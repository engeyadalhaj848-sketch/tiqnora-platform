# Agentic WhatsApp Sales → Proposal Review (MVP, opt-in)

## Scope
For confirmed customer-initiated WhatsApp sales inquiries only, Tiqnora already runs YCloud webhook → social CRM bridge → WhatsApp Sales Manager qualification → owner handoff. This feature adds a reviewable proposal draft and workflow_runs + workflow_steps audit.

Path: verified YCloud inbound → social_events → conversation/lead → customer confirms requirements → qualified CRM handoff → safe proposal composer → actions.proposal_review (pending_approval) → workflow_runs (waiting_approval) → Telegram owner notice.

This change NEVER messages customers, sets confirmed prices, signs contracts, publishes, or changes ownership of a protected deal. Sending an approved proposal is a distinct operator action supported by the existing delivery workflow. A Telegram notice is NOT an approval or customer delivery.

## Rollout
- Flag: AGENTIC_SALES_PROPOSAL_DRAFTS_ENABLED=true; absence/other values = OFF.
- Enable preview branch only first. Keep production OFF until verified owner approval, confirmed-pricing flow and inbox checks.
- No SQL migrations. Reuses actions, workflow_runs, workflow_steps, CRM and existing RLS.
- Existing exclusion checks, verified connections, commercial-deal protection, human takeover and opt-out remain ahead of this code.
- Only customer_confirmed_requirements handoffs queue a proposal. Requests simply to speak to a human do not.
- Missing required links or unsupported service skip the new flow and preserve existing human notifications.
- Customer-provided budget is unverified and NEVER Tiqnora's offered price.
- If Telegram is offline, the review action remains saved. No customer send occurs.
- Idempotency: social_event_actions reservation, plus query by action payload source_event_id and unique workflow key.

## Verification
- npm run test:v6 includes tests/v6-whatsapp-agentic-proposal.test.mjs and existing WhatsApp/CRM/delivery regression suites.
- Check tenant linking, duplicate prevention, no external messages, human pricing, Telegram failure recovery and recorded workflow steps.
- Preview smoke test with a synthetic approved test number only: check exactly one review action and waiting_approval workflow; confirm no YCloud outbound from this module.

## Not yet included (Phase 2)
- Owner-confirmed price and an authenticated Telegram review-and-approve callback.
- Separate delivery step with a verified WhatsApp recipient, 24h customer-service window / provider-approved template checks, consent and takeover safeguards.
- Idempotent provider send claim, delivery-status reconciliation and approved follow-up scheduler.
- Sandbox integration test before production activation.

A successful preview build verifies source/tests, not live customer delivery.
