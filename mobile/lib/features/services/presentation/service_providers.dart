import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/network/api_providers.dart';
import '../../auth/presentation/auth_provider.dart';
import '../domain/service_models.dart';

final myServiceRequestsProvider =
    FutureProvider<List<ServiceRequest>>((ref) async {
  final client = ref.watch(supabaseClientProvider);
  final user = client.auth.currentUser;
  if (user == null) return [];

  // Prefer direct Supabase table
  try {
    final rows = await client
        .from('service_requests')
        .select()
        .eq('user_id', user.id)
        .order('created_at', ascending: false);
    if (rows is List && rows.isNotEmpty) {
      return rows
          .map((e) =>
              ServiceRequest.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
    }
  } catch (_) {
    try {
      final rows = await client
          .from('service_requests')
          .select()
          .eq('customer_id', user.id)
          .order('created_at', ascending: false);
      if (rows is List) {
        return rows
            .map((e) =>
                ServiceRequest.fromMap(Map<String, dynamic>.from(e as Map)))
            .toList();
      }
    } catch (_) {}
  }

  // API fallback
  try {
    final api = ref.read(serviceRequestsApiProvider);
    final items = await api.listMine();
    return items
        .map((e) => ServiceRequest.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList();
  } catch (_) {}

  return [];
});

final allServiceRequestsProvider =
    FutureProvider<List<ServiceRequest>>((ref) async {
  final client = ref.watch(supabaseClientProvider);
  try {
    final rows = await client
        .from('service_requests')
        .select()
        .order('created_at', ascending: false)
        .limit(100);
    if (rows is List) {
      return rows
          .map((e) =>
              ServiceRequest.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
    }
  } catch (_) {}
  return [];
});

class CreateServiceRequestNotifier extends StateNotifier<AsyncValue<void>> {
  CreateServiceRequestNotifier(this._ref) : super(const AsyncData(null));

  final Ref _ref;

  Future<bool> submit({
    required String serviceType,
    required String description,
    String? title,
  }) async {
    state = const AsyncLoading();
    final client = _ref.read(supabaseClientProvider);
    final user = client.auth.currentUser;
    if (user == null) {
      state = AsyncError('يجب تسجيل الدخول', StackTrace.current);
      return false;
    }

    try {
      await client.from('service_requests').insert({
        'user_id': user.id,
        'service_type': serviceType,
        'title': title ?? serviceType,
        'description': description,
        'status': 'pending',
      });
      _ref.invalidate(myServiceRequestsProvider);
      _ref.invalidate(allServiceRequestsProvider);
      state = const AsyncData(null);
      return true;
    } catch (_) {
      // Try API
      try {
        final api = _ref.read(serviceRequestsApiProvider);
        final res = await api.create(
          serviceType: serviceType,
          description: description,
          title: title,
        );
        if (res != null) {
          _ref.invalidate(myServiceRequestsProvider);
          state = const AsyncData(null);
          return true;
        }
      } catch (e) {
        state = AsyncError(e, StackTrace.current);
        return false;
      }
      state = AsyncError('تعذر إرسال الطلب', StackTrace.current);
      return false;
    }
  }
}

final createServiceRequestProvider =
    StateNotifierProvider<CreateServiceRequestNotifier, AsyncValue<void>>(
        (ref) {
  return CreateServiceRequestNotifier(ref);
});

class UpdateRequestStatusNotifier extends StateNotifier<AsyncValue<void>> {
  UpdateRequestStatusNotifier(this._ref) : super(const AsyncData(null));

  final Ref _ref;

  Future<bool> update({
    required String id,
    required String status,
    String? notes,
  }) async {
    state = const AsyncLoading();
    final client = _ref.read(supabaseClientProvider);
    try {
      final payload = <String, dynamic>{
        'status': status,
        'updated_at': DateTime.now().toIso8601String(),
      };
      if (notes != null) payload['notes'] = notes;
      await client.from('service_requests').update(payload).eq('id', id);
      _ref.invalidate(allServiceRequestsProvider);
      _ref.invalidate(myServiceRequestsProvider);
      state = const AsyncData(null);
      return true;
    } catch (e) {
      state = AsyncError(e, StackTrace.current);
      return false;
    }
  }
}

final updateRequestStatusProvider =
    StateNotifierProvider<UpdateRequestStatusNotifier, AsyncValue<void>>((ref) {
  return UpdateRequestStatusNotifier(ref);
});
