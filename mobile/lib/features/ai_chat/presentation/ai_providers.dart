import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/network/api_providers.dart';
import '../../auth/presentation/auth_provider.dart';
import '../domain/ai_models.dart';

final aiAgentsProvider = FutureProvider<List<AiAgent>>((ref) async {
  final client = ref.watch(supabaseClientProvider);
  try {
    final rows = await client
        .from('ai_agents')
        .select()
        .order('created_at', ascending: true);
    if (rows is List && rows.isNotEmpty) {
      return rows
          .map((e) => AiAgent.fromMap(Map<String, dynamic>.from(e as Map)))
          .where((a) => a.isActive)
          .toList();
    }
  } catch (_) {}

  // Fallback seeded agents
  return const [
    AiAgent(
      id: 'sales',
      name: 'Sales Assistant',
      nameAr: 'مساعد المبيعات',
      description: 'يساعدك في اختيار الخطة المناسبة',
      slug: 'sales',
    ),
    AiAgent(
      id: 'support',
      name: 'Support Agent',
      nameAr: 'وكيل الدعم',
      description: 'يجيب على أسئلة الخدمة والدعم',
      slug: 'support',
    ),
    AiAgent(
      id: 'general',
      name: 'General AI',
      nameAr: 'الذكاء العام',
      description: 'محادثة عامة مع الذكاء الاصطناعي',
      slug: 'general',
    ),
  ];
});

final selectedAgentProvider = StateProvider<AiAgent?>((ref) => null);

class ChatState {
  const ChatState({
    this.messages = const [],
    this.conversationId,
    this.isSending = false,
    this.error,
  });

  final List<ChatMessage> messages;
  final String? conversationId;
  final bool isSending;
  final String? error;

  ChatState copyWith({
    List<ChatMessage>? messages,
    String? conversationId,
    bool? isSending,
    String? error,
    bool clearError = false,
  }) {
    return ChatState(
      messages: messages ?? this.messages,
      conversationId: conversationId ?? this.conversationId,
      isSending: isSending ?? this.isSending,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(this._ref) : super(const ChatState());

  final Ref _ref;

  void clear() {
    state = const ChatState();
  }

  Future<void> send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || state.isSending) return;

    final userMsg = ChatMessage(
      id: 'u-${DateTime.now().millisecondsSinceEpoch}',
      role: 'user',
      content: trimmed,
      createdAt: DateTime.now(),
    );

    state = state.copyWith(
      messages: [...state.messages, userMsg],
      isSending: true,
      clearError: true,
    );

    try {
      final api = _ref.read(aiChatApiProvider);
      final agent = _ref.read(selectedAgentProvider);

      Map<String, dynamic> res;
      try {
        res = await api.sendMessage(
          message: trimmed,
          agentId: agent?.id ?? agent?.slug,
          conversationId: state.conversationId,
        );
      } catch (_) {
        // Fallback to public sales endpoint
        res = await api.sendSalesMessage(trimmed);
      }

      final replyText = (res['reply'] ??
              res['response'] ??
              res['message'] ??
              res['content'] ??
              res['text'] ??
              'تم استلام رسالتك.')
          .toString();

      final convId = (res['conversation_id'] ?? res['id'])?.toString();

      final assistantMsg = ChatMessage(
        id: 'a-${DateTime.now().millisecondsSinceEpoch}',
        role: 'assistant',
        content: replyText,
        createdAt: DateTime.now(),
      );

      state = state.copyWith(
        messages: [...state.messages, assistantMsg],
        conversationId: convId ?? state.conversationId,
        isSending: false,
      );

      // Best-effort: persist to ai_conversations if table exists
      try {
        final client = _ref.read(supabaseClientProvider);
        final user = client.auth.currentUser;
        if (user != null) {
          await client.from('ai_conversations').insert({
            'user_id': user.id,
            'agent_id': agent?.id,
            'role': 'user',
            'content': trimmed,
          });
          await client.from('ai_conversations').insert({
            'user_id': user.id,
            'agent_id': agent?.id,
            'role': 'assistant',
            'content': replyText,
          });
        }
      } catch (_) {}
    } catch (e) {
      state = state.copyWith(
        isSending: false,
        error: 'تعذر إرسال الرسالة. تحقق من الاتصال أو حدود الاستخدام.',
      );
    }
  }
}

final chatNotifierProvider =
    StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(ref);
});

final aiUsageProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final client = ref.watch(supabaseClientProvider);
  final user = client.auth.currentUser;
  if (user == null) return {'used': 0, 'limit': null};

  try {
    final profile = await client
        .from('profiles')
        .select('default_organization_id')
        .eq('id', user.id)
        .maybeSingle();
    final orgId = profile?['default_organization_id'] as String?;
    if (orgId == null) return {'used': 0, 'limit': null};

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

    int? limit;
    try {
      final sub = await client
          .from('subscriptions')
          .select('plans(ai_monthly_limit)')
          .eq('organization_id', orgId)
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();
      final plans = sub?['plans'];
      if (plans is Map) {
        limit = plans['ai_monthly_limit'] as int?;
      }
    } catch (_) {}

    return {'used': used, 'limit': limit};
  } catch (_) {
    return {'used': 0, 'limit': null};
  }
});
