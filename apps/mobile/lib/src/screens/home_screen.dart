import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../state/auth_controller.dart';
import 'login_screen.dart';
import 'club_detail_screen.dart';
import 'bookings_screen.dart';
import 'favorites_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _query = TextEditingController();
  Future<List<ClubSummary>>? _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    setState(() {
      _future = context.read<ApiClient>().searchClubs(city: 'Tashkent', q: _query.text.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('CyberBook'),
        actions: [
          if (auth.isAuthenticated)
            IconButton(
              icon: const Icon(Icons.receipt_long),
              tooltip: 'My bookings',
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BookingsScreen())),
            ),
          if (auth.isAuthenticated)
            IconButton(
              icon: const Icon(Icons.favorite),
              tooltip: 'Favorites',
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FavoritesScreen())),
            ),
          if (auth.isAuthenticated)
            IconButton(
              icon: const Icon(Icons.logout),
              tooltip: 'Log out',
              onPressed: () => auth.logout(),
            )
          else
            TextButton(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen())),
              child: const Text('Log in'),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _query,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _load(),
                    decoration: const InputDecoration(
                      hintText: 'Search clubs by name or district',
                      prefixIcon: Icon(Icons.search),
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(onPressed: _load, child: const Text('Search')),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<List<ClubSummary>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text('Could not reach the API.\n${snapshot.error}',
                          textAlign: TextAlign.center),
                    ),
                  );
                }
                final clubs = snapshot.data ?? [];
                if (clubs.isEmpty) return const Center(child: Text('No clubs found.'));
                return ListView.separated(
                  itemCount: clubs.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) => _ClubTile(club: clubs[i]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ClubTile extends StatelessWidget {
  const _ClubTile({required this.club});
  final ClubSummary club;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(club.name),
      subtitle: Text('${club.district ?? club.city} · ${club.stationCount} seats · from ${club.minPricePerHour} so\'m/h'),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('★ ${club.rating.toStringAsFixed(1)}'),
          Text('${club.reviewCount}', style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => ClubDetailScreen(slug: club.slug, clubId: club.id, name: club.name)),
      ),
    );
  }
}
