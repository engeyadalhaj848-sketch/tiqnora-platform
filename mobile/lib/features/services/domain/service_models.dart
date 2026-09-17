import 'package:equatable/equatable.dart';

enum ServiceRequestStatus { pending, inProgress, completed, cancelled, unknown }

ServiceRequestStatus statusFromString(String? v) {
  switch ((v ?? '').toLowerCase().replaceAll(' ', '_')) {
    case 'pending':
    case 'new':
    case 'open':
      return ServiceRequestStatus.pending;
    case 'in_progress':
    case 'inprogress':
    case 'processing':
    case 'active':
      return ServiceRequestStatus.inProgress;
    case 'completed':
    case 'done':
    case 'closed':
      return ServiceRequestStatus.completed;
    case 'cancelled':
    case 'canceled':
      return ServiceRequestStatus.cancelled;
    default:
      return ServiceRequestStatus.unknown;
  }
}

String statusLabelAr(ServiceRequestStatus s) {
  switch (s) {
    case ServiceRequestStatus.pending:
      return 'قيد الانتظار';
    case ServiceRequestStatus.inProgress:
      return 'قيد التنفيذ';
    case ServiceRequestStatus.completed:
      return 'مكتمل';
    case ServiceRequestStatus.cancelled:
      return 'ملغي';
    case ServiceRequestStatus.unknown:
      return 'غير معروف';
  }
}

class ServiceRequest extends Equatable {
  const ServiceRequest({
    required this.id,
    this.title,
    this.serviceType,
    this.description,
    this.status = ServiceRequestStatus.pending,
    this.notes,
    this.createdAt,
    this.updatedAt,
    this.userId,
  });

  final String id;
  final String? title;
  final String? serviceType;
  final String? description;
  final ServiceRequestStatus status;
  final String? notes;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? userId;

  factory ServiceRequest.fromMap(Map<String, dynamic> map) {
    return ServiceRequest(
      id: (map['id'] ?? '').toString(),
      title: map['title'] as String?,
      serviceType: (map['service_type'] ?? map['type'] ?? map['category'])
          as String?,
      description: map['description'] as String? ?? map['details'] as String?,
      status: statusFromString(map['status'] as String?),
      notes: map['notes'] as String? ?? map['admin_notes'] as String?,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString())
          : null,
      updatedAt: map['updated_at'] != null
          ? DateTime.tryParse(map['updated_at'].toString())
          : null,
      userId: map['user_id']?.toString() ?? map['customer_id']?.toString(),
    );
  }

  @override
  List<Object?> get props => [id, status];
}

const serviceTypes = [
  'استشارة AI',
  'إعداد وكيل ذكي',
  'تكامل API',
  'تدريب فريق',
  'دعم فني',
  'تخصيص خطة',
  'أخرى',
];
