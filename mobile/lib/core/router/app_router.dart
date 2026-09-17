import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/auth_provider.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/dashboard/admin/admin_shell.dart';
import '../../features/dashboard/customer/customer_shell.dart';
import '../../features/ai_chat/presentation/ai_chat_screen.dart';
import '../../features/services/presentation/services_screen.dart';
import '../../features/subscriptions/presentation/subscription_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/admin/presentation/admin_requests_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../widgets/placeholder_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/splash',
    refreshListenable: _AuthRefresh(ref),
    redirect: (context, state) {
      final loc = state.matchedLocation;
      final public = loc == '/splash' ||
          loc == '/login' ||
          loc == '/register' ||
          loc == '/forgot-password';

      final session = authState.asData?.value.session;
      final isLoggedIn = session != null;

      if (loc == '/splash') return null;
      if (!isLoggedIn && !public) return '/login';
      if (isLoggedIn &&
          (loc == '/login' ||
              loc == '/register' ||
              loc == '/forgot-password')) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(
        path: '/forgot-password',
        builder: (_, __) => const ForgotPasswordScreen(),
      ),
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
                error: (e, _) => Scaffold(
                  body: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('تعذر تحميل الملف: $e'),
                          const SizedBox(height: 12),
                          ElevatedButton(
                            onPressed: () =>
                                ref.invalidate(currentProfileProvider),
                            child: const Text('إعادة المحاولة'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                data: (profile) {
                  if (profile?.isAdmin == true) {
                    return const AdminShell();
                  }
                  return const CustomerShell();
                },
              );
            },
          );
        },
      ),
      GoRoute(path: '/ai-chat', builder: (_, __) => const AiChatScreen()),
      GoRoute(path: '/services', builder: (_, __) => const ServicesScreen()),
      GoRoute(
        path: '/subscriptions',
        builder: (_, __) => const SubscriptionScreen(),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, __) => const NotificationsScreen(),
      ),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      GoRoute(
        path: '/admin/customers',
        builder: (_, __) => const PlaceholderScreen(
          title: 'متابعة العملاء',
          subtitle: 'قائمة العملاء التفصيلية — مرحلة لاحقة',
        ),
      ),
      GoRoute(
        path: '/admin/requests',
        builder: (_, __) => const AdminRequestsScreen(),
      ),
      GoRoute(
        path: '/admin/ai-usage',
        builder: (_, __) => const PlaceholderScreen(
          title: 'استخدام الذكاء الاصطناعي',
          subtitle: 'إحصائيات مفصلة — مرحلة لاحقة',
        ),
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
