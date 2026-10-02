/**
 * Formats a chart/map/table zone into the labelled reference block
 * "Reference this" attaches to the composer (#1533 item 5): the surface and
 * component, the dataset, the active filters (the agent's own base query plus
 * this viewer's own), the selected zone in plain words, a short row preview,
 * and the machine-readable filter JSON an agent can re-query exactly.
 *
 * One formatter shared by the chart, map, and table components, so the block
 * reads the same way regardless of which surface produced it (mirrors
 * `data-query-filters.ts`'s shared filter-merge for the same reason).
 */

export interface DataZoneReferenceInput {
  /** e.g. "Depth vs. magnitude chart", "Epicenters map", "Earthquake table". */
  componentLabel: string;
  /** The referenced dataset, as named to the reader: an artifact id or a title. */
  datasetLabel: string;
  /** Every active filter, agent base first, reader-facing (`describeQueryFilter`). */
  filters: readonly string[];
  /** The zone in plain words, e.g. "depth 2–8 and magnitude ≥ 5.5 — 23 of 270 rows". */
  zoneDescription: string;
  /** Preview columns, in display order (kept short — a handful, not every column). */
  previewColumns: readonly string[];
  /** The first ~5 rows of the zone, already narrowed by the caller. */
  previewRows: readonly Record<string, unknown>[];
  /** Use a readable field list for a single wide record instead of a cramped table. */
  previewLayout?: 'table' | 'fields';
  /** The exact query (`dataUri` + filter, at minimum) an agent can re-run for this zone. */
  query: unknown;
}

export interface DataZoneReference {
  /** Short label for the composer card. */
  title: string;
  /**
   * One plain-language line for the composer chip itself, e.g. "172 of 500
   * rows — depth 6.762–14.85" or "the whole view (500 rows)" — never
   * markdown, so the chip can show it verbatim with no flattened syntax.
   */
  summary: string;
  /** The full reference block, ready to quote into the composer. */
  markdown: string;
  /** The same machine-readable current view embedded in markdown. */
  query?: unknown;
}

function previewTable(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  if (!columns.length || !rows.length) return '';
  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return String(value).replaceAll('|', '\\|');
  };
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => cell(row[column])).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function previewFields(columns: readonly string[], row: Record<string, unknown>): string {
  return columns
    .filter((column) => row[column] !== null && row[column] !== undefined && String(row[column]).trim() !== '')
    .map((column) => `- **${column}**: ${String(row[column]).replaceAll(/\r?\n/g, ' ')}`)
    .join('\n');
}

/** Builds the reference block "Reference this" attaches for one chart/map/table zone. */
export function buildZoneReference(input: DataZoneReferenceInput): DataZoneReference {
  const sections: string[] = [`**${input.componentLabel}** — ${input.datasetLabel}`];
  if (input.filters.length) sections.push(`Filters: ${input.filters.join('; ')}.`);
  sections.push(`Zone: ${input.zoneDescription}.`);
  const table = input.previewLayout === 'fields' && input.previewRows.length === 1
    ? previewFields(input.previewColumns, input.previewRows[0]!)
    : previewTable(input.previewColumns, input.previewRows);
  if (table) sections.push(table);
  sections.push(['```json', JSON.stringify(input.query, null, 2), '```'].join('\n'));
  return {
    markdown: sections.join('\n\n'),
    query: input.query,
    summary: input.zoneDescription,
    title: input.componentLabel,
  };
}
