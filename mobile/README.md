# Tiqnora AI — Mobile (Flutter)

تطبيق رسمي واحد يدعم **Customer** و **Admin / Super Admin** حسب `profile.role`.

## Stack
- Flutter 3.32+ / Dart 3.8+
- Riverpod
- Supabase Flutter SDK
- Dio
- go_router
- Secure Storage (جاهز للتوسعة)

## M0 (Foundation)
- هيكل مشروع احترافي
- Design System (Light/Dark + Cairo Arabic)
- Auth: Login / Register / Logout + session via Supabase
- Role routing → Customer Dashboard أو Admin Dashboard
- API layer stubs (AI Chat, Services, Subscriptions, Notifications)
- Mobile backend endpoints: `/api/mobile/app-version`, `/api/mobile/register-device`

## Run
```bash
flutter pub get
flutter run
```

## Supabase
Configured in `lib/core/config/app_config.dart`.

## Next (M1)
- AI Chat full UI
- Service requests
- Subscriptions & billing view
- Push notifications (FCM)
- Profile edit
