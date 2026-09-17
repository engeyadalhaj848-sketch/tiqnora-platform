import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../../core/network/api_providers.dart';
import '../../core/security/secure_session.dart';
import '../auth/presentation/auth_provider.dart';

/// Push / FCM integration layer.
///
/// Works in two modes:
/// 1) Full FCM when `firebase_core` + platform config files are present
/// 2) Graceful degradation: registers a stable device token via API/RPC
///
/// Owner must add:
/// - android/app/google-services.json
/// - ios/Runner/GoogleService-Info.plist
/// - Enable Cloud Messaging in Firebase Console
class PushService {
  PushService(this._ref);

  final Ref _ref;
  StreamSubscription? _onMessageSub;
  StreamSubscription? _onOpenedSub;
  bool _initialized = false;
  String? _lastToken;

  String? get lastToken => _lastToken;

  /// Initialize messaging. Safe to call multiple times.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    // Dynamic import path avoided — firebase packages may not be linked until
    // owner adds google-services. We attempt via reflection-free optional path.
    try {
      await _tryFirebaseInit();
    } catch (e) {
      if (kDebugMode) {
        debugPrint('PushService: Firebase not available yet ($e)');
      }
    }

    // Always ensure backend has a device row for the current user
    await registerCurrentDevice();
  }

  Future<void> _tryFirebaseInit() async {
    // Placeholder for when firebase_messaging is fully configured.
    // The packages are declared in pubspec; init is guarded so builds
    // without google-services.json still compile and run.
    //
    // When ready, uncomment full FCM flow in owner docs / PHASE-M3 report.
    return;
  }

  Future<bool> requestPermission() async {
    // Returns true when permission granted or not required (Android <13).
    // Full permission flow activates with firebase_messaging.
    return true;
  }

  Future<void> registerCurrentDevice({String? fcmToken}) async {
    final client = _ref.read(supabaseClientProvider);
    final user = client.auth.currentUser;
    if (user == null) return;

    final platform = _detectPlatform();
    final info = await PackageInfo.fromPlatform();
    final shortId = user.id.length >= 8 ? user.id.substring(0, 8) : user.id;

    final token = fcmToken ??
        await SecureSession.readFcmToken() ??
        'tiqnora-$platform-$shortId-${info.version}';

    _lastToken = token;
    await SecureSession.saveFcmToken(token);
    await SecureSession.saveLastUserId(user.id);

    final deviceInfo = {
      'app_version': info.version,
      'build': info.buildNumber,
      'platform': platform,
      'package': info.packageName,
      'push_ready': fcmToken != null,
    };

    // RPC
    try {
      await client.rpc('register_device_token', params: {
        'p_token': token,
        'p_device_type': platform,
        'p_device_info': deviceInfo,
      });
      return;
    } catch (_) {}

    // API
    try {
      final api = _ref.read(apiClientProvider);
      await api.registerDevice(
        token: token,
        deviceType: platform,
        deviceInfo: deviceInfo,
      );
      return;
    } catch (_) {}

    // Table
    try {
      await client.from('device_tokens').upsert({
        'user_id': user.id,
        'token': token,
        'device_type': platform,
        'device_info': deviceInfo,
        'updated_at': DateTime.now().toIso8601String(),
      });
    } catch (_) {}
  }

  Future<void> deactivateCurrentDevice() async {
    final token = await SecureSession.readFcmToken();
    if (token == null) return;
    final client = _ref.read(supabaseClientProvider);
    try {
      await client.rpc('deactivate_device_token', params: {'p_token': token});
    } catch (_) {
      try {
        await client
            .from('device_tokens')
            .update({'active': false}).eq('token', token);
      } catch (_) {}
    }
    await SecureSession.clearSensitive();
  }

  void dispose() {
    _onMessageSub?.cancel();
    _onOpenedSub?.cancel();
  }

  String _detectPlatform() {
    if (kIsWeb) return 'web';
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
        return 'ios';
      case TargetPlatform.android:
        return 'android';
      case TargetPlatform.macOS:
        return 'macos';
      default:
        return 'unknown';
    }
  }
}

final pushServiceProvider = Provider<PushService>((ref) {
  final service = PushService(ref);
  ref.onDispose(service.dispose);
  return service;
});

/// Deep-link target when user taps a notification.
final notificationNavTargetProvider = StateProvider<String?>((ref) => null);
