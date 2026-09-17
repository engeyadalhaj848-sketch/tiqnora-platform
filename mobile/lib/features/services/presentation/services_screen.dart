import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/app_colors.dart';
import '../domain/service_models.dart';
import 'service_providers.dart';
import 'create_request_screen.dart';

class ServicesScreen extends ConsumerWidget {
  const ServicesScreen({super.key});

  Color _statusColor(ServiceRequestStatus s) {
    switch (s) {
      case ServiceRequestStatus.pending:
        return AppColors.warning;
      case ServiceRequestStatus.inProgress:
        return AppColors.accent;
      case ServiceRequestStatus.completed:
        return AppColors.success;
      case ServiceRequestStatus.cancelled:
        return AppColors.error;
      case ServiceRequestStatus.unknown:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requestsAsync = ref.watch(myServiceRequestsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('طلباتي'),
        actions: [
          IconButton(
            tooltip: 'تحديث',
            onPressed: () => ref.invalidate(myServiceRequestsProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await Navigator.of(context).push<bool>(
            MaterialPageRoute(builder: (_) => const CreateRequestScreen()),
          );
          if (created == true) {
            ref.invalidate(myServiceRequestsProvider);
          }
        },
        icon: const Icon(Icons.add),
        label: const Text('طلب جديد'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myServiceRequestsProvider),
        child: requestsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('تعذر تحميل الطلبات: $e'),
              ),
            ],
          ),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 80),
                  Center(
                    child: Column(
                      children: [
                        Icon(Icons.assignment_outlined, size: 56),
                        SizedBox(height: 12),
                        Text('لا توجد طلبات بعد'),
                        SizedBox(height: 4),
                        Text('اضغط "طلب جديد" للبدء'),
                      ],
                    ),
                  ),
                ],
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
              itemCount: list.length,
              itemBuilder: (context, i) {
                final r = list[i];
                final dateStr = r.createdAt != null
                    ? DateFormat('yyyy/MM/dd HH:mm').format(r.createdAt!)
                    : '—';
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    title: Text(
                      r.title ?? r.serviceType ?? 'طلب خدمة',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (r.description != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            r.description!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                        const SizedBox(height: 6),
                        Text(dateStr, style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: _statusColor(r.status).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        statusLabelAr(r.status),
                        style: TextStyle(
                          color: _statusColor(r.status),
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    onTap: () => _showDetails(context, r),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _showDetails(BuildContext context, ServiceRequest r) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade400,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                r.title ?? r.serviceType ?? 'تفاصيل الطلب',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Chip(
                label: Text(statusLabelAr(r.status)),
                backgroundColor: _statusColor(r.status).withValues(alpha: 0.15),
                labelStyle: TextStyle(
                  color: _statusColor(r.status),
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (r.serviceType != null) ...[
                const SizedBox(height: 8),
                Text('النوع: ${r.serviceType}'),
              ],
              if (r.description != null) ...[
                const SizedBox(height: 12),
                Text(
                  'الوصف',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(r.description!),
              ],
              if (r.notes != null && r.notes!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  'ملاحظات الإدارة',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(r.notes!),
              ],
              if (r.createdAt != null) ...[
                const SizedBox(height: 12),
                Text(
                  'تاريخ الإنشاء: ${DateFormat('yyyy/MM/dd HH:mm').format(r.createdAt!)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
