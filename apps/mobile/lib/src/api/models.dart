// CyberBook mobile API models. Mirrors the NestJS DTOs. Money is integer UZS so'm.

class ApiException implements Exception {
  ApiException(this.message, this.statusCode, [this.code]);
  final String message;
  final int statusCode;
  final String? code;

  @override
  String toString() => message;
}

class AuthedUser {
  AuthedUser({
    required this.id,
    required this.email,
    required this.role,
    required this.status,
    this.phone,
    this.displayName,
  });

  final int id;
  final String email;
  final String role;
  final String status;
  final String? phone;
  final String? displayName;

  factory AuthedUser.fromJson(Map<String, dynamic> j) => AuthedUser(
        id: j['id'] as int,
        email: j['email'] as String,
        role: j['role'] as String,
        status: j['status'] as String,
        phone: j['phone'] as String?,
        displayName: j['displayName'] as String?,
      );
}

class AuthTokens {
  AuthTokens({required this.accessToken, required this.refreshToken, required this.user});
  final String accessToken;
  final String refreshToken;
  final AuthedUser user;

  factory AuthTokens.fromJson(Map<String, dynamic> j) => AuthTokens(
        accessToken: j['accessToken'] as String,
        refreshToken: j['refreshToken'] as String,
        user: AuthedUser.fromJson(j['user'] as Map<String, dynamic>),
      );
}

class ClubSummary {
  ClubSummary({
    required this.id,
    required this.name,
    required this.slug,
    required this.city,
    required this.address,
    required this.rating,
    required this.reviewCount,
    required this.stationCount,
    required this.minPricePerHour,
    required this.categories,
    this.district,
  });

  final int id;
  final String name;
  final String slug;
  final String city;
  final String address;
  final double rating;
  final int reviewCount;
  final int stationCount;
  final int minPricePerHour;
  final List<String> categories;
  final String? district;

  factory ClubSummary.fromJson(Map<String, dynamic> j) => ClubSummary(
        id: j['id'] as int,
        name: j['name'] as String,
        slug: j['slug'] as String,
        city: j['city'] as String,
        address: j['address'] as String,
        rating: (j['rating'] as num).toDouble(),
        reviewCount: j['reviewCount'] as int,
        stationCount: j['stationCount'] as int,
        minPricePerHour: j['minPricePerHour'] as int,
        categories: (j['categories'] as List).cast<String>(),
        district: j['district'] as String?,
      );
}

class TimeWindow {
  TimeWindow({required this.startsAt, required this.endsAt});
  final DateTime startsAt;
  final DateTime endsAt;

  factory TimeWindow.fromJson(Map<String, dynamic> j) => TimeWindow(
        startsAt: DateTime.parse(j['startsAt'] as String),
        endsAt: DateTime.parse(j['endsAt'] as String),
      );
}

class AvailabilityStation {
  AvailabilityStation({
    required this.stationId,
    required this.label,
    required this.category,
    required this.pricePerHour,
    required this.status,
    required this.free,
  });

  final int stationId;
  final String label;
  final String category;
  final int pricePerHour;
  final String status;
  final List<TimeWindow> free;

  factory AvailabilityStation.fromJson(Map<String, dynamic> j) => AvailabilityStation(
        stationId: j['stationId'] as int,
        label: j['label'] as String,
        category: j['category'] as String,
        pricePerHour: j['pricePerHour'] as int,
        status: j['status'] as String,
        free: (j['free'] as List).map((e) => TimeWindow.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class AvailabilityDay {
  AvailabilityDay({required this.timezone, required this.date, required this.closedAllDay, required this.stations});
  final String timezone;
  final String date;
  final bool closedAllDay;
  final List<AvailabilityStation> stations;

  factory AvailabilityDay.fromJson(Map<String, dynamic> j) => AvailabilityDay(
        timezone: j['timezone'] as String,
        date: j['date'] as String,
        closedAllDay: j['closedAllDay'] as bool,
        stations: (j['stations'] as List)
            .map((e) => AvailabilityStation.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class PriceQuote {
  PriceQuote({required this.total, required this.currency});
  final int total;
  final String currency;

  factory PriceQuote.fromJson(Map<String, dynamic> j) => PriceQuote(
        total: j['total'] as int,
        currency: j['currency'] as String,
      );
}

class Booking {
  Booking({
    required this.id,
    required this.reference,
    required this.clubId,
    required this.stationId,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.priceAmount,
    required this.timezone,
    this.clubName,
    this.stationLabel,
  });

  final int id;
  final String reference;
  final int clubId;
  final int stationId;
  final DateTime startsAt;
  final DateTime endsAt;
  final String status;
  final int priceAmount;
  final String timezone;
  final String? clubName;
  final String? stationLabel;

  factory Booking.fromJson(Map<String, dynamic> j) => Booking(
        id: j['id'] as int,
        reference: j['reference'] as String,
        clubId: j['clubId'] as int,
        stationId: j['stationId'] as int,
        startsAt: DateTime.parse(j['startsAt'] as String),
        endsAt: DateTime.parse(j['endsAt'] as String),
        status: j['status'] as String,
        priceAmount: j['priceAmount'] as int,
        timezone: (j['timezone'] as String?) ?? 'Asia/Tashkent',
        clubName: j['clubName'] as String?,
        stationLabel: j['stationLabel'] as String?,
      );
}
