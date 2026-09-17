import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kLocale = 'tiqnora_locale';
const _kTheme = 'tiqnora_theme_mode';

class AppSettings {
  const AppSettings({
    this.localeCode = 'ar',
    this.themeMode = ThemeMode.system,
  });

  final String localeCode;
  final ThemeMode themeMode;

  Locale get locale => Locale(localeCode);

  AppSettings copyWith({String? localeCode, ThemeMode? themeMode}) {
    return AppSettings(
      localeCode: localeCode ?? this.localeCode,
      themeMode: themeMode ?? this.themeMode,
    );
  }
}

class AppSettingsNotifier extends StateNotifier<AppSettings> {
  AppSettingsNotifier() : super(const AppSettings()) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_kLocale) ?? 'ar';
    final themeStr = prefs.getString(_kTheme) ?? 'system';
    state = AppSettings(
      localeCode: code,
      themeMode: _parseTheme(themeStr),
    );
  }

  Future<void> setLocale(String code) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kLocale, code);
    state = state.copyWith(localeCode: code);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kTheme, mode.name);
    state = state.copyWith(themeMode: mode);
  }

  ThemeMode _parseTheme(String v) {
    switch (v) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      default:
        return ThemeMode.system;
    }
  }
}

final appSettingsProvider =
    StateNotifierProvider<AppSettingsNotifier, AppSettings>((ref) {
  return AppSettingsNotifier();
});
