import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'src/api/api_client.dart';
import 'src/state/auth_controller.dart';
import 'src/screens/home_screen.dart';

void main() {
  runApp(const CyberBookApp());
}

class CyberBookApp extends StatelessWidget {
  const CyberBookApp({super.key});

  @override
  Widget build(BuildContext context) {
    final api = ApiClient();
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        ChangeNotifierProvider<AuthController>(create: (_) => AuthController(api)..bootstrap()),
      ],
      child: MaterialApp(
        title: 'CyberBook',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          brightness: Brightness.dark,
          colorSchemeSeed: const Color(0xFF6366F1),
          useMaterial3: true,
        ),
        home: const _Root(),
      ),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    if (auth.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    // The home screen is public; it links to login when authentication is needed.
    return const HomeScreen();
  }
}
