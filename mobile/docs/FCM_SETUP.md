# Tiqnora AI — FCM Setup (Owner)

## 1. Firebase Console
1. Create project (or use existing) for Tiqnora
2. Add Android app: `com.tiqnora.tiqnora_mobile`
3. Add iOS app: match Xcode bundle id
4. Download:
   - `google-services.json` → `android/app/google-services.json`
   - `GoogleService-Info.plist` → `ios/Runner/GoogleService-Info.plist`

## 2. pubspec.yaml
Uncomment:
```yaml
firebase_core: ^3.12.1
firebase_messaging: ^15.2.4
flutter_local_notifications: ^18.0.1
```

## 3. Android Gradle
In `android/settings.gradle.kts` plugins block add:
```
id("com.google.gms.google-services") version "4.4.2" apply false
```
In `android/app/build.gradle.kts`:
```
id("com.google.gms.google-services")
```

## 4. Wire PushService
Implement `_tryFirebaseInit()` in `lib/features/push/push_service.dart`:
- `Firebase.initializeApp()`
- `FirebaseMessaging.instance.requestPermission()`
- `getToken()` → `registerCurrentDevice(fcmToken: token)`
- `onMessage` / `onMessageOpenedApp` → set `notificationNavTargetProvider`

## 5. Backend
Ensure migration 017 applied (`device_tokens`, `register_device_token`).
Delivery worker reads `notifications` where `metadata.push = true` and sends via FCM HTTP v1.

## 6. Test
Physical device required. Verify row in `device_tokens`.
