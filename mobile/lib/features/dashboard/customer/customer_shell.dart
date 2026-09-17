import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'customer_dashboard_screen.dart';
import '../../ai_chat/presentation/ai_chat_screen.dart';
import '../../services/presentation/services_screen.dart';
import '../../subscriptions/presentation/subscription_screen.dart';
import '../../profile/presentation/profile_screen.dart';
import '../../home/home_providers.dart';
import '../../device/device_registration.dart';

class CustomerShell extends ConsumerStatefulWidget {
  const CustomerShell({super.key, this.initialIndex = 0});

  final int initialIndex;

  @override
  ConsumerState<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends ConsumerState<CustomerShell> {
  late int _index;
  bool _deviceRegistered = false;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_deviceRegistered) {
        _deviceRegistered = true;
        ensureDeviceRegistered(ref);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final notifCount = ref.watch(notificationsCountProvider).valueOrNull ?? 0;

    final pages = [
      const CustomerDashboardScreen(),
      const AiChatScreen(),
      const ServicesScreen(),
      const SubscriptionScreen(),
      const ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'الرئيسية',
          ),
          const NavigationDestination(
            icon: Icon(Icons.smart_toy_outlined),
            selectedIcon: Icon(Icons.smart_toy),
            label: 'AI',
          ),
          const NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'خدمات',
          ),
          const NavigationDestination(
            icon: Icon(Icons.card_membership_outlined),
            selectedIcon: Icon(Icons.card_membership),
            label: 'اشتراك',
          ),
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
