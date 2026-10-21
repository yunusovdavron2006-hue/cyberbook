/**
 * Optional AI provider abstraction for the analytics feature.
 *
 * The platform works without any external AI service: when no provider is
 * configured (the default) a deterministic heuristic summary is produced from
 * the computed metrics. When a provider IS configured, the metrics are sent to
 * an OpenAI-compatible chat endpoint; any failure falls back to the heuristic
 * so analytics never break the request. We never fabricate a provider result.
 */

export interface ClubMetrics {
  clubId: number;
  clubName: string;
  periodDays: number;
  from: string;
  to: string;
  bookings: number;
  completed: number;
  cancelled: number;
  revenue: number;
  occupancyPercent: number;
  cancellationRate: number;
  peakHours: { hour: number; count: number }[];
  topStations: { stationId: number; label: string; count: number; revenue: number }[];
  averageLeadTimeHours: number;
}

export interface InsightResult {
  provider: string;
  model: string | null;
  summary: string;
  recommendations: string[];
}

export interface AiProviderConfig {
  provider: string;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
}

/** Deterministic, always-available summary derived from metrics. */
export function heuristicInsight(metrics: ClubMetrics): InsightResult {
  const busiest = metrics.peakHours[0];
  const bestStation = metrics.topStations[0];
  const parts: string[] = [];
  parts.push(
    `In the last ${metrics.periodDays} days, ${metrics.clubName} had ${metrics.bookings} bookings ` +
      `(${metrics.completed} completed, ${metrics.cancelled} cancelled) worth ${metrics.revenue} so'm.`,
  );
  parts.push(`Average occupancy was ${metrics.occupancyPercent}%.`);
  if (busiest) parts.push(`The busiest hour was around ${String(busiest.hour).padStart(2, '0')}:00.`);
  if (bestStation) parts.push(`${bestStation.label} was the most booked station (${bestStation.count} bookings).`);

  const recommendations: string[] = [];
  if (metrics.cancellationRate > 0.2) {
    recommendations.push('Cancellation rate is high — consider deposit or reminder policies.');
  }
  if (metrics.occupancyPercent < 30) {
    recommendations.push('Occupancy is low — consider happy-hour promotions to fill quiet hours.');
  }
  if (busiest && busiest.count >= 3) {
    recommendations.push('Peak hours are busy — consider slightly higher pricing at peak demand.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Operations look healthy — keep current pricing and promotions.');
  }

  return { provider: 'heuristic', model: null, summary: parts.join(' '), recommendations };
}

export async function remoteInsight(
  config: AiProviderConfig,
  metrics: ClubMetrics,
): Promise<InsightResult> {
  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a business analyst for gaming clubs. Given JSON metrics, reply with a JSON object ' +
            '{"summary": string, "recommendations": string[]}. Be concise and factual; do not invent numbers.',
        },
        { role: 'user', content: JSON.stringify(metrics) },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`AI provider responded ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  const parsed = JSON.parse(content) as { summary?: string; recommendations?: string[] };
  return {
    provider: config.provider,
    model: config.model,
    summary: parsed.summary || heuristicInsight(metrics).summary,
    recommendations:
      Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
        ? parsed.recommendations
        : heuristicInsight(metrics).recommendations,
  };
}
