import { useSharedNow } from '@/lib/shared-clock';

/** Show only recorded phase timing; old passages without timing remain unknown. */
export function useReasoningDuration(
  startedAt?: string,
  durationMs?: number,
  streaming = false,
): number | undefined {
  const start = Date.parse(startedAt ?? '');
  const ticking = streaming && Number.isFinite(start);
  const now = useSharedNow(ticking);
  if (!streaming && durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0)
    return durationMs;
  return ticking && now >= start ? now - start : undefined;
}
