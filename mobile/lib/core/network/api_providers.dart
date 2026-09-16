import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final aiChatApiProvider = Provider<AiChatApi>((ref) {
  return AiChatApi(ref.watch(apiClientProvider).dio);
});

final serviceRequestsApiProvider = Provider<ServiceRequestsApi>((ref) {
  return ServiceRequestsApi(ref.watch(apiClientProvider).dio);
});

final subscriptionsApiProvider = Provider<SubscriptionsApi>((ref) {
  return SubscriptionsApi(ref.watch(apiClientProvider).dio);
});

final notificationsApiProvider = Provider<NotificationsApi>((ref) {
  return NotificationsApi(ref.watch(apiClientProvider).dio);
});
