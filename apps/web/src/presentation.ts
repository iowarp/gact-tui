/**
 * Top-level presentation layer: turns raw tool results/records into the
 * structured rows and artifacts the transcript and inspector render.
 */
import {
  humanizeKey,
  isRecord,
  parseLeadingJson,
  shortScalar,
} from './presentationUtils.js';
import {
  addArtifact,
  addFirst,
  coordinateScope,
  datasetRows,
  evidenceCounts,
  genericRows,
  recordRows,
  resultTitle,
  shellRows,
} from './presentationRows.js';

export interface StructuredResultPresentation {
  title: string;
  rows: Array<{ label: string; value: string }>;
  raw: string;
}

export function summarizeToolResultPresentation(
  toolName: string | undefined,
  rawText: string,
): StructuredResultPresentation | null {
  const raw = rawText.trim();
  if (!raw) return null;
  const parsed = parseLeadingJson(raw);
  if (!parsed || !isRecord(parsed.value)) return null;
  const result = parsed.value;
  const rows: Array<{ label: string; value: string }> = [];

  const error = isRecord(result.error) ? result.error : null;
  if (error) {
    addFirst(rows, 'code', error, ['code', 'type', 'error']);
    addFirst(rows, 'message', error, ['message', 'error']);
    addFirst(rows, 'next action', error, ['next_action', 'recovery']);
    addFirst(rows, 'path', error, ['path', 'filepath', 'file']);
    return rows.length
      ? { title: 'error result', rows, raw: parsed.raw }
      : null;
  }

  addFirst(rows, 'status', result, ['status', 'state']);
  if (isRecord(result._meta)) addFirst(rows, 'status', result._meta, ['status', 'state']);

  const shell = shellRows(result);
  if (shell.length) {
    return { title: 'command result', rows: [...rows, ...shell], raw: parsed.raw };
  }

  const datasets = datasetRows(result);
  if (datasets.length) {
    return { title: 'catalog result', rows: [...rows, ...datasets], raw: parsed.raw };
  }

  const records = recordRows(result);
  if (records.length) {
    rows.push(...records);
    addArtifact(rows, result);
    return { title: 'records result', rows, raw: parsed.raw };
  }

  addFirst(rows, 'scope', result, ['region', 'region_name', 'name', 'label', 'title']);
  const location = coordinateScope(result);
  if (location) rows.push({ label: 'location', value: location });
  const counts = evidenceCounts(result);
  if (counts) rows.push({ label: 'counts', value: counts });
  addFirst(rows, 'summary', result, ['summary', 'message', 'description']);
  addArtifact(rows, result);

  if (!rows.length) {
    const generic = genericRows(result);
    if (!generic.length) return null;
    rows.push(...generic);
  }
  return {
    title: resultTitle(toolName, result),
    rows,
    raw: parsed.raw,
  };
}

export function toolInputRows(input: Record<string, unknown> | undefined): Array<{ label: string; value: string }> {
  if (!input) return [];
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 8)
    .map(([key, value]) => ({ label: humanizeKey(key), value: shortScalar(value) }));
}
