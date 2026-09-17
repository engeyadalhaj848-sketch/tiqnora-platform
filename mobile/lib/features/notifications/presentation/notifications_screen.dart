import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../home/home_providers.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    this.title,
    this.body,
    this.readAt,
    this.createdAt,
    this.type,
  });

  final String id;
  final String? title;
  final String? body;
  final DateTime? readAt;
  final DateTime? createdAt;
  final String? type;

  bool get isUnread => readAt == null;

  factory AppNotification.fromMap(Map<String, dynamic> map) {
    return AppNotification(
      id: (map['id'] ?? '').toString(),
      title: map['title'] as String? ?? map['subject'] as String?,
      body: map['body'] as String? ??
          map['message'] as String? ??
          map['content'] as String?,
      readAt: map['read_at'] != null
          ? DateTime.tryParse(map['read_at'].toString())
          : null,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString())
          : null,
      type: map['type'] as String?,
    );
  }
}

final notificationsListProvider =
    FutureProvider<List<AppNotification>>((ref) async {
  final client = ref.watch(supabaseClientProvider);
  final user = client.auth.currentUser;
  if (user == null) return [];

  try {
    final rows = await client
        .from('notifications')
        .select()
        .eq('user_id', user.id)
        .order('created_at', ascending: false)
        .limit(50);
    if (rows is List) {
      return rows
          .map((e) =>
              AppNotification.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
    }
  } catch (_) {
    // Admin audience fallback
    try {
      final rows = await client
          .from('notifications')
          .select()
          .eq('audience', 'admin')
          .order('created_at', ascending: false)
          .limit(50);
      if (rows is List) {
        return rows
            .map((e) =>
                AppNotification.fromMap(Map<String, dynamic>.from(e as Map)))
            .toList();
      }
    } catch (_) {}
  }
  return [];
});

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  Future<void> _markRead(WidgetRef ref, String id) async {
    final client = ref.read(supabaseClientProvider);
    try {
      await client
          .from('notifications')
          .update({'read_at': DateTime.now().toIso8601String()}).eq('id', id);
      ref.invalidate(notificationsListProvider);
      ref.invalidate(notificationsCountProvider);
    } catch (_) {}
  }

  Future<void> _markAllRead(WidgetRef ref) async {
    final client = ref.read(supabaseClientProvider);
    final user = client.auth.currentUser;
    if (user == null) return;
    try {
      await client
          .from('notifications')
          .update({'read_at': DateTime.now().toIso8601String()})
          .eq('user_id', user.id)
          .filter('read_at', 'is', null);
      ref.invalidate(notificationsListProvider);
      ref.invalidate(notificationsCountProvider);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(notificationsListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('الإشعارات'),
        actions: [
          TextButton(
            onPressed: () => _markAllRead(ref),
            child: const Text('قراءة الكل'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(notificationsListProvider);
          ref.invalidate(notificationsCountProvider);
        },
        child: listAsync.when(
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
                  Center(
                    child: Column(
                      children: [
                        Icon(Icons.notifications_none, size: 56),
                        SizedBox(height: 12),
                        Text('لا توجد إشعارات'),
                      ],
                    ),
                  ),
                ],
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: list.length,
              itemBuilder: (context, i) {
                final n = list[i];
                return Card(
                  color: n.isUnread
                      ? AppColors.primary.withValues(alpha: 0.06)
                      : null,
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: n.isUnread
                          ? AppColors.primary.withValues(alpha: 0.2)
                          : Colors.grey.shade200,
                      child: Icon(
                        Icons.notifications,
                        color: n.isUnread ? AppColors.primary : Colors.grey,
                      ),
                    ),
                    title: Text(
                      n.title ?? 'إشعار',
                      style: TextStyle(
                        fontWeight:
                            n.isUnread ? FontWeight.w800 : FontWeight.w500,
                      ),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (n.body != null) Text(n.body!),
                        if (n.createdAt != null)
                          Text(
                            DateFormat('yyyy/MM/dd HH:mm').format(n.createdAt!),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                      ],
                    ),
                    trailing: n.isUnread
                        ? IconButton(
                            tooltip: 'تحديد كمقروء',
                            onPressed: () => _markRead(ref, n.id),
                            icon: const Icon(Icons.done),
                          )
                        : null,
                    onTap: n.isUnread ? () => _markRead(ref, n.id) : null,
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
