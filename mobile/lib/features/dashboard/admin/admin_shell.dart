import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'admin_dashboard_screen.dart';
import '../../../core/widgets/placeholder_screen.dart';
import '../../home/home_providers.dart';

class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({super.key});

  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final stats = ref.watch(adminStatsProvider).valueOrNull;

    final pages = [
      const AdminDashboardScreen(),
      const PlaceholderScreen(title: 'العملاء', subtitle: 'M2'),
      const PlaceholderScreen(title: 'الطلبات', subtitle: 'M2'),
      const PlaceholderScreen(title: 'استخدام AI', subtitle: 'M2'),
      const PlaceholderScreen(title: 'الإعدادات', subtitle: 'M2'),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'لوحة'),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: (stats?.customers ?? 0) > 0,
              label: Text('${stats?.customers ?? 0}'),
              child: const Icon(Icons.people_outline),
            ),
            selectedIcon: const Icon(Icons.people),
            label: 'عملاء',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: (stats?.requests ?? 0) > 0,
              label: Text('${stats?.requests ?? 0}'),
              child: const Icon(Icons.assignment_outlined),
            ),
            selectedIcon: const Icon(Icons.assignment),
            label: 'طلبات',
          ),
          const NavigationDestination(icon: Icon(Icons.analytics_outlined), selectedIcon: Icon(Icons.analytics), label: 'AI'),
          const NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'إعدادات'),
        ],
      ),
    );
  }
}
