import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/presentation/auth_provider.dart';

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(currentProfileProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('لوحة الإدارة'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authRepositoryProvider).signOut();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('خطأ: $e')),
        data: (profile) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Colors.indigo,
                  child: Icon(Icons.admin_panel_settings, color: Colors.white),
                ),
                title: Text(profile?.fullName ?? 'مسؤول Tiqnora'),
                subtitle: Text('${profile?.email ?? ''} • ${profile?.role.name}'),
              ),
            ),
            const SizedBox(height: 16),
            Text('الإدارة', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            _tile(context, Icons.people_outline, 'متابعة العملاء', '/admin/customers'),
            _tile(context, Icons.assignment_outlined, 'الطلبات', '/admin/requests'),
            _tile(context, Icons.analytics_outlined, 'استخدام الذكاء الاصطناعي', '/admin/ai-usage'),
            _tile(context, Icons.notifications_active_outlined, 'التنبيهات', '/notifications'),
            _tile(context, Icons.person_outline, 'الملف الشخصي', '/profile'),
          ],
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String title, String route) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        trailing: const Icon(Icons.chevron_left),
        onTap: () => context.push(route),
      ),
    );
  }
}
