import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/app_colors.dart';
import '../../services/domain/service_models.dart';
import '../../services/presentation/service_providers.dart';

class AdminRequestsScreen extends ConsumerWidget {
  const AdminRequestsScreen({super.key});

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
    final requestsAsync = ref.watch(allServiceRequestsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('طلبات الخدمات'),
        actions: [
          IconButton(
            onPressed: () => ref.invalidate(allServiceRequestsProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(allServiceRequestsProvider),
        child: requestsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('خطأ: $e'),
              ),
            ],
          ),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('لا توجد طلبات')),
                ],
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              itemBuilder: (context, i) {
                final r = list[i];
                return Card(
                  child: ListTile(
                    title: Text(
                      r.title ?? r.serviceType ?? 'طلب',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      r.description ?? '',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
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
                    onTap: () => _manage(context, ref, r),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _manage(BuildContext context, WidgetRef ref, ServiceRequest r) {
    final notesController = TextEditingController(text: r.notes ?? '');
    String selected = r.status.name == 'inProgress'
        ? 'in_progress'
        : r.status.name == 'unknown'
            ? 'pending'
            : r.status.name;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModal) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    r.title ?? 'إدارة الطلب',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  if (r.description != null) ...[
                    const SizedBox(height: 8),
                    Text(r.description!),
                  ],
                  if (r.createdAt != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      DateFormat('yyyy/MM/dd HH:mm').format(r.createdAt!),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  const SizedBox(height: 16),
                  Text(
                    'تحديث الحالة',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      ('pending', 'قيد الانتظار'),
                      ('in_progress', 'قيد التنفيذ'),
                      ('completed', 'مكتمل'),
                      ('cancelled', 'ملغي'),
                    ].map((pair) {
                      final val = pair.$1;
                      final label = pair.$2;
                      return ChoiceChip(
                        label: Text(label),
                        selected: selected == val,
                        onSelected: (_) => setModal(() => selected = val),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: notesController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'ملاحظات',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () async {
                      final ok = await ref
                          .read(updateRequestStatusProvider.notifier)
                          .update(
                            id: r.id,
                            status: selected,
                            notes: notesController.text.trim().isEmpty
                                ? null
                                : notesController.text.trim(),
                          );
                      if (ctx.mounted) {
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              ok ? 'تم التحديث' : 'فشل التحديث',
                            ),
                          ),
                        );
                      }
                    },
                    child: const Text('حفظ'),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
