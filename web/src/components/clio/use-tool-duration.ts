import type { ToolInvocation } from '@clio/core/v3';
import { useEffect, useState } from 'react';

/** Prefer recorded execution time; derive it from timestamps only when available. */
export function toolDuration(tool: ToolInvocation | undefined, now: number): number | undefined {
  if (!tool) return undefined;
  const active = tool.state === 'running' || tool.state === 'pending';
  if (!active && Number.isFinite(tool.duration_ms) && tool.duration_ms! >= 0)
    return tool.duration_ms;
  const start = Date.parse(tool.started_at ?? '');
  const end = tool.completed_at ? Date.parse(tool.completed_at) : active ? now : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return end - start;
  return Number.isFinite(tool.duration_ms) && tool.duration_ms! >= 0 ? tool.duration_ms : undefined;
}

/** Tick only mounted active calls with a real start time, and stop at completion. */
export function useToolDuration(tool: ToolInvocation | undefined): number | undefined {
  const [now, setNow] = useState(Date.now);
  const ticking = Boolean(
    tool &&
      (tool.state === 'running' || tool.state === 'pending') &&
      !tool.completed_at &&
      Number.isFinite(Date.parse(tool.started_at ?? '')),
  );
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [ticking, tool?.id, tool?.started_at]);
  return toolDuration(tool, now);
}
