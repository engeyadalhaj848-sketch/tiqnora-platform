import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../device/device_registration.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _nameController = TextEditingController();
  bool _editing = false;
  bool _saving = false;
  String _locale = 'ar';

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _saveName() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    setState(() => _saving = true);
    try {
      final client = ref.read(supabaseClientProvider);
      final user = client.auth.currentUser;
      if (user != null) {
        await client
            .from('profiles')
            .update({'full_name': name}).eq('id', user.id);
        ref.invalidate(currentProfileProvider);
        if (mounted) {
          setState(() => _editing = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('تم حفظ الاسم')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('فشل الحفظ: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(currentProfileProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('الملف الشخصي')),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (p) {
          if (!_editing && _nameController.text.isEmpty && p?.fullName != null) {
            _nameController.text = p!.fullName!;
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: Stack(
                  children: [
                    CircleAvatar(
                      radius: 48,
                      backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                      backgroundImage: p?.avatarUrl != null
                          ? NetworkImage(p!.avatarUrl!)
                          : null,
                      child: p?.avatarUrl == null
                          ? Text(
                              (p?.fullName?.isNotEmpty == true
                                      ? p!.fullName![0]
                                      : 'T')
                                  .toUpperCase(),
                              style: const TextStyle(
                                fontSize: 36,
                                fontWeight: FontWeight.bold,
                                color: AppColors.primary,
                              ),
                            )
                          : null,
                    ),
                    Positioned(
                      bottom: 0,
                      left: 0,
                      child: CircleAvatar(
                        radius: 16,
                        backgroundColor: AppColors.primary,
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          iconSize: 16,
                          color: Colors.white,
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'رفع الصورة الشخصية قادم في مرحلة لاحقة',
                                ),
                              ),
                            );
                          },
                          icon: const Icon(Icons.camera_alt),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Text(
                            'الاسم',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const Spacer(),
                          if (!_editing)
                            TextButton(
                              onPressed: () => setState(() => _editing = true),
                              child: const Text('تعديل'),
                            ),
                        ],
                      ),
                      if (_editing) ...[
                        TextField(
                          controller: _nameController,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            hintText: 'الاسم الكامل',
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            ElevatedButton(
                              onPressed: _saving ? null : _saveName,
                              child: _saving
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Text('حفظ'),
                            ),
                            const SizedBox(width: 8),
                            TextButton(
                              onPressed: () => setState(() => _editing = false),
                              child: const Text('إلغاء'),
                            ),
                          ],
                        ),
                      ] else
                        Text(p?.fullName ?? '—'),
                      const Divider(height: 28),
                      const Text(
                        'البريد الإلكتروني',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(p?.email ?? '—'),
                      const Divider(height: 28),
                      const Text(
                        'الدور',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(_roleAr(p?.role.name)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.language),
                  title: const Text('اللغة'),
                  subtitle: Text(_locale == 'ar' ? 'العربية' : 'English'),
                  trailing: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'ar', label: Text('عربي')),
                      ButtonSegment(value: 'en', label: Text('EN')),
                    ],
                    selected: {_locale},
                    onSelectionChanged: (s) {
                      setState(() => _locale = s.first);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            _locale == 'ar'
                                ? 'تم اختيار العربية (أعد تشغيل التطبيق لتطبيق كامل)'
                                : 'English selected (restart app for full effect)',
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.settings_outlined),
                  title: const Text('الإعدادات'),
                  subtitle: const Text('اللغة، السمة، الخصوصية'),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () => context.push('/settings'),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.phone_android),
                  title: const Text('تسجيل الجهاز'),
                  subtitle: const Text('للتجهيز لإشعارات الدفع'),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () async {
                    final ok = await registerDeviceToken(ref);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            ok
                                ? 'تم تسجيل الجهاز بنجاح'
                                : 'تعذر تسجيل الجهاز (سيتم عند تفعيل FCM)',
                          ),
                        ),
                      );
                    }
                  },
                ),
              ),
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: () async {
                  await ref.read(authRepositoryProvider).signOut();
                  if (context.mounted) context.go('/login');
                },
                icon: const Icon(Icons.logout, color: AppColors.error),
                label: const Text(
                  'تسجيل الخروج',
                  style: TextStyle(color: AppColors.error),
                ),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppColors.error),
                  minimumSize: const Size.fromHeight(48),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  String _roleAr(String? role) {
    switch (role) {
      case 'admin':
        return 'مسؤول';
      case 'superAdmin':
        return 'مسؤول أعلى';
      case 'customer':
        return 'عميل';
      default:
        return role ?? '—';
    }
  }
}
