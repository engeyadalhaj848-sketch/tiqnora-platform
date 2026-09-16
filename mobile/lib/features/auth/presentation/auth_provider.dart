import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../data/auth_repository.dart';
import '../domain/user_profile.dart';

final supabaseClientProvider = Provider<SupabaseClient>((ref) {
  return Supabase.instance.client;
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.watch(supabaseClientProvider));
});

final authStateProvider = StreamProvider<AuthState>((ref) {
  return ref.watch(authRepositoryProvider).authStateChanges;
});

final currentProfileProvider = FutureProvider<UserProfile?>((ref) async {
  final auth = ref.watch(authStateProvider);
  final session = auth.asData?.value.session;
  if (session == null) return null;
  return ref.read(authRepositoryProvider).fetchProfile();
});
