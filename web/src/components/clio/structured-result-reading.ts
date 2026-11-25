import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { plural, ph, t } from '@lingui/core/macro';
import { asRecord, toolResultRecord } from './tool-result-shared';

/**
 * The agent's fallback for a structured MCP result is a key-path outline
 * ("Staged › sha256: …", "Site › address: null"). This reads the same value as
 * what the call found: envelope and empty fields drop, records read by their
 * name, and known result schemas say it in a sentence. The exact value stays in
 * Technical details.
 */
export const STRUCTURED_RESULT_BLOCK = 'structured-result';

type Value = unknown;
type Row = Record<string, unknown>;

// Envelope, bookkeeping and integrity fields: true, but not what the call found.
const TECHNICAL_KEY =
  /^(?:_.*|\$schema|schema|schema_version|ok|op|operation|sha256|digest|checksum|etag|cursor|next_cursor|sources)$/u;
const NAME_KEYS = ['name', 'title', 'label', 'id'] as const;
const MAX_LINES = 16;
const MAX_ITEMS = 8;

function isEmpty(value: Value): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.every(isEmpty);
  const row = asRecord(value);
  return row
    ? Object.entries(row).every(([key, item]) => TECHNICAL_KEY.test(key) || isEmpty(item))
    : false;
}

function isScalar(value: Value): value is string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|>~<]/gu, (char) => `\\${char}`);
}

/** An identifier reads as code; prose reads as prose. */
function literal(text: string): string {
  const value = text.replace(/\s+/gu, ' ').trim();
  const shown = value.length > 240 ? `${value.slice(0, 240)}…` : value;
  return /^[\w.:/@+-]+$/u.test(shown) && /[._/:@-]|\d/u.test(shown) && !shown.includes('`')
    ? `\`${shown}\``
    : escapeMarkdown(shown);
}

function scalarText(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? t`yes` : t`no`;
  return literal(String(value));
}

function heading(key: string): string {
  const words = key.replaceAll('_', ' ').trim();
  return escapeMarkdown(words.charAt(0).toUpperCase() + words.slice(1));
}

function fieldName(key: string): string {
  return escapeMarkdown(key.replaceAll('_', ' ').trim());
}

function recordName(row: Row): { key: string; text: string } | undefined {
  for (const key of NAME_KEYS) {
    const value = row[key];
    if (isScalar(value) && String(value).trim()) return { key, text: String(value) };
  }
  return undefined;
}

function scalarList(values: Value[]): string {
  const shown = values.filter(isScalar).slice(0, MAX_ITEMS).map(scalarText);
  const rest = values.length - shown.length;
  return rest > 0
    ? t`${ph({ list: shown.join(', ') })} and ${ph({ count: rest })} more`
    : shown.join(', ');
}

/** "clio_jarvis.gromacs 0.1.0: kind package, size 4096". */
function recordPhrase(row: Row, depth = 0): string {
  const name = recordName(row);
  const version = isScalar(row.version) ? ` ${literal(String(row.version))}` : '';
  const facts = Object.entries(row)
    .filter(
      ([key, value]) =>
        key !== name?.key &&
        key !== 'version' &&
        !(name?.key !== 'id' && key === 'id' && name) &&
        !TECHNICAL_KEY.test(key) &&
        !isEmpty(value),
    )
    .flatMap(([key, value]) => {
      if (isScalar(value)) return [`${fieldName(key)} ${scalarText(value)}`];
      if (Array.isArray(value) && value.every(isScalar))
        return [`${fieldName(key)} ${scalarList(value)}`];
      const nested = asRecord(value);
      if (nested && depth < 1) {
        const inner = recordName(nested);
        return inner ? [`${fieldName(key)} ${literal(inner.text)}`] : [];
      }
      return [];
    })
    .slice(0, 5);
  const named = name ? `**${escapeMarkdown(name.text)}**${version}` : '';
  if (!named) return facts.join(', ');
  return facts.length ? `${named}: ${facts.join(', ')}` : named;
}

/** What any structured result found, one plain line per field that says something. */
function genericReading(row: Row): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (TECHNICAL_KEY.test(key) || isEmpty(value)) continue;
    if (isScalar(value)) {
      lines.push(`- ${heading(key)}: ${scalarText(value)}`);
      continue;
    }
    if (Array.isArray(value)) {
      const items = value.filter((item) => !isEmpty(item));
      if (items.every(isScalar)) {
        lines.push(`- ${heading(key)}: ${scalarList(items)}`);
        continue;
      }
      const records = items.map(asRecord).filter((item): item is Row => Boolean(item));
      lines.push(`- ${heading(key)} (${items.length}):`);
      for (const item of records.slice(0, MAX_ITEMS)) lines.push(`  - ${recordPhrase(item)}`);
      if (items.length > MAX_ITEMS)
        lines.push(`  - ${t`${ph({ count: items.length - MAX_ITEMS })} more`}`);
      continue;
    }
    const nested = asRecord(value);
    if (nested) {
      const phrase = recordPhrase(nested);
      if (phrase) lines.push(`- ${heading(key)}: ${phrase}`);
    }
  }
  return lines;
}

function packagePhrase(value: Value): string | undefined {
  const row = asRecord(value);
  const name = row ? recordName(row) : undefined;
  if (!row || !name) return undefined;
  const version = isScalar(row.version) ? ` ${literal(String(row.version))}` : '';
  return `${literal(name.text)}${version}`;
}

function phraseList(values: Value[]): string {
  const phrases = values.map(packagePhrase).filter((item): item is string => Boolean(item));
  const shown = phrases.slice(0, MAX_ITEMS).join(', ');
  const rest = phrases.length - MAX_ITEMS;
  return rest > 0 ? t`${ph({ list: shown })} and ${ph({ count: rest })} more` : shown;
}

/** relay.packages.v1: what was staged or removed, and what is staged now. */
function relayPackagesReading(row: Row): string[] {
  const lines: string[] = [];
  const staged = packagePhrase(row.staged);
  if (staged) lines.push(t`Staged ${ph({ package: staged })}.`);
  const removed = Array.isArray(row.removed) ? row.removed : [];
  if (removed.length) lines.push(t`Removed ${ph({ packages: phraseList(removed) })}.`);
  if (Array.isArray(row.packages)) {
    const count = row.packages.length;
    lines.push(
      count
        ? plural(count, {
            one: `# package is staged: ${ph({ list: phraseList(row.packages) })}`,
            other: `# packages are staged: ${ph({ list: phraseList(row.packages) })}`,
          })
        : t`No packages are staged.`,
    );
  }
  if (Array.isArray(row.available)) {
    const unstaged = row.available.filter((item) => asRecord(item)?.staged !== true);
    lines.push(
      unstaged.length
        ? plural(unstaged.length, {
            one: `# more package can be staged: ${ph({ list: phraseList(unstaged) })}`,
            other: `# more packages can be staged: ${ph({ list: phraseList(unstaged) })}`,
          })
        : t`Every available package is staged.`,
    );
  }
  return lines;
}

const SCHEMA_READERS: Record<string, (row: Row) => string[]> = {
  'relay.packages.v1': relayPackagesReading,
};

/** Rebuild the value from the agent's outline when the recorded result was capped. */
export function outlineValue(markdown: string): Row | undefined {
  const root: Row = {};
  let found = false;
  const unescape = (text: string) => text.replace(/\\(.)/gu, '$1');
  for (const line of markdown.split('\n')) {
    const match = /^- \*\*(.+?):\*\* (.*)$/u.exec(line);
    if (!match) continue;
    const path = unescape(match[1]).split(' › ');
    const raw = unescape(match[2]).trim();
    if (/^\d+ (?:items|fields)$/u.test(raw)) continue;
    const value: Value =
      raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw;
    let node: Row = root;
    path.forEach((segment, index) => {
      // The outline capitalizes the first key and spells underscores as spaces.
      const key = (index === 0 ? segment.charAt(0).toLowerCase() + segment.slice(1) : segment)
        .trim()
        .replaceAll(' ', '_');
      if (index === path.length - 1) {
        node[key] = value;
        return;
      }
      const next = asRecord(node[key]) ?? {};
      node[key] = next;
      node = next;
    });
    found = true;
  }
  if (!found) return undefined;
  // Numbered children ("Sites › 1 › name") are list items.
  const lists = (value: Value): Value => {
    const row = asRecord(value);
    if (!row) return value;
    const keys = Object.keys(row);
    if (keys.length && keys.every((key) => /^\d+$/u.test(key)))
      return keys.sort((a, b) => Number(a) - Number(b)).map((key) => lists(row[key]));
    return Object.fromEntries(keys.map((key) => [key, lists(row[key])]));
  };
  return asRecord(lists(root));
}

/** The plain reading of a structured result, or undefined when nothing reads. */
export function structuredResultReading(
  tool: ToolInvocation,
  block: ToolPresentationBlock,
): string | undefined {
  const recorded = toolResultRecord(tool.output);
  const complete = recorded && !recorded.truncated && !Array.isArray(recorded.content);
  const row = complete ? recorded : outlineValue(block.text ?? '');
  if (!row) return undefined;
  const schema = typeof row.schema === 'string' ? row.schema : undefined;
  const reader = (schema && SCHEMA_READERS[schema]) || genericReading;
  let lines = reader(row);
  if (!lines.length && reader !== genericReading) lines = genericReading(row);
  const more = lines.length > MAX_LINES || /Technical details\.\s*$/u.test(block.text ?? '');
  lines = lines.slice(0, MAX_LINES);
  if (!lines.length)
    return t`The call returned no values to show. Technical details has the exact result.`;
  const sentences = lines[0] && !lines[0].startsWith('- ');
  const body = lines.join(sentences ? '\n\n' : '\n');
  return more ? `${body}\n\n${t`More values are in Technical details.`}` : body;
}
