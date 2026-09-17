import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../../../core/settings/app_settings.dart';
import '../../../core/security/secure_session.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../push/push_service.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  String _version = '';

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((p) {
      if (mounted) setState(() => _version = '${p.version}+${p.buildNumber}');
    });
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(appSettingsProvider);
    final profile = ref.watch(currentProfileProvider).valueOrNull;
    final isAr = settings.localeCode == 'ar';

    return Scaffold(
      appBar: AppBar(
        title: Text(isAr ? 'الإعدادات' : 'Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          // Account
          _section(isAr ? 'الحساب' : 'Account'),
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.person_outline),
                  title: Text(profile?.fullName ?? (isAr ? 'المستخدم' : 'User')),
                  subtitle: Text(profile?.email ?? ''),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () => context.push('/profile'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.lock_outline),
                  title: Text(isAr ? 'الخصوصية والأمان' : 'Privacy & security'),
                  subtitle: Text(
                    isAr
                        ? 'الجلسات، تخزين آمن، تسجيل الخروج'
                        : 'Sessions, secure storage, sign out',
                  ),
                  onTap: () => _showPrivacy(context, isAr),
                ),
              ],
            ),
          ),

          // Appearance
          _section(isAr ? 'المظهر' : 'Appearance'),
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.language),
                  title: Text(isAr ? 'اللغة' : 'Language'),
                  subtitle: Text(isAr ? 'العربية / English' : 'Arabic / English'),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'ar', label: Text('العربية')),
                      ButtonSegment(value: 'en', label: Text('English')),
                    ],
                    selected: {settings.localeCode},
                    onSelectionChanged: (s) {
                      ref.read(appSettingsProvider.notifier).setLocale(s.first);
                    },
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.brightness_6_outlined),
                  title: Text(isAr ? 'السمة' : 'Theme'),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: SegmentedButton<ThemeMode>(
                    segments: [
                      ButtonSegment(
                        value: ThemeMode.system,
                        label: Text(isAr ? 'تلقائي' : 'System'),
                        icon: const Icon(Icons.phone_android, size: 16),
                      ),
                      ButtonSegment(
                        value: ThemeMode.light,
                        label: Text(isAr ? 'فاتح' : 'Light'),
                        icon: const Icon(Icons.light_mode, size: 16),
                      ),
                      ButtonSegment(
                        value: ThemeMode.dark,
                        label: Text(isAr ? 'داكن' : 'Dark'),
                        icon: const Icon(Icons.dark_mode, size: 16),
                      ),
                    ],
                    selected: {settings.themeMode},
                    onSelectionChanged: (s) {
                      ref
                          .read(appSettingsProvider.notifier)
                          .setThemeMode(s.first);
                    },
                  ),
                ),
              ],
            ),
          ),

          // Notifications
          _section(isAr ? 'الإشعارات' : 'Notifications'),
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.notifications_active_outlined),
                  title: Text(
                    isAr ? 'أذونات الإشعارات' : 'Notification permission',
                  ),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () async {
                    final ok =
                        await ref.read(pushServiceProvider).requestPermission();
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            ok
                                ? (isAr
                                    ? 'الأذونات جاهزة / مسجّلة'
                                    : 'Permissions ready')
                                : (isAr
                                    ? 'يجب تفعيل الإشعارات من إعدادات النظام'
                                    : 'Enable notifications in system settings'),
                          ),
                        ),
                      );
                    }
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.phonelink_setup),
                  title: Text(
                    isAr ? 'إعادة تسجيل الجهاز' : 'Re-register device',
                  ),
                  onTap: () async {
                    await ref.read(pushServiceProvider).registerCurrentDevice();
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            isAr
                                ? 'تم تسجيل الجهاز'
                                : 'Device registered',
                          ),
                        ),
                      );
                    }
                  },
                ),
              ],
            ),
          ),

          // About
          _section(isAr ? 'حول التطبيق' : 'About'),
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: ListTile(
              leading: const Icon(Icons.info_outline),
              title: const Text('Tiqnora AI'),
              subtitle: Text(
                isAr ? 'الإصدار $_version' : 'Version $_version',
              ),
            ),
          ),

          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton.icon(
              onPressed: () async {
                await ref.read(pushServiceProvider).deactivateCurrentDevice();
                await SecureSession.signOutLocal(
                  ref.read(supabaseClientProvider),
                );
                if (context.mounted) context.go('/login');
              },
              icon: const Icon(Icons.logout, color: AppColors.error),
              label: Text(
                isAr ? 'تسجيل الخروج' : 'Sign out',
                style: const TextStyle(color: AppColors.error),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppColors.error),
                minimumSize: const Size.fromHeight(48),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextButton(
              onPressed: () => _confirmLogoutAll(context, isAr),
              child: Text(
                isAr ? 'تسجيل الخروج من كل الأجهزة' : 'Sign out all devices',
                style: const TextStyle(color: AppColors.error),
              ),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _section(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 6),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
            ),
      ),
    );
  }

  void _showPrivacy(BuildContext context, bool isAr) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                isAr ? 'الخصوصية والأمان' : 'Privacy & security',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              Text(
                isAr
                    ? '• رموز الجلسة تُدار عبر Supabase Auth\n'
                        '• توكن الجهاز يُخزَّن في التخزين الآمن (Keychain / EncryptedSharedPreferences)\n'
                        '• لا تُطبع المفاتيح أو JWT في السجلات\n'
                        '• يمكن إنهاء كل الجلسات من «تسجيل الخروج من كل الأجهزة»'
                    : '• Session tokens managed by Supabase Auth\n'
                        '• Device token stored in secure storage (Keychain / EncryptedSharedPreferences)\n'
                        '• Keys and JWT are never logged\n'
                        '• Use “Sign out all devices” to end every session',
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _confirmLogoutAll(BuildContext context, bool isAr) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isAr ? 'تأكيد' : 'Confirm'),
        content: Text(
          isAr
              ? 'سيتم إنهاء الجلسة على جميع الأجهزة. هل تريد المتابعة؟'
              : 'This will end sessions on all devices. Continue?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(isAr ? 'إلغاء' : 'Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(isAr ? 'تأكيد' : 'Confirm'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await ref.read(pushServiceProvider).deactivateCurrentDevice();
    await SecureSession.signOutAllDevices(ref.read(supabaseClientProvider));
    if (context.mounted) context.go('/login');
  }
}
