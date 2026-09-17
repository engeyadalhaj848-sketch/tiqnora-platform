import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../push/push_service.dart';

/// Registers device after login. Delegates to PushService (M3).
Future<bool> registerDeviceToken(WidgetRef ref) async {
  try {
    await ref.read(pushServiceProvider).initialize();
    await ref.read(pushServiceProvider).registerCurrentDevice();
    return true;
  } catch (_) {
    return false;
  }
}

Future<void> ensureDeviceRegistered(WidgetRef ref) async {
  await registerDeviceToken(ref);
}
