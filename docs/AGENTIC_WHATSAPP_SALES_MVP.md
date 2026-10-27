# Agentic WhatsApp Sales → Proposal Review (MVP, opt-in)

## Scope
For confirmed customer-initiated WhatsApp sales inquiries only, Tiqnora already runs YCloud webhook → social CRM bridge → WhatsApp Sales Manager qualification → owner handoff. This feature adds a reviewable proposal draft and workflow_runs + workflow_steps audit.

Path: verified YCloud inbound → social_events → conversation/lead → customer confirms requirements → qualified CRM handoff → safe proposal composer → actions.proposal_review (pending_approval) → workflow_runs (waiting_approval) → Telegram owner notice.

This change NEVER messages customers, invents prices, signs contracts, publishes, or changes ownership of a protected deal. The administrator must explicitly enter and confirm pricing. The authorized Telegram owner must review the priced draft and confirm again against a price fingerprint. This Telegram approval NEVER sends to customers; delivery is a separate step.

## Rollout
- Flag: AGENTIC_SALES_PROPOSAL_DRAFTS_ENABLED=true; absence/other values = OFF.
- Enable preview branch only first. Keep production OFF until verified owner approval, confirmed-pricing flow and inbox checks.
- No SQL migrations. Reuses actions, workflow_runs, workflow_steps, CRM and existing RLS.
- Existing exclusion checks, verified connections, commercial-deal protection, human takeover and opt-out remain ahead of this code.
- Only customer_confirmed_requirements handoffs queue a proposal. Requests simply to speak to a human do not.
- Missing required links or unsupported service skip the new flow and preserve existing human notifications.
- Customer-provided budget is unverified and NEVER Tiqnora's offered price.
- If Telegram is offline, the review action remains saved. No customer send occurs.
- Owner Telegram buttons show only in a chat with a configured and authenticated owner user ID; approvals require BOTH exact chat and exact owner user match.
- Owner workflow: open the pending proposal in Admin > proposals history, enter confirmed total and check the explicit confirmation box, save; then tap Telegram 'اعتماد بعد التسعير', review the full price details, and tap second 'تأكيد اعتماد السعر'. The second approval is tied to a fingerprint; changed prices require repeating review.
- Rejections cancel the pending proposal; approvals mark it as approved but not sent.
- Idempotency: social_event_actions reservation, plus query by action payload source_event_id and unique workflow key.

## Verification
- npm run test:v6 includes tests/v6-whatsapp-agentic-proposal.test.mjs and existing WhatsApp/CRM/delivery regression suites.
- Check tenant linking, duplicate prevention, zero customer outbound, explicit admin pricing, two-step owner Telegram approval, stale-price rejection, Telegram failure recovery and recorded workflow steps.
- Preview smoke test with a synthetic approved test number only: check exactly one review action and waiting_approval workflow; confirm no YCloud outbound from this module.

## Not yet included (Phase 2: controlled customer delivery)
- Separate delivery step with a verified WhatsApp recipient, 24h customer-service window / provider-approved template checks, consent and takeover safeguards.
- Idempotent provider send claim, delivery-status reconciliation and approved follow-up scheduler.
- Sandbox integration test before production activation.

A successful preview build verifies source/tests, not live customer delivery.
