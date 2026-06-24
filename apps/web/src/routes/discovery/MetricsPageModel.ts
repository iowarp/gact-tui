/**
 * View-model / pure logic for Metrics Page: state shaping and helpers, no DOM. Key export `latencyEntries`.
 */
export function latencyEntries(
  latencies: Record<string, unknown> | undefined,
): Array<[string, unknown]> {
  return Object.entries(latencies ?? {}).filter(([, value]) => value != null);
}

export function formatLatencyValue(value: unknown): string {
  if (typeof value === 'number') return `${Math.round(value)}ms`;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value) {
    const record = value as Record<string, unknown>;
    if (typeof record['p50_ms'] === 'number') return `p50 ${formatMs(record['p50_ms'])}`;
    if (typeof record['avg_ms'] === 'number') return `avg ${formatMs(record['avg_ms'])}`;
    if (typeof record['mean_ms'] === 'number') return `mean ${formatMs(record['mean_ms'])}`;
    if (typeof record['last_ms'] === 'number') return `last ${formatMs(record['last_ms'])}`;
    if (typeof record['count'] === 'number') return `${Math.round(record['count'])} samples`;
  }
  return 'reported';
}

export function formatLatencyDetail(value: unknown): string {
  if (typeof value !== 'object' || !value) return '';
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record['count'] === 'number') parts.push(`${Math.round(record['count'])} samples`);
  if (typeof record['p95_ms'] === 'number') parts.push(`p95 ${formatMs(record['p95_ms'])}`);
  if (typeof record['max_ms'] === 'number') parts.push(`max ${formatMs(record['max_ms'])}`);
  return parts.join(' · ');
}

export function formatMs(value: number): string {
  if (value >= 100) return `${Math.round(value)}ms`;
  if (value >= 10) return `${Math.round(value * 10) / 10}ms`;
  return `${Math.round(value * 100) / 100}ms`;
}

/**
 * Semantic tint for a session-status numeral: a non-zero error/failed count
 * is the error tint, waiting/blocked is warning, running/active is success.
 * Zero stays neutral so a healthy board doesn't shout.
 */
export function statusValueClass(status: string, value: number): string {
  if (value === 0) return '';
  const s = status.toLowerCase();
  if (/(error|fail|crash|denied)/.test(s)) return 'dp__stat-value--err';
  if (/(wait|block|pending|paused)/.test(s)) return 'dp__stat-value--warn';
  if (/(run|active|ok|ready|done|complete)/.test(s)) return 'dp__stat-value--ok';
  return '';
}

export function humanUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
