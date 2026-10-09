export interface SessionSectionDemand {
  height: number;
  collapsed: boolean;
}

/** Fit two independent sections, lending unused space to the larger inventory. */
export function sessionSectionHeights(
  available: number,
  data: SessionSectionDemand | undefined,
  work: SessionSectionDemand | undefined,
  gap = 12,
): { data?: number; work?: number } {
  const height = Math.max(0, available);
  if (!data) return work ? { work: work.collapsed ? Math.min(height, work.height) : height } : {};
  if (!work) return { data: data.collapsed ? Math.min(height, data.height) : height };
  const total = Math.max(0, height - gap);
  if (data.height + work.height <= total) return { data: data.height, work: work.height };
  const half = total / 2;
  if (data.height < half) return { data: data.height, work: total - data.height };
  if (work.height < half) return { data: total - work.height, work: work.height };
  return { data: half, work: half };
}
