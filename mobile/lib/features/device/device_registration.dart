import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../../core/network/api_providers.dart';
import '../auth/presentation/auth_provider.dart';

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

/// Registers a placeholder / real device token after login.
/// Until FCM is wired, uses a stable local pseudo-token so the backend path is exercised.
Future<bool> registerDeviceToken(WidgetRef ref) async {
  final client = ref.read(supabaseClientProvider);
  final user = client.auth.currentUser;
  if (user == null) return false;

  try {
    final info = await PackageInfo.fromPlatform();
    final platform = _detectPlatform();

    // Placeholder token until firebase_messaging is added
    final shortId =
        user.id.length >= 8 ? user.id.substring(0, 8) : user.id;
    final token = 'tiqnora-$platform-$shortId-${info.version}';

    final deviceInfo = {
      'app_version': info.version,
      'build': info.buildNumber,
      'platform': platform,
      'package': info.packageName,
    };

    // Prefer RPC if available
    try {
      await client.rpc('register_device_token', params: {
        'p_token': token,
        'p_device_type': platform,
        'p_device_info': deviceInfo,
      });
      return true;
    } catch (_) {}

    // API fallback
    try {
      final api = ref.read(apiClientProvider);
      await api.registerDevice(
        token: token,
        deviceType: platform,
        deviceInfo: deviceInfo,
      );
      return true;
    } catch (_) {}

    // Direct table write as last resort
    try {
      await client.from('device_tokens').upsert({
        'user_id': user.id,
        'token': token,
        'device_type': platform,
        'device_info': deviceInfo,
        'updated_at': DateTime.now().toIso8601String(),
      });
      return true;
    } catch (_) {}

    return false;
  } catch (_) {
    return false;
  }
}

/// Call after successful login / on app resume when authenticated.
Future<void> ensureDeviceRegistered(WidgetRef ref) async {
  await registerDeviceToken(ref);
}
