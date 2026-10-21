import 'package:dio/dio.dart';

import 'models.dart';

/// Base URL of the CyberBook API. Override with
/// `--dart-define=CYBERBOOK_API_BASE_URL=http://10.0.2.2:4000/api/v1`
/// (10.0.2.2 is the host loopback from the Android emulator).
const String kApiBaseUrl = String.fromEnvironment(
  'CYBERBOOK_API_BASE_URL',
  defaultValue: 'http://10.0.2.2:4000/api/v1',
);

/// Thin typed client over the CyberBook REST API (unwraps the
/// `{ success, message, data }` envelope and throws [ApiException] on failure).
class ApiClient {
  ApiClient({Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: kApiBaseUrl,
              contentType: 'application/json',
              responseType: ResponseType.json,
            ));

  final Dio _dio;

  String? _accessToken;

  set accessToken(String? token) => _accessToken = token;

  Future<dynamic> _request(String method, String path, {Map<String, dynamic>? query, Object? body}) async {
    try {
      final res = await _dio.request<Map<String, dynamic>>(
        path,
        queryParameters: query,
        data: body,
        options: Options(
          method: method,
          headers: _accessToken == null ? null : {'Authorization': 'Bearer $_accessToken'},
        ),
      );
      return res.data?['data'];
    } on DioException catch (e) {
      final data = e.response?.data;
      final message = (data is Map && data['message'] is String) ? data['message'] as String : e.message ?? 'Request failed';
      final code = (data is Map && data['code'] is String) ? data['code'] as String : null;
      throw ApiException(message, e.response?.statusCode ?? 0, code);
    }
  }

  // ------------------------------------------------------------------ auth
  Future<AuthTokens> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
    String role = 'USER',
  }) async {
    final data = await _request('POST', '/auth/register', body: {
      'email': email,
      'password': password,
      'fullName': fullName,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      'role': role,
    });
    return AuthTokens.fromJson(data as Map<String, dynamic>);
  }

  Future<AuthTokens> login({required String email, required String password}) async {
    final data = await _request('POST', '/auth/login', body: {'email': email, 'password': password});
    return AuthTokens.fromJson(data as Map<String, dynamic>);
  }

  Future<AuthedUser> me() async {
    final data = await _request('GET', '/auth/me');
    return AuthedUser.fromJson(data as Map<String, dynamic>);
  }

  Future<void> logout(String refreshToken) async {
    await _request('POST', '/auth/logout', body: {'refreshToken': refreshToken});
  }

  // ------------------------------------------------------------- discovery
  Future<List<ClubSummary>> searchClubs({String? city, String? q, String? category}) async {
    final data = await _request('GET', '/clubs', query: {
      if (city != null && city.isNotEmpty) 'city': city,
      if (q != null && q.isNotEmpty) 'search': q,
      if (category != null && category.isNotEmpty) 'category': category,
      'size': 50,
    });
    return (data['items'] as List).map((e) => ClubSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> getClub(String idOrSlug) async {
    return (await _request('GET', '/clubs/$idOrSlug')) as Map<String, dynamic>;
  }

  Future<AvailabilityDay> availability(int clubId, String date) async {
    final data = await _request('GET', '/clubs/$clubId/availability', query: {'date': date});
    return AvailabilityDay.fromJson(data as Map<String, dynamic>);
  }

  Future<PriceQuote> quote(int clubId, {required int stationId, required String startsAt, required String endsAt}) async {
    final data = await _request('GET', '/clubs/$clubId/price-quote', query: {
      'stationId': stationId,
      'startsAt': startsAt,
      'endsAt': endsAt,
    });
    return PriceQuote.fromJson(data as Map<String, dynamic>);
  }

  // -------------------------------------------------------------- bookings
  Future<Booking> createBooking({
    required int clubId,
    required int stationId,
    required String startsAt,
    required String endsAt,
    required String idempotencyKey,
  }) async {
    final data = await _request('POST', '/bookings', body: {
      'clubId': clubId,
      'stationId': stationId,
      'startsAt': startsAt,
      'endsAt': endsAt,
      'idempotencyKey': idempotencyKey,
    });
    return Booking.fromJson(data as Map<String, dynamic>);
  }

  Future<List<Booking>> myBookings() async {
    final data = await _request('GET', '/bookings/mine', query: {'size': 50});
    return (data['items'] as List).map((e) => Booking.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Booking> cancelBooking(int id, [String? reason]) async {
    final data = await _request('POST', '/bookings/$id/cancel', body: {'reason': reason});
    return Booking.fromJson(data as Map<String, dynamic>);
  }

  // ------------------------------------------------------------- favorites
  Future<List<ClubSummary>> myFavorites() async {
    final data = await _request('GET', '/favorites/mine');
    return (data as List).map((e) => ClubSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<bool> toggleFavorite(int clubId) async {
    final data = await _request('POST', '/clubs/$clubId/favorite');
    return data['favorited'] as bool;
  }
}
