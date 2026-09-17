import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Thin security helpers: never log tokens; clear on logout.
class SecureSession {
  SecureSession._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  static const _kLastUserId = 'tiqnora_last_user_id';
  static const _kFcmToken = 'tiqnora_fcm_token';

  static Future<void> saveLastUserId(String userId) async {
    await _storage.write(key: _kLastUserId, value: userId);
  }

  static Future<String?> readLastUserId() => _storage.read(key: _kLastUserId);

  static Future<void> saveFcmToken(String token) async {
    await _storage.write(key: _kFcmToken, value: token);
  }

  static Future<String?> readFcmToken() => _storage.read(key: _kFcmToken);

  static Future<void> clearSensitive() async {
    await _storage.delete(key: _kFcmToken);
    await _storage.delete(key: _kLastUserId);
  }

  /// Sign out local session + clear sensitive keys.
  static Future<void> signOutLocal(SupabaseClient client) async {
    try {
      await client.auth.signOut();
    } catch (_) {}
    await clearSensitive();
  }

  /// Best-effort: sign out of all sessions via Supabase (if supported by project).
  static Future<void> signOutAllDevices(SupabaseClient client) async {
    try {
      await client.auth.signOut(scope: SignOutScope.global);
    } catch (_) {
      await client.auth.signOut();
    }
    await clearSensitive();
  }
}
