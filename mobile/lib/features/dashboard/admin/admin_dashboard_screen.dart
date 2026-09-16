import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../home/home_providers.dart';
import '../../../core/theme/app_colors.dart';

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(currentProfileProvider);
    final statsAsync = ref.watch(adminStatsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('لوحة الإدارة'),
        actions: [
          IconButton(
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
          ref.invalidate(adminStatsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            profileAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => Text('$e'),
              data: (p) => Card(
                child: ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: AppColors.accent,
                    child: Icon(Icons.admin_panel_settings, color: Colors.white),
                  ),
                  title: Text(p?.fullName ?? 'مسؤول Tiqnora', style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${p?.email ?? ''} • ${p?.role.name}'),
                ),
              ),
            ),
            const SizedBox(height: 12),
            statsAsync.when(
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
              error: (e, _) => Text('$e'),
              data: (s) => GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.35,
                children: [
                  _metric(context, 'العملاء', '${s.customers}', Icons.people_outline, AppColors.primary),
                  _metric(context, 'الطلبات', '${s.requests}', Icons.assignment_outlined, AppColors.warning),
                  _metric(context, 'تنبيهات', '${s.unreadNotifications}', Icons.notifications_active_outlined, AppColors.error),
                  _metric(context, 'استدعاءات AI', '${s.aiCalls}', Icons.auto_awesome, AppColors.accent),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text('إدارة سريعة', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            _action(context, Icons.people_outline, 'متابعة العملاء', '/admin/customers'),
            _action(context, Icons.assignment_outlined, 'طلبات الخدمات', '/admin/requests'),
            _action(context, Icons.analytics_outlined, 'استخدام الذكاء الاصطناعي', '/admin/ai-usage'),
            _action(context, Icons.notifications_outlined, 'التنبيهات', '/notifications'),
          ],
        ),
      ),
    );
  }

  Widget _metric(BuildContext context, String title, String value, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color),
            const SizedBox(height: 8),
            Text(title, style: Theme.of(context).textTheme.bodySmall),
            Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
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
