import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'admin_dashboard_screen.dart';
import '../../admin/presentation/admin_requests_screen.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../settings/presentation/settings_screen.dart';
import '../../home/home_providers.dart';
import '../../device/device_registration.dart';
import '../../../core/widgets/placeholder_screen.dart';

class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({super.key});

  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  int _index = 0;
  bool _deviceRegistered = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_deviceRegistered) {
        _deviceRegistered = true;
        ensureDeviceRegistered(ref);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final stats = ref.watch(adminStatsProvider).valueOrNull;

    final pages = [
      const AdminDashboardScreen(),
      const PlaceholderScreen(
        title: 'العملاء',
        subtitle: 'قائمة العملاء — مرحلة لاحقة',
      ),
      const AdminRequestsScreen(),
      const NotificationsScreen(),
      const SettingsScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'لوحة',
          ),
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
          NavigationDestination(
            icon: Badge(
              isLabelVisible: (stats?.unreadNotifications ?? 0) > 0,
              label: Text('${stats?.unreadNotifications ?? 0}'),
              child: const Icon(Icons.notifications_outlined),
            ),
            selectedIcon: const Icon(Icons.notifications),
            label: 'تنبيهات',
          ),
          const NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'إعدادات',
          ),
        ],
      ),
    );
  }
}
