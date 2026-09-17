import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../home/home_providers.dart';

class SubscriptionDetail {
  const SubscriptionDetail({
    this.planName,
    this.status,
    this.aiLimit,
    this.aiUsed,
    this.renewalDate,
    this.features = const [],
    this.invoices = const [],
  });

  final String? planName;
  final String? status;
  final int? aiLimit;
  final int? aiUsed;
  final DateTime? renewalDate;
  final List<String> features;
  final List<Map<String, dynamic>> invoices;
}

final subscriptionDetailProvider =
    FutureProvider<SubscriptionDetail>((ref) async {
  final client = ref.watch(supabaseClientProvider);
  final user = client.auth.currentUser;
  if (user == null) return const SubscriptionDetail(planName: 'مجاني');

  try {
    final profile = await client
        .from('profiles')
        .select('default_organization_id')
        .eq('id', user.id)
        .maybeSingle();
    final orgId = profile?['default_organization_id'] as String?;
    if (orgId == null) {
      return const SubscriptionDetail(planName: 'مجاني', status: 'none');
    }

    final sub = await client
        .from('subscriptions')
        .select(
            'status, current_period_end, plan_id, plans(name_ar, name, ai_monthly_limit, features, features_ar)')
        .eq('organization_id', orgId)
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle();

    String? planName = 'مجاني';
    int? limit;
    List<String> features = [];
    DateTime? renewal;
    String? status = 'none';

    if (sub != null) {
      status = sub['status'] as String? ?? 'active';
      if (sub['current_period_end'] != null) {
        renewal = DateTime.tryParse(sub['current_period_end'].toString());
      }
      final plans = sub['plans'];
      if (plans is Map) {
        planName = (plans['name_ar'] ?? plans['name']) as String? ?? 'خطة';
        limit = plans['ai_monthly_limit'] as int?;
        final f = plans['features_ar'] ?? plans['features'];
        if (f is List) {
          features = f.map((e) => e.toString()).toList();
        } else if (f is String) {
          features = f.split(',').map((e) => e.trim()).toList();
        }
      }
    }

    int used = 0;
    try {
      final usage = await client
          .from('ai_usage')
          .select('tokens_used, calls')
          .eq('organization_id', orgId)
          .limit(100);
      if (usage is List) {
        used = usage.fold<int>(0, (a, e) {
          final m = e as Map;
          return a +
              ((m['calls'] as num?)?.toInt() ??
                  (m['tokens_used'] as num?)?.toInt() ??
                  1);
        });
      }
    } catch (_) {}

    List<Map<String, dynamic>> invoices = [];
    try {
      final inv = await client
          .from('billing_invoices')
          .select()
          .eq('organization_id', orgId)
          .order('created_at', ascending: false)
          .limit(20);
      if (inv is List) {
        invoices = inv.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
    } catch (_) {}

    return SubscriptionDetail(
      planName: planName,
      status: status,
      aiLimit: limit,
      aiUsed: used,
      renewalDate: renewal,
      features: features,
      invoices: invoices,
    );
  } catch (_) {
    return const SubscriptionDetail(planName: 'مجاني');
  }
});

class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(subscriptionDetailProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('اشتراكي'),
        actions: [
          IconButton(
            onPressed: () {
              ref.invalidate(subscriptionDetailProvider);
              ref.invalidate(subscriptionSummaryProvider);
            },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(subscriptionDetailProvider);
          ref.invalidate(subscriptionSummaryProvider);
        },
        child: detailAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('خطأ: $e'),
              ),
            ],
          ),
          data: (d) {
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              backgroundColor:
                                  AppColors.primary.withValues(alpha: 0.15),
                              child: const Icon(Icons.card_membership,
                                  color: AppColors.primary),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    d.planName ?? 'مجاني',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleLarge
                                        ?.copyWith(fontWeight: FontWeight.w800),
                                  ),
                                  Text(
                                    _statusAr(d.status),
                                    style: TextStyle(
                                      color: d.status == 'active'
                                          ? AppColors.success
                                          : AppColors.textSecondaryLight,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (d.renewalDate != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            'التجديد: ${DateFormat('yyyy/MM/dd').format(d.renewalDate!)}',
                          ),
                        ],
                        const SizedBox(height: 16),
                        Text(
                          'استخدام AI: ${d.aiUsed ?? 0}${d.aiLimit != null ? ' / ${d.aiLimit}' : ''}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        if (d.aiLimit != null && d.aiLimit! > 0) ...[
                          const SizedBox(height: 8),
                          LinearProgressIndicator(
                            value: ((d.aiUsed ?? 0) / d.aiLimit!)
                                .clamp(0.0, 1.0),
                            backgroundColor: Colors.grey.shade200,
                            color: AppColors.primary,
                            minHeight: 8,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                if (d.features.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(
                    'المميزات',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  ...d.features.map(
                    (f) => Card(
                      child: ListTile(
                        leading: const Icon(Icons.check_circle,
                            color: AppColors.success),
                        title: Text(f),
                        dense: true,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                Text(
                  'الفواتير',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                if (d.invoices.isEmpty)
                  const Card(
                    child: ListTile(
                      title: Text('لا توجد فواتير بعد'),
                      subtitle: Text('ستظهر هنا بعد تفعيل الدفع الحي'),
                    ),
                  )
                else
                  ...d.invoices.map((inv) {
                    final amount = inv['amount'] ?? inv['total'] ?? '—';
                    final status = inv['status'] ?? '—';
                    final date = inv['created_at'] != null
                        ? DateTime.tryParse(inv['created_at'].toString())
                        : null;
                    return Card(
                      child: ListTile(
                        leading: const Icon(Icons.receipt_long),
                        title: Text('$amount'),
                        subtitle: Text(
                          date != null
                              ? DateFormat('yyyy/MM/dd').format(date)
                              : status.toString(),
                        ),
                        trailing: Text(status.toString()),
                      ),
                    );
                  }),
                const SizedBox(height: 20),
                OutlinedButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'طلب الترقية: تواصل مع الدعم أو استخدم بوابة العملاء على الموقع',
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.upgrade),
                  label: const Text('طلب ترقية الخطة'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  String _statusAr(String? s) {
    switch ((s ?? '').toLowerCase()) {
      case 'active':
        return 'نشط';
      case 'canceled':
      case 'cancelled':
        return 'ملغي';
      case 'past_due':
        return 'متأخر';
      case 'trialing':
        return 'تجريبي';
      case 'none':
        return 'بدون اشتراك';
      default:
        return s ?? '—';
    }
  }
}
