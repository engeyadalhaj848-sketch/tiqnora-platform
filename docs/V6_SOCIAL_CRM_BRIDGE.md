# Tiqnora V6 — Social CRM Bridge

This server-side bridge connects normalized Social Inbox events to V6 CRM without creating a new serverless function.

Flow:

Social webhook -> social_events -> social-crm-bridge -> Inbox CRM Intelligence -> Lead Enrichment -> crm_contacts / leads / conversations / messages.

## Safety and idempotency

- Only inbound `message.received` and `comment.created` events are processed.
- Own-account echoes, YCloud app echoes, delivery/read statuses and passive events are ignored by the CRM bridge.
- Lead matching follows the existing V6 priority: phone, email, platform + external user id, platform + username.
- Name-only matching never auto-merges.
- Messages use `platform:external_event_id` as the external id and respect the existing unique DB index.
- Conversations use deterministic platform/thread keys.
- No outbound message is sent by this module.
- No new migration is required.

The webhook passes its existing server-side Supabase REST helper into `persistSocialCrmEvent()`, so service-role credentials stay server-only.
