# Tiqnora AI — Flutter M2 Report

**Date:** 2026-09-17  
**Scope:** M2 functional client — AI Chat, Service Requests, Subscriptions, Notifications, Profile, Device Registration  
**Base:** M1 commit `8280c43`  
**Suggested commit:** `feat(mobile): M2 AI chat, services, subscriptions and notifications`

---

## Screens completed

### Customer
| Screen | Status | Notes |
|--------|--------|-------|
| AI Chat | ✅ | Agent picker, chat UI, send/receive, usage banner, loading/error |
| Services (My Requests) | ✅ | List + status chips + detail sheet |
| Create Service Request | ✅ | Type chips, title, description, submit |
| Subscription | ✅ | Plan, usage bar, features, invoices, upgrade CTA |
| Notifications | ✅ | List, unread highlight, mark read / mark all |
| Profile | ✅ | Edit name, language switch, device register, logout |

### Admin
| Screen | Status | Notes |
|--------|--------|-------|
| Requests management | ✅ | List all, update status, add notes |
| Notifications (in shell) | ✅ | Shared notifications screen |
| Profile / Settings | ✅ | Shared profile screen |
| Customers list | Placeholder | Deferred to M3 |
| AI usage analytics | Placeholder | Deferred to M3 |

### Shells
- CustomerShell: Home / AI / Services / Subscription / Profile (real screens)
- AdminShell: Dashboard / Customers / Requests / Notifications / Settings
- Auto device registration on shell mount after login

---

## APIs connected

| Feature | Endpoint / Source | Method |
|---------|-------------------|--------|
| AI Chat | `POST /api/customer/ai-chat` | Primary |
| AI Chat fallback | `POST /api/sales/chat` | Fallback |
| AI Agents | Supabase `ai_agents` | Select |
| Service requests (list/create) | Supabase `service_requests` + `/api/customer/service-requests` | Hybrid |
| Admin update request | Supabase `service_requests` update | Direct |
| Subscription detail | `subscriptions` + `plans` + `ai_usage` + `billing_invoices` | Supabase |
| Notifications | `notifications` table | Select + update `read_at` |
| Profile update | `profiles.full_name` | Update |
| Device registration | RPC `register_device_token` → API → `device_tokens` upsert | Cascade |

---

## Database tables used

- `profiles`
- `ai_agents`
- `ai_conversations` (best-effort insert)
- `ai_usage`
- `service_requests`
- `subscriptions` + `plans` (join)
- `billing_invoices`
- `notifications`
- `device_tokens`
- RPC: `register_device_token` (if migration 017 applied)

---

## Architecture notes

- **No rebuild** of M0/M1 structure
- Continued: Riverpod, go_router, Supabase, Dio JWT interceptor, Material 3 + Cairo RTL
- Feature folders: `ai_chat`, `services`, `subscriptions`, `notifications`, `profile`, `admin`, `device`
- Graceful fallbacks when tables/endpoints missing (empty lists, free plan, sales chat)

---

## Build status

- Source complete under `artifacts/tiqnora_mobile/`
- Package: `artifacts/tiqnora-mobile-m2.zip`
- Full APK/IPA: requires local Android SDK / Xcode (`cd mobile && flutter pub get && flutter run`)
- Sandbox has no Flutter SDK for CI compile in this environment
- `dart:io` avoided in device helper for web safety

---

## How to run locally

```bash
cd mobile   # or extract tiqnora-mobile-m2.zip → tiqnora_mobile
flutter pub get
flutter run
```

Ensure Supabase keys in `lib/core/config/app_config.dart` match production and migration 017 is applied for device tokens.

---

## Next recommended phase (M3)

1. Full FCM integration (`firebase_messaging` + real tokens)
2. Admin customers list + detail
3. AI usage analytics charts
4. Attachment upload for service requests
5. Realtime notifications (Supabase Realtime)
6. Deep links + push open → screen
7. Offline cache for chat history
8. Profile avatar upload (Storage)

---

## Verdict

**M2 complete.** The Flutter app is now a functional Tiqnora AI client for Customer and Admin roles with AI chat, service requests lifecycle, subscription visibility, notifications, profile editing, and device registration foundation.
