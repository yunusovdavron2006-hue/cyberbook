import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';

class BookingsScreen extends StatefulWidget {
  const BookingsScreen({super.key});

  @override
  State<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends State<BookingsScreen> {
  late Future<List<Booking>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<ApiClient>().myBookings();
  }

  Future<void> _cancel(int id) async {
    try {
      await context.read<ApiClient>().cancelBooking(id, 'Cancelled from mobile');
      setState(_load);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My bookings')),
      body: FutureBuilder<List<Booking>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Failed to load bookings.\n${snapshot.error}'));
          }
          final items = snapshot.data ?? [];
          if (items.isEmpty) return const Center(child: Text('No bookings yet.'));
          return RefreshIndicator(
            onRefresh: () async => setState(_load),
            child: ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final b = items[i];
                final cancellable = b.status == 'PENDING' || b.status == 'CONFIRMED';
                return ListTile(
                  title: Text(b.clubName ?? 'Club #${b.clubId}'),
                  subtitle: Text(
                    '${b.stationLabel ?? '#${b.stationId}'} · '
                    '${DateFormat('dd MMM HH:mm').format(b.startsAt.toLocal())}–'
                    '${DateFormat('HH:mm').format(b.endsAt.toLocal())}\n'
                    'Ref ${b.reference} · ${b.priceAmount} so\'m',
                  ),
                  isThreeLine: true,
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(b.status),
                      if (cancellable)
                        TextButton(
                          onPressed: () => _cancel(b.id),
                          child: const Text('Cancel'),
                        ),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
