import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../auth/presentation/auth_provider.dart';

class SubscriptionSummary {
  const SubscriptionSummary({
    this.planName,
    this.status,
    this.aiUsed,
    this.aiLimit,
  });

  final String? planName;
  final String? status;
  final int? aiUsed;
  final int? aiLimit;

  String get planLabel => planName ?? 'بدون خطة';
  String get usageLabel {
    if (aiUsed == null && aiLimit == null) return '—';
    return '${aiUsed ?? 0} / ${aiLimit ?? '∞'}';
  }
}

class AdminStats {
  const AdminStats({
    this.customers = 0,
    this.requests = 0,
    this.unreadNotifications = 0,
    this.aiCalls = 0,
  });

  final int customers;
  final int requests;
  final int unreadNotifications;
  final int aiCalls;
}

final subscriptionSummaryProvider = FutureProvider<SubscriptionSummary>((ref) async {
  final client = ref.watch(supabaseClientProvider);
  final user = client.auth.currentUser;
  if (user == null) return const SubscriptionSummary();

  // Try common shapes used in Tiqnora SaaS
  try {
    final profile = await client.from('profiles').select('default_organization_id').eq('id', user.id).maybeSingle();
    final orgId = profile?['default_organization_id'] as String?;
    if (orgId == null) return const SubscriptionSummary(planName: 'مجاني');

    final sub = await client
        .from('subscriptions')
        .select('status, plan_id, plans(name_ar, name, ai_monthly_limit)')
        .eq('organization_id', orgId)
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle();

    if (sub == null) return const SubscriptionSummary(planName: 'مجاني', status: 'none');

    final plans = sub['plans'];
    String? planName;
    int? limit;
    if (plans is Map) {
      planName = (plans['name_ar'] ?? plans['name']) as String?;
      limit = plans['ai_monthly_limit'] as int?;
    }

    int? used;
    try {
      final usage = await client
          .from('ai_usage')
          .select('tokens_used')
          .eq('organization_id', orgId)
          .limit(50);
      if (usage is List) {
        used = usage.fold<int>(0, (a, e) => a + ((e['tokens_used'] as num?)?.toInt() ?? 0));
      }
    } catch (_) {}

    return SubscriptionSummary(
      planName: planName ?? 'خطة',
      status: sub['status'] as String?,
      aiUsed: used,
      aiLimit: limit,
    );
  } catch (_) {
    return const SubscriptionSummary(planName: 'مجاني');
  }
});

final notificationsCountProvider = FutureProvider<int>((ref) async {
  final client = ref.watch(supabaseClientProvider);
  final user = client.auth.currentUser;
  if (user == null) return 0;
  try {
    final rows = await client
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .filter('read_at', 'is', null);
    if (rows is List) return rows.length;
  } catch (_) {}
  return 0;
});

final adminStatsProvider = FutureProvider<AdminStats>((ref) async {
  final client = ref.watch(supabaseClientProvider);
  int customers = 0, requests = 0, unread = 0, ai = 0;
  try {
    final c = await client.from('profiles').select('id').eq('role', 'customer');
    if (c is List) customers = c.length;
  } catch (_) {}
  try {
    final r = await client.from('service_requests').select('id');
    if (r is List) requests = r.length;
  } catch (_) {
    try {
      final r2 = await client.from('requests').select('id');
      if (r2 is List) requests = r2.length;
    } catch (_) {}
  }
  try {
    final n = await client.from('notifications').select('id').eq('audience', 'admin').filter('read_at', 'is', null);
    if (n is List) unread = n.length;
  } catch (_) {}
  try {
    final u = await client.from('ai_usage').select('id').limit(500);
    if (u is List) ai = u.length;
  } catch (_) {}
  return AdminStats(customers: customers, requests: requests, unreadNotifications: unread, aiCalls: ai);
});
