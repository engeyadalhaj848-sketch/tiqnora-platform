/// Tiqnora AI — App configuration
class AppConfig {
  AppConfig._();

  static const String appName = 'Tiqnora AI';
  static const String appNameAr = 'تيقنورا للذكاء الاصطناعي';

  /// Android applicationId / iOS bundle id
  static const String androidApplicationId = 'com.tiqnora.app';
  static const String iosBundleId = 'com.tiqnora.app';

  /// Supabase
  static const String supabaseUrl = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
  static const String supabaseAnonKey =
      'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

  /// API base (Vercel)
  static const String apiBaseUrl = 'https://tiqnora.com';

  /// Mobile endpoints
  static const String registerDevicePath = '/api/mobile/register-device';
  static const String appVersionPath = '/api/mobile/app-version';

  static const String defaultLocale = 'ar';
  static const List<String> supportedLocales = ['ar', 'en'];

  /// Privacy / legal (public site)
  static const String privacyUrl = 'https://tiqnora.com/privacy';
  static const String termsUrl = 'https://tiqnora.com/terms';
  static const String supportEmail = 'support@tiqnora.com';
}
