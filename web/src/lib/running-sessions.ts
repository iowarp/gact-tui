import type { QueryClient } from '@tanstack/react-query';
import { isSessionRunning } from '@/lib/session-state';

const SESSION_READS = ['sessions', 'session-pages', 'session-directory'] as const;

function collectRunning(value: unknown, running: Set<string>, depth: number): void {
  if (depth > 6 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectRunning(item, running, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string' && typeof record.state === 'string') {
    if (isSessionRunning(record.state as Parameters<typeof isSessionRunning>[0])) {
      running.add(record.id);
    }
    return;
  }
  for (const key of ['sessions', 'pages', 'items']) {
    if (key in record) collectRunning(record[key], running, depth + 1);
  }
}

/** Conversations the loaded session reads show as queued or running. */
export function countRunningSessions(queryClient: QueryClient): number {
  const running = new Set<string>();
  for (const namespace of SESSION_READS) {
    for (const [, data] of queryClient.getQueriesData({ queryKey: [namespace] })) {
      collectRunning(data, running, 0);
    }
  }
  return running.size;
}
