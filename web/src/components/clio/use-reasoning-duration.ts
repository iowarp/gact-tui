import { useEffect, useState } from 'react';

/** Show only recorded phase timing; old passages without timing remain unknown. */
export function useReasoningDuration(
  startedAt?: string,
  durationMs?: number,
  streaming = false,
): number | undefined {
  const [now, setNow] = useState(Date.now);
  const start = Date.parse(startedAt ?? '');
  const ticking = streaming && Number.isFinite(start);
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking, startedAt]);
  if (!streaming && durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0)
    return durationMs;
  return ticking && now >= start ? now - start : undefined;
}
