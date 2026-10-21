import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../api/models.dart';

class AuthController extends ChangeNotifier {
  AuthController(this._api);

  final ApiClient _api;

  AuthTokens? _tokens;
  AuthedUser? _user;
  bool _loading = true;

  AuthedUser? get user => _user;
  bool get isAuthenticated => _user != null;
  bool get loading => _loading;

  static const _accessKey = 'cb_access_token';
  static const _refreshKey = 'cb_refresh_token';

  Future<void> bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final access = prefs.getString(_accessKey);
    final refresh = prefs.getString(_refreshKey);
    if (access != null && refresh != null) {
      _api.accessToken = access;
      try {
        _user = await _api.me();
      } catch (_) {
        await _clear();
      }
    }
    _loading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final tokens = await _api.login(email: email, password: password);
    await _persist(tokens);
  }

  Future<void> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
    String role = 'USER',
  }) async {
    final tokens = await _api.register(email: email, password: password, fullName: fullName, phone: phone, role: role);
    await _persist(tokens);
  }

  Future<void> logout() async {
    final refresh = _tokens?.refreshToken;
    if (refresh != null) {
      try {
        await _api.logout(refresh);
      } catch (_) {/* best effort */}
    }
    await _clear();
    notifyListeners();
  }

  Future<void> _persist(AuthTokens tokens) async {
    _tokens = tokens;
    _user = tokens.user;
    _api.accessToken = tokens.accessToken;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_accessKey, tokens.accessToken);
    await prefs.setString(_refreshKey, tokens.refreshToken);
    notifyListeners();
  }

  Future<void> _clear() async {
    _tokens = null;
    _user = null;
    _api.accessToken = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_accessKey);
    await prefs.remove(_refreshKey);
  }
}
