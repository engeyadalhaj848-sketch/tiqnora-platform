import 'package:equatable/equatable.dart';

enum UserRole { customer, admin, superAdmin, unknown }

UserRole roleFromString(String? value) {
  switch ((value ?? '').toLowerCase()) {
    case 'admin':
      return UserRole.admin;
    case 'super_admin':
    case 'superadmin':
      return UserRole.superAdmin;
    case 'customer':
    case 'user':
    case 'member':
      return UserRole.customer;
    default:
      return UserRole.unknown;
  }
}

class UserProfile extends Equatable {
  const UserProfile({
    required this.id,
    required this.email,
    this.fullName,
    this.role = UserRole.customer,
    this.defaultOrganizationId,
    this.avatarUrl,
  });

  final String id;
  final String email;
  final String? fullName;
  final UserRole role;
  final String? defaultOrganizationId;
  final String? avatarUrl;

  bool get isAdmin => role == UserRole.admin || role == UserRole.superAdmin;

  factory UserProfile.fromMap(Map<String, dynamic> map) {
    return UserProfile(
      id: map['id'] as String,
      email: (map['email'] as String?) ?? '',
      fullName: map['full_name'] as String? ?? map['name'] as String?,
      role: roleFromString(map['role'] as String?),
      defaultOrganizationId: map['default_organization_id'] as String?,
      avatarUrl: map['avatar_url'] as String?,
    );
  }

  @override
  List<Object?> get props => [id, email, fullName, role, defaultOrganizationId];
}
