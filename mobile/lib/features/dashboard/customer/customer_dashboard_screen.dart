import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../home/home_providers.dart';
import '../../../core/theme/app_colors.dart';

class CustomerDashboardScreen extends ConsumerWidget {
  const CustomerDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(currentProfileProvider);
    final subAsync = ref.watch(subscriptionSummaryProvider);
    final notifAsync = ref.watch(notificationsCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('الرئيسية'),
        actions: [
          IconButton(
            tooltip: 'إشعارات',
            onPressed: () => context.push('/notifications'),
            icon: Badge(
              isLabelVisible: (notifAsync.valueOrNull ?? 0) > 0,
              label: Text('${notifAsync.valueOrNull ?? 0}'),
              child: const Icon(Icons.notifications_outlined),
            ),
          ),
          IconButton(
            tooltip: 'خروج',
            onPressed: () async {
              await ref.read(authRepositoryProvider).signOut();
              if (context.mounted) context.go('/login');
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(currentProfileProvider);
          ref.invalidate(subscriptionSummaryProvider);
          ref.invalidate(notificationsCountProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            profileAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('$e'),
              data: (p) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                        child: Text(
                          (p?.fullName?.isNotEmpty == true ? p!.fullName![0] : 'T').toUpperCase(),
                          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.primary),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'مرحباً، ${p?.fullName ?? 'عميل Tiqnora'}',
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            Text(p?.email ?? '', style: Theme.of(context).textTheme.bodyMedium),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            subAsync.when(
              loading: () => const Card(child: ListTile(title: Text('جاري تحميل الخطة...'))),
              error: (_, __) => const Card(child: ListTile(title: Text('الخطة: مجاني'))),
              data: (s) => Row(
                children: [
                  Expanded(
                    child: _statCard(context, 'الخطة الحالية', s.planLabel, Icons.card_membership, AppColors.primary),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _statCard(context, 'استخدام AI', s.usageLabel, Icons.auto_awesome, AppColors.accent),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text('إجراءات سريعة', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            _action(context, Icons.smart_toy_outlined, 'محادثة مع الذكاء الاصطناعي', '/ai-chat'),
            _action(context, Icons.assignment_outlined, 'طلب خدمة', '/services'),
            _action(context, Icons.subscriptions_outlined, 'اشتراكي', '/subscriptions'),
            _action(context, Icons.notifications_outlined, 'الإشعارات', '/notifications'),
            _action(context, Icons.person_outline, 'الملف الشخصي', '/profile'),
          ],
        ),
      ),
    );
  }

  Widget _statCard(BuildContext context, String title, String value, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color),
            const SizedBox(height: 8),
            Text(title, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 4),
            Text(value, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }

  Widget _action(BuildContext context, IconData icon, String title, String route) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: AppColors.primary),
        title: Text(title),
        trailing: const Icon(Icons.chevron_left),
        onTap: () => context.push(route),
      ),
    );
  }
}
