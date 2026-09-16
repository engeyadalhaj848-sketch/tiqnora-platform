import 'package:dio/dio.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../config/app_config.dart';

class ApiClient {
  ApiClient() {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = Supabase.instance.client.auth.currentSession?.accessToken;
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  late final Dio _dio;

  Dio get dio => _dio;

  Future<Map<String, dynamic>> getAppVersion(String platform) async {
    final res = await _dio.get(
      AppConfig.appVersionPath,
      queryParameters: {'platform': platform},
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> registerDevice({
    required String token,
    required String deviceType,
    Map<String, dynamic>? deviceInfo,
  }) async {
    final res = await _dio.post(
      AppConfig.registerDevicePath,
      data: {
        'token': token,
        'device_type': deviceType,
        if (deviceInfo != null) 'device_info': deviceInfo,
      },
    );
    return Map<String, dynamic>.from(res.data as Map);
  }
}

/// Feature API stubs for M1+
class AiChatApi {
  AiChatApi(this._dio);
  final Dio _dio;

  Future<Map<String, dynamic>> sendMessage(String message) async {
    final res = await _dio.post('/api/sales/chat', data: {'message': message});
    return Map<String, dynamic>.from(res.data as Map);
  }
}

class ServiceRequestsApi {
  ServiceRequestsApi(this._dio);
  final Dio _dio;

  Future<List<dynamic>> listMine() async {
    final res = await _dio.get('/api/customer/service-requests');
    final data = res.data;
    if (data is List) return data;
    if (data is Map && data['items'] is List) return data['items'] as List;
    return const [];
  }
}

class SubscriptionsApi {
  SubscriptionsApi(this._dio);
  final Dio _dio;

  Future<Map<String, dynamic>?> current() async {
    final res = await _dio.get('/api/customer/subscription');
    if (res.data == null) return null;
    return Map<String, dynamic>.from(res.data as Map);
  }
}

class NotificationsApi {
  NotificationsApi(this._dio);
  final Dio _dio;

  Future<List<dynamic>> list() async {
    final res = await _dio.get('/api/notifications');
    final data = res.data;
    if (data is List) return data;
    if (data is Map && data['items'] is List) return data['items'] as List;
    return const [];
  }
}
