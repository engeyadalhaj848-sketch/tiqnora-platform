import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/presentation/auth_provider.dart';

class CustomerDashboardScreen extends ConsumerWidget {
  const CustomerDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(currentProfileProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('لوحة العميل'),
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
                leading: const CircleAvatar(child: Icon(Icons.person)),
                title: Text(profile?.fullName ?? 'عميل Tiqnora'),
                subtitle: Text(profile?.email ?? ''),
              ),
            ),
            const SizedBox(height: 16),
            Text('الخدمات', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            _tile(context, Icons.smart_toy_outlined, 'محادثة الذكاء الاصطناعي', '/ai-chat'),
            _tile(context, Icons.assignment_outlined, 'طلب خدمة', '/services'),
            _tile(context, Icons.subscriptions_outlined, 'الاشتراك', '/subscriptions'),
            _tile(context, Icons.notifications_outlined, 'الإشعارات', '/notifications'),
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
