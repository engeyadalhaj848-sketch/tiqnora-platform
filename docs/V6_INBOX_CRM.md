# Tiqnora V6 — Inbox -> CRM Intelligence

This module converts normalized inbound inbox/social events into CRM-safe analysis and payload suggestions. It performs no database writes and no outbound messaging.

## Input
analyzeInboxEvent(event, options) accepts platform, external_user_id, external_thread_id, external_message_id, author_name, phone, email, username, content, received_at, and metadata. The contract is platform-neutral for WhatsApp, Instagram, Facebook, TikTok, Telegram, website chat, and future adapters.

## Output
The result includes normalized contact data, intent, lead temperature, industry, service interests, location, qualification, CRM recommendations, deterministic opportunity score with reasons, match details, and payloads for leads, conversations, and messages. Unknown facts remain null.

## Matching
Priority: phone, email, platform + external user id, platform + username, then exact normalized name as suggestion only. Name-only matches are never auto-merged.

## Opportunity score
calculateInitialOpportunityScore() uses intent, quote/booking signals, requested services, industry/business context, phone/WhatsApp availability, timeline, budget, and decision-maker signals. Support, complaint, existing-customer, spam, and general-question intents score zero.

## Migration 046 mapping
lead_payload maps to public.leads.
conversation_payload maps to public.conversations.
message_payload maps to public.messages.
crm.should_create_opportunity and suggested_stage are consumed later by the server integration for crm_opportunities and crm_pipeline_stages.
The integration layer must inject organization_id and resolved foreign keys.

## AI enrichment
Default behavior is deterministic. With useAI:true, the module uses the existing lib/ai/provider.js abstraction for conservative enrichment. Provider failures fall back to deterministic analysis.

## Safety boundary
This module sends no WhatsApp, Instagram, Facebook, email, or other outbound message. It stores no secrets and performs no DB mutation. Writes belong in the authenticated server integration layer with tenant checks and RLS.

## Tests
Run: npm run test:inbox-crm
The suite covers sales, quote, existing booking changes, support, spam, de-duplication, name-only non-merge behavior, Saudi phone normalization, scoring, and migration-046 payload compatibility.
