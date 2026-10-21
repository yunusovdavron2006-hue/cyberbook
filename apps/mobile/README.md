# CyberBook Mobile (Flutter)

Cross-platform client for discovering clubs and reserving stations.

> **Status: source complete, not built in this workspace.** The Flutter SDK is not
> installed on the build machine, so `flutter pub get`, `flutter analyze` and
> `flutter build` have **not** been run. Treat this module as unverified until a
> machine with Flutter runs the commands below.

## Layout

- `lib/main.dart` — app bootstrap (providers + theme).
- `lib/src/api/api_client.dart` — Dio client; unwraps the `{ success, message, data }` envelope.
- `lib/src/api/models.dart` — DTOs mirroring the NestJS API (money = integer UZS).
- `lib/src/state/auth_controller.dart` — auth state, token persistence via `shared_preferences`.
- `lib/src/screens/*` — home/search, club detail + booking, login, register, bookings, favorites.

## Configure the API base URL

The default is `http://10.0.2.2:4000/api/v1` (host loopback from the Android emulator).
Override at build time:

```bash
flutter run --dart-define=CYBERBOOK_API_BASE_URL=http://192.168.1.50:4000/api/v1
```

## Run

```bash
flutter pub get
flutter analyze
flutter run
```

## Notes / follow-ups

- Token refresh is not yet automatic; on `401` the app clears the session and asks the user to log in again.
- Booking times are converted to UTC before sending (`toUtc().toIso8601String()`); the UI shows club-local time loosely via the device timezone.
