# Tiqnora AI — Flutter M3 Production Readiness Report

**Date:** 2026-09-17  
**Base commit:** `442812d` (M2)  
**Suggested commit:** `feat(mobile): M3 production readiness and push notifications`  
**Version:** `1.1.0+3`

---

## Features completed

### M3.1 — UX Polish
| Item | Status |
|------|--------|
| Shared loading / empty / error widgets | ✅ `lib/core/widgets/app_states.dart` |
| Fade-slide animation helper | ✅ |
| Splash animation (fade + scale) | ✅ |
| Directionality AR RTL / EN LTR via settings | ✅ |
| Navigation: settings route + admin tab | ✅ |

### M3.2 — Push notifications
| Item | Status |
|------|--------|
| PushService layer | ✅ `lib/features/push/push_service.dart` |
| Device registration cascade (RPC → API → table) | ✅ |
| Secure token storage | ✅ |
| Permission entry in Settings | ✅ |
| Android POST_NOTIFICATIONS + FCM channel meta | ✅ |
| iOS background remote-notification + usage string | ✅ |
| Full Firebase SDK wiring | ⏳ Owner: add google-services + uncomment packages (`docs/FCM_SETUP.md`) |

### M3.3 — App settings
| Item | Status |
|------|--------|
| Language AR/EN (persisted) | ✅ |
| Theme system/light/dark (persisted) | ✅ |
| Account → profile | ✅ |
| Privacy & security sheet | ✅ |
| Re-register device | ✅ |
| Logout | ✅ |
| Logout all devices (`SignOutScope.global`) | ✅ |

### M3.4 — Security
| Item | Status |
|------|--------|
| FlutterSecureStorage for FCM / last user | ✅ |
| Clear sensitive on logout | ✅ |
| Auth PKCE flow | ✅ |
| Android `allowBackup=false`, no cleartext | ✅ |
| JWT only via Dio interceptor (not logged) | ✅ |
| Anon key remains client-side (expected) | ⚠️ Rotate if ever leaked in public chat |

### M3.5 — Release preparation
| Item | Status |
|------|--------|
| App display name **Tiqnora AI** (Android + iOS) | ✅ |
| Package / applicationId | `com.tiqnora.tiqnora_mobile` |
| Version | `1.1.0+3` |
| Deep link scheme `tiqnora://app` | ✅ |
| Portrait preferred | ✅ |
| Release signing | ⏳ Owner: upload keystore + `signingConfigs.release` |
| Store listing assets | ⏳ Owner: icon 512, screenshots, description AR/EN |
| Custom launcher icon | ⏳ Replace default mipmap / AppIcon |

---

## Build status

- Source: `artifacts/tiqnora_mobile/`
- Package: `artifacts/tiqnora-mobile-m3.zip`
- Sandbox: no Flutter SDK for full APK/IPA compile
- Local:
```bash
cd mobile
flutter pub get
flutter run
flutter build appbundle --release
flutter build ipa --release
```

## Store readiness

| Track | Ready? | Blockers |
|-------|--------|----------|
| Internal testing (Android) | Nearly | Keystore + optional FCM config |
| TestFlight | Nearly | Apple certs + bundle id |
| Production store | No | Screenshots, privacy policy, FCM, signing |

## Next phase recommendations
1. Firebase files + uncomment FCM packages
2. Android keystore + Play internal track
3. iOS certificates + TestFlight
4. Admin customers list
5. Supabase Realtime notifications
6. Live payments (web)

## Verdict
**M3 production-readiness layer complete** for UX, settings, security, and push foundation.  
Full FCM delivery and store submission remain owner infrastructure steps.
