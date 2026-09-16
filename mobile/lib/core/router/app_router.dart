import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/auth_provider.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/dashboard/admin/admin_dashboard_screen.dart';
import '../../features/dashboard/customer/customer_dashboard_screen.dart';
import '../widgets/placeholder_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/login',
    refreshListenable: _AuthRefresh(ref),
    redirect: (context, state) {
      final loggingIn =
          state.matchedLocation == '/login' || state.matchedLocation == '/register';

      final session = authState.asData?.value.session;
      final isLoggedIn = session != null;

      if (!isLoggedIn && !loggingIn) return '/login';
      if (isLoggedIn && loggingIn) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(
        path: '/home',
        builder: (context, state) {
          return Consumer(
            builder: (context, ref, _) {
              final profileAsync = ref.watch(currentProfileProvider);
              return profileAsync.when(
                loading: () => const Scaffold(
                  body: Center(child: CircularProgressIndicator()),
                ),
                error: (e, _) => Scaffold(body: Center(child: Text('$e'))),
                data: (profile) {
                  if (profile?.isAdmin == true) {
                    return const AdminDashboardScreen();
                  }
                  return const CustomerDashboardScreen();
                },
              );
            },
          );
        },
      ),
      GoRoute(
        path: '/ai-chat',
        builder: (_, __) => const PlaceholderScreen(
          title: 'محادثة الذكاء الاصطناعي',
          subtitle: 'ربط AI Agents + Sales AI',
        ),
      ),
      GoRoute(
        path: '/services',
        builder: (_, __) => const PlaceholderScreen(title: 'طلب الخدمات'),
      ),
      GoRoute(
        path: '/subscriptions',
        builder: (_, __) => const PlaceholderScreen(title: 'الاشتراك والفواتير'),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, __) => const PlaceholderScreen(title: 'الإشعارات'),
      ),
      GoRoute(
        path: '/profile',
        builder: (_, __) => const PlaceholderScreen(title: 'الملف الشخصي'),
      ),
      GoRoute(
        path: '/admin/customers',
        builder: (_, __) => const PlaceholderScreen(title: 'متابعة العملاء'),
      ),
      GoRoute(
        path: '/admin/requests',
        builder: (_, __) => const PlaceholderScreen(title: 'الطلبات'),
      ),
      GoRoute(
        path: '/admin/ai-usage',
        builder: (_, __) => const PlaceholderScreen(title: 'استخدام الذكاء الاصطناعي'),
      ),
    ],
  );
});

class _AuthRefresh extends ChangeNotifier {
  _AuthRefresh(this.ref) {
    ref.listen(authStateProvider, (_, __) => notifyListeners());
  }
  final Ref ref;
}
