import type { ArtifactTableQueryRequest } from '@clio/core/v3';

export type ArchiveRow = Record<string, unknown>;

/** Arrow queries place nulls last regardless of sort direction. */
export function compareCells(a: unknown, b: unknown, desc = false): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return ((a as string | number) < (b as string | number) ? -1 : 1) * (desc ? -1 : 1);
}

function evenRows(rows: ArchiveRow[], keep: number): ArchiveRow[] {
  if (rows.length <= keep) return rows;
  if (keep === 1) return [rows[0]];
  // numpy.round uses ties-to-even, including the half-way index.
  return Array.from({ length: keep }, (_, i) => {
    const index = (i * (rows.length - 1)) / (keep - 1);
    const low = Math.floor(index);
    const rounded = index - low === 0.5 ? low + (low % 2) : Math.round(index);
    return rows[rounded];
  });
}

function epoch(value: unknown): number {
  if (value == null) return NaN;
  if (typeof value === 'number' || typeof value === 'boolean') return Number(value);
  if (typeof value !== 'string') return NaN;
  // Naive timestamps follow the server's UTC epoch convention.
  const iso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/u.test(value)
    ? `${value}Z`
    : value;
  return Date.parse(iso) / 1000;
}

function lttb(rows: ArchiveRow[], x: string, y: string, keep: number): ArchiveRow[] {
  if (rows.length <= keep) return rows;
  if (keep === 1) return [rows[0]];
  if (keep === 2) return [rows[0], rows.at(-1)!];
  const n = rows.length;
  const every = (n - 2) / (keep - 2);
  const chosen = [rows[0]];
  let anchor = 0;
  for (let bucket = 0; bucket < keep - 2; bucket++) {
    let avgStart = Math.floor((bucket + 1) * every) + 1;
    let avgEnd = Math.min(Math.floor((bucket + 2) * every) + 1, n);
    if (avgStart >= avgEnd) {
      avgStart = n - 1;
      avgEnd = n;
    }
    const average = rows.slice(avgStart, avgEnd);
    const avgX = average.reduce((sum, row) => sum + epoch(row[x]), 0) / average.length;
    const avgY = average.reduce((sum, row) => sum + Number(row[y]), 0) / average.length;
    const start = Math.floor(bucket * every) + 1;
    const end = Math.max(start + 1, Math.min(Math.floor((bucket + 1) * every) + 1, n - 1));
    const ax = epoch(rows[anchor][x]);
    const ay = Number(rows[anchor][y]);
    let area = -1;
    for (let i = start; i < end; i++) {
      const candidate = Math.abs(
        (ax - avgX) * (Number(rows[i][y]) - ay) - (ax - epoch(rows[i][x])) * (avgY - ay),
      );
      if (candidate > area) {
        area = candidate;
        anchor = i;
      }
    }
    chosen.push(rows[anchor]);
  }
  chosen.push(rows.at(-1)!);
  return chosen;
}

/** Match the server's stride/LTTB and per-entity response-limit rules. */
export function downsampleArchiveRows(
  rows: ArchiveRow[],
  query: ArtifactTableQueryRequest,
): { rows: ArchiveRow[]; info: Record<string, unknown> & { mode: string } } {
  const spec = query.downsample;
  const mode = spec?.mode ?? 'none';
  const info: Record<string, unknown> & { mode: string } = { mode };
  if (!spec) {
    if (query.offset === undefined && !query.sort?.length && rows.length > query.limit)
      return {
        rows: evenRows(rows, query.limit),
        info: {
          mode: 'stride',
          reason: 'over_limit',
          inputRows: rows.length,
          outputRows: query.limit,
        },
      };
    return { rows, info };
  }
  info.inputRows = rows.length;
  if (mode === 'none') return { rows, info: { ...info, outputRows: rows.length } };
  if (mode === 'stride' && !spec.entityColumn) {
    rows = evenRows(rows, query.limit);
    return { rows, info: { ...info, target: query.limit, outputRows: rows.length } };
  }
  const entity = spec.entityColumn;
  if (mode === 'per_entity_lttb' && (!spec.x || !spec.y))
    throw new Error('LTTB requires x and y columns.');
  rows.sort(
    (a, b) =>
      (entity ? compareCells(a[entity], b[entity]) : 0) ||
      (mode === 'per_entity_lttb' ? compareCells(epoch(a[spec.x!]), epoch(b[spec.x!])) : 0),
  );
  const groups = new Map<unknown, ArchiveRow[]>();
  rows.forEach((row) => {
    const key = entity ? row[entity] : '';
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  let dropped = 0;
  let reduced = [...groups.values()].map((group) => {
    if (mode === 'stride') return evenRows(group, spec.maxPerEntity ?? 500);
    const usable = group.filter(
      (row) =>
        Number.isFinite(epoch(row[spec.x!])) &&
        row[spec.y!] != null &&
        (typeof row[spec.y!] === 'number' || typeof row[spec.y!] === 'boolean') &&
        Number.isFinite(Number(row[spec.y!])),
    );
    dropped += group.length - usable.length;
    return lttb(usable, spec.x!, spec.y!, spec.maxPerEntity ?? 500);
  });
  if (
    entity &&
    query.offset === undefined &&
    reduced.reduce((n, group) => n + group.length, 0) > query.limit
  ) {
    const cap = Math.max(1, Math.floor(query.limit / groups.size));
    reduced = reduced.map((group) => evenRows(group, cap));
    Object.assign(info, { reducedForResponseLimit: true, perEntityCapAfterReduction: cap });
  }
  rows = reduced.flat();
  Object.assign(info, {
    entityColumn: entity ?? null,
    entities: groups.size,
    maxPerEntity: spec.maxPerEntity ?? 500,
    outputRows: rows.length,
  });
  if (mode === 'per_entity_lttb')
    Object.assign(info, { x: spec.x, y: spec.y, droppedNullRows: dropped });
  return { rows, info };
}
