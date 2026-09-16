import 'package:supabase_flutter/supabase_flutter.dart';
import '../domain/user_profile.dart';

class AuthRepository {
  AuthRepository(this._client);

  final SupabaseClient _client;

  Session? get currentSession => _client.auth.currentSession;
  User? get currentUser => _client.auth.currentUser;
  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;

  Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) {
    return _client.auth.signInWithPassword(email: email, password: password);
  }

  Future<AuthResponse> signUp({
    required String email,
    required String password,
    String? fullName,
  }) {
    return _client.auth.signUp(
      email: email,
      password: password,
      data: {
        if (fullName != null && fullName.isNotEmpty) 'full_name': fullName,
      },
    );
  }

  Future<void> signOut() => _client.auth.signOut();

  Future<UserProfile?> fetchProfile() async {
    final user = currentUser;
    if (user == null) return null;

    final row = await _client
        .from('profiles')
        .select()
        .eq('id', user.id)
        .maybeSingle();

    if (row == null) {
      return UserProfile(
        id: user.id,
        email: user.email ?? '',
        fullName: user.userMetadata?['full_name'] as String?,
        role: UserRole.customer,
      );
    }

    final map = Map<String, dynamic>.from(row);
    map['email'] = map['email'] ?? user.email ?? '';
    return UserProfile.fromMap(map);
  }
}
