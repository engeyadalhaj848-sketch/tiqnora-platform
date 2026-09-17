import 'package:equatable/equatable.dart';

class AiAgent extends Equatable {
  const AiAgent({
    required this.id,
    required this.name,
    this.nameAr,
    this.description,
    this.slug,
    this.avatarUrl,
    this.isActive = true,
  });

  final String id;
  final String name;
  final String? nameAr;
  final String? description;
  final String? slug;
  final String? avatarUrl;
  final bool isActive;

  String get displayName => nameAr?.isNotEmpty == true ? nameAr! : name;

  factory AiAgent.fromMap(Map<String, dynamic> map) {
    return AiAgent(
      id: (map['id'] ?? '').toString(),
      name: (map['name'] ?? map['title'] ?? 'Agent').toString(),
      nameAr: map['name_ar'] as String? ?? map['title_ar'] as String?,
      description: map['description'] as String? ?? map['description_ar'] as String?,
      slug: map['slug'] as String?,
      avatarUrl: map['avatar_url'] as String?,
      isActive: map['is_active'] as bool? ?? map['active'] as bool? ?? true,
    );
  }

  @override
  List<Object?> get props => [id, name, slug];
}

class ChatMessage extends Equatable {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    this.createdAt,
  });

  final String id;
  final String role; // user | assistant | system
  final String content;
  final DateTime? createdAt;

  bool get isUser => role == 'user';

  factory ChatMessage.fromMap(Map<String, dynamic> map) {
    return ChatMessage(
      id: (map['id'] ?? DateTime.now().millisecondsSinceEpoch.toString()).toString(),
      role: (map['role'] ?? 'assistant').toString(),
      content: (map['content'] ?? map['message'] ?? map['text'] ?? '').toString(),
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString())
          : null,
    );
  }

  @override
  List<Object?> get props => [id, role, content];
}

class ChatConversation extends Equatable {
  const ChatConversation({
    required this.id,
    this.title,
    this.agentId,
    this.updatedAt,
  });

  final String id;
  final String? title;
  final String? agentId;
  final DateTime? updatedAt;

  factory ChatConversation.fromMap(Map<String, dynamic> map) {
    return ChatConversation(
      id: (map['id'] ?? '').toString(),
      title: map['title'] as String?,
      agentId: map['agent_id']?.toString(),
      updatedAt: map['updated_at'] != null
          ? DateTime.tryParse(map['updated_at'].toString())
          : null,
    );
  }

  @override
  List<Object?> get props => [id];
}
