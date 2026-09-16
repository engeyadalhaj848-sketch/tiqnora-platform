import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'customer_dashboard_screen.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../../core/widgets/placeholder_screen.dart';
import '../../home/home_providers.dart';

class CustomerShell extends ConsumerStatefulWidget {
  const CustomerShell({super.key, this.initialIndex = 0});

  final int initialIndex;

  @override
  ConsumerState<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends ConsumerState<CustomerShell> {
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
  }

  @override
  Widget build(BuildContext context) {
    final notifCount = ref.watch(notificationsCountProvider).valueOrNull ?? 0;

    final pages = [
      const CustomerDashboardScreen(),
      const PlaceholderScreen(title: 'محادثة الذكاء الاصطناعي', subtitle: 'M2'),
      const PlaceholderScreen(title: 'الخدمات', subtitle: 'M2'),
      const PlaceholderScreen(title: 'الاشتراك', subtitle: 'M2'),
      const PlaceholderScreen(title: 'الملف الشخصي', subtitle: 'M2'),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'الرئيسية'),
          const NavigationDestination(icon: Icon(Icons.smart_toy_outlined), selectedIcon: Icon(Icons.smart_toy), label: 'AI'),
          const NavigationDestination(icon: Icon(Icons.assignment_outlined), selectedIcon: Icon(Icons.assignment), label: 'خدمات'),
          const NavigationDestination(icon: Icon(Icons.card_membership_outlined), selectedIcon: Icon(Icons.card_membership), label: 'اشتراك'),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: notifCount > 0,
              label: Text('$notifCount'),
              child: const Icon(Icons.person_outline),
            ),
            selectedIcon: const Icon(Icons.person),
            label: 'حسابي',
          ),
        ],
      ),
    );
  }
}
