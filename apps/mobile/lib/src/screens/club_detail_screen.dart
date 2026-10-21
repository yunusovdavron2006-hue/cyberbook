import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../state/auth_controller.dart';
import 'login_screen.dart';
import 'bookings_screen.dart';

const _durations = [30, 60, 90, 120, 180, 240];

class ClubDetailScreen extends StatefulWidget {
  const ClubDetailScreen({super.key, required this.slug, required this.clubId, required this.name});
  final String slug;
  final int clubId;
  final String name;

  @override
  State<ClubDetailScreen> createState() => _ClubDetailScreenState();
}

class _ClubDetailScreenState extends State<ClubDetailScreen> {
  DateTime _date = DateTime.now();
  Future<AvailabilityDay>? _future;

  int? _stationId;
  DateTime? _start;
  int _duration = 60;
  int? _total;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  String get _dateStr => DateFormat('yyyy-MM-dd').format(_date);

  void _reload() {
    setState(() {
      _stationId = null;
      _start = null;
      _total = null;
      _future = context.read<ApiClient>().availability(widget.clubId, _dateStr);
    });
  }

  AvailabilityStation? _selected(AvailabilityDay day) {
    for (final s in day.stations) {
      if (s.stationId == _stationId) return s;
    }
    return null;
  }

  DateTime? _maxEndForStart(AvailabilityStation s, DateTime start) {
    for (final w in s.free) {
      if (!start.isBefore(w.startsAt) && start.isBefore(w.endsAt)) return w.endsAt;
    }
    return null;
  }

  Future<void> _quote() async {
    if (_stationId == null || _start == null) return;
    final endsAt = _start!.add(Duration(minutes: _duration));
    try {
      final q = await context
          .read<ApiClient>()
          .quote(widget.clubId, stationId: _stationId!, startsAt: _start!.toUtc().toIso8601String(), endsAt: endsAt.toUtc().toIso8601String());
      setState(() => _total = q.total);
    } catch (_) {
      setState(() => _total = null);
    }
  }

  Future<void> _book() async {
    final auth = context.read<AuthController>();
    if (!auth.isAuthenticated) {
      await Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
      return;
    }
    if (_stationId == null || _start == null) return;
    final endsAt = _start!.add(Duration(minutes: _duration));
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final key = '${DateTime.now().microsecondsSinceEpoch}-${auth.user!.id}-${_stationId!}';
      await context.read<ApiClient>().createBooking(
            clubId: widget.clubId,
            stationId: _stationId!,
            startsAt: _start!.toUtc().toIso8601String(),
            endsAt: endsAt.toUtc().toIso8601String(),
            idempotencyKey: key,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Booking confirmed!')));
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const BookingsScreen()));
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Booking failed');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.name)),
      body: FutureBuilder<AvailabilityDay>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Failed to load availability.\n${snapshot.error}'));
          }
          final day = snapshot.data!;
          final selected = _selected(day);
          final slots = _buildSlots(selected);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  Text('Date: ${DateFormat('dd MMM yyyy').format(_date)}'),
                  const Spacer(),
                  TextButton.icon(
                    icon: const Icon(Icons.calendar_today, size: 18),
                    label: const Text('Change'),
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: _date,
                        firstDate: DateTime.now().subtract(const Duration(days: 1)),
                        lastDate: DateTime.now().add(const Duration(days: 60)),
                      );
                      if (picked != null) {
                        _date = picked;
                        _reload();
                      }
                    },
                  ),
                ],
              ),
              if (day.closedAllDay)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Text('The club is closed on this date.', style: TextStyle(color: Colors.amber)),
                )
              else ...[
                const SizedBox(height: 8),
                DropdownButtonFormField<int>(
                  value: _stationId,
                  decoration: const InputDecoration(labelText: 'Station', border: OutlineInputBorder()),
                  items: day.stations
                      .where((s) => s.status == 'ACTIVE')
                      .map((s) => DropdownMenuItem(
                            value: s.stationId,
                            child: Text('${s.label} · ${s.category} · ${s.pricePerHour} so\'m/h'),
                          ))
                      .toList(),
                  onChanged: (v) {
                    setState(() {
                      _stationId = v;
                      _start = null;
                      _total = null;
                    });
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<DateTime>(
                  value: _start,
                  decoration: const InputDecoration(labelText: 'Start time', border: OutlineInputBorder()),
                  items: slots
                      .map((t) => DropdownMenuItem(value: t, child: Text(DateFormat('HH:mm').format(t.toLocal()))))
                      .toList(),
                  onChanged: (v) {
                    setState(() => _start = v);
                    _quote();
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<int>(
                  value: _duration,
                  decoration: const InputDecoration(labelText: 'Duration', border: OutlineInputBorder()),
                  items: _durationOptions(selected).map((d) => DropdownMenuItem(value: d, child: Text('$d minutes'))).toList(),
                  onChanged: (v) {
                    setState(() => _duration = v ?? 60);
                    _quote();
                  },
                ),
                const SizedBox(height: 16),
                Text(
                  _start == null
                      ? 'Select a time to see the price'
                      : 'Total: ${_total ?? '—'} so\'m',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: (_busy || _start == null) ? null : _book,
                  child: Text(_busy ? 'Booking…' : 'Reserve now'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  List<DateTime> _buildSlots(AvailabilityStation? s) {
    if (s == null) return [];
    final slots = <DateTime>[];
    for (final w in s.free) {
      var t = w.startsAt;
      while (!t.add(const Duration(minutes: 30)).isAfter(w.endsAt)) {
        slots.add(t.toLocal());
        t = t.add(const Duration(minutes: 30));
      }
    }
    return slots;
  }

  List<int> _durationOptions(AvailabilityStation? s) {
    if (s == null || _start == null) return _durations;
    final maxEnd = _maxEndForStart(s, _start!.toUtc());
    if (maxEnd == null) return const [30];
    final opts = _durations
        .where((d) => !_start!.toUtc().add(Duration(minutes: d)).isAfter(maxEnd))
        .toList();
    return opts.isEmpty ? const [30] : opts;
  }
}
