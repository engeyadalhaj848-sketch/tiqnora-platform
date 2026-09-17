import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../domain/ai_models.dart';
import 'ai_providers.dart';

class AiChatScreen extends ConsumerStatefulWidget {
  const AiChatScreen({super.key});

  @override
  ConsumerState<AiChatScreen> createState() => _AiChatScreenState();
}

class _AiChatScreenState extends ConsumerState<AiChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _controller.text;
    _controller.clear();
    await ref.read(chatNotifierProvider.notifier).send(text);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final agentsAsync = ref.watch(aiAgentsProvider);
    final selected = ref.watch(selectedAgentProvider);
    final chat = ref.watch(chatNotifierProvider);
    final usageAsync = ref.watch(aiUsageProvider);

    ref.listen(chatNotifierProvider, (_, __) => _scrollToBottom());

    return Scaffold(
      appBar: AppBar(
        title: Text(selected?.displayName ?? 'محادثة الذكاء الاصطناعي'),
        actions: [
          if (selected != null)
            IconButton(
              tooltip: 'تغيير الوكيل',
              onPressed: () {
                ref.read(selectedAgentProvider.notifier).state = null;
                ref.read(chatNotifierProvider.notifier).clear();
              },
              icon: const Icon(Icons.swap_horiz),
            ),
        ],
      ),
      body: selected == null
          ? _buildAgentPicker(agentsAsync, usageAsync)
          : _buildChat(chat, usageAsync),
    );
  }

  Widget _buildAgentPicker(
    AsyncValue<List<AiAgent>> agentsAsync,
    AsyncValue<Map<String, dynamic>> usageAsync,
  ) {
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(aiAgentsProvider);
        ref.invalidate(aiUsageProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          usageAsync.when(
            data: (u) {
              final used = u['used'] ?? 0;
              final limit = u['limit'];
              return Card(
                color: AppColors.primary.withValues(alpha: 0.08),
                child: ListTile(
                  leading: const Icon(Icons.auto_awesome, color: AppColors.primary),
                  title: const Text('استخدام الذكاء الاصطناعي'),
                  subtitle: Text(
                    limit == null ? 'مستخدم: $used' : 'مستخدم: $used / $limit',
                  ),
                ),
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          const SizedBox(height: 12),
          Text(
            'اختر وكيلاً للبدء',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          agentsAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(),
              ),
            ),
            error: (e, _) => Text('تعذر تحميل الوكلاء: $e'),
            data: (agents) {
              if (agents.isEmpty) {
                return const Card(
                  child: ListTile(title: Text('لا يوجد وكلاء متاحون حالياً')),
                );
              }
              return Column(
                children: agents.map((a) {
                  return Card(
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: AppColors.accent.withValues(alpha: 0.15),
                        child: const Icon(Icons.smart_toy, color: AppColors.accent),
                      ),
                      title: Text(
                        a.displayName,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: a.description != null
                          ? Text(a.description!)
                          : null,
                      trailing: const Icon(Icons.chevron_left),
                      onTap: () {
                        ref.read(selectedAgentProvider.notifier).state = a;
                        ref.read(chatNotifierProvider.notifier).clear();
                      },
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildChat(
    ChatState chat,
    AsyncValue<Map<String, dynamic>> usageAsync,
  ) {
    return Column(
      children: [
        usageAsync.when(
          data: (u) {
            final limit = u['limit'];
            if (limit == null) return const SizedBox.shrink();
            final used = (u['used'] as int?) ?? 0;
            return Material(
              color: used >= limit
                  ? AppColors.error.withValues(alpha: 0.1)
                  : AppColors.primary.withValues(alpha: 0.06),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      size: 18,
                      color: used >= limit
                          ? AppColors.error
                          : AppColors.primary,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'الاستخدام: $used / $limit',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        ),
        if (chat.error != null)
          Material(
            color: AppColors.error.withValues(alpha: 0.1),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: AppColors.error),
                  const SizedBox(width: 8),
                  Expanded(child: Text(chat.error!)),
                  IconButton(
                    onPressed: () =>
                        ref.read(chatNotifierProvider.notifier).clear(),
                    icon: const Icon(Icons.close, size: 18),
                  ),
                ],
              ),
            ),
          ),
        Expanded(
          child: chat.messages.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.chat_bubble_outline,
                          size: 48,
                          color: Theme.of(context).colorScheme.primary),
                      const SizedBox(height: 12),
                      const Text('ابدأ المحادثة الآن'),
                    ],
                  ),
                )
              : ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.all(16),
                  itemCount: chat.messages.length,
                  itemBuilder: (context, i) {
                    final m = chat.messages[i];
                    return _MessageBubble(message: m);
                  },
                ),
        ),
        if (chat.isSending)
          const LinearProgressIndicator(minHeight: 2),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _send(),
                    decoration: InputDecoration(
                      hintText: 'اكتب رسالتك...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                    ),
                    maxLines: 4,
                    minLines: 1,
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: chat.isSending ? null : _send,
                  icon: const Icon(Icons.send),
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    return Align(
      alignment: isUser ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        decoration: BoxDecoration(
          color: isUser
              ? AppColors.primary
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16).copyWith(
            bottomLeft: isUser ? const Radius.circular(4) : null,
            bottomRight: !isUser ? const Radius.circular(4) : null,
          ),
        ),
        child: Text(
          message.content,
          style: TextStyle(
            color: isUser
                ? Colors.white
                : Theme.of(context).colorScheme.onSurface,
            height: 1.4,
          ),
        ),
      ),
    );
  }
}
