import { plural } from '@lingui/core/macro';
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/u;

export interface DiffRow {
  kind: 'addition' | 'deletion' | 'context' | 'hunk';
  /** The file line: the new file's, or the old file's for a removed line. */
  line?: number;
  text: string;
}

/** A patch file's frame fact: the file it changes (or how many) and its added and removed lines. */
export function patchSummary(unified: string): string | undefined {
  const files = new Set<string>();
  let added = 0;
  let removed = 0;
  for (const text of unified.split(/\r?\n/u)) {
    const target = /^\+\+\+ (?:b\/)?(.+?)(?:\t.*)?$/u.exec(text)?.[1];
    if (target) {
      if (target !== '/dev/null') files.add(target.split('/').at(-1) ?? target);
    } else if (text.startsWith('---')) continue;
    else if (text.startsWith('+')) added += 1;
    else if (text.startsWith('-')) removed += 1;
  }
  if (!files.size && !added && !removed) return undefined;
  const what =
    files.size === 1
      ? [...files][0]
      : files.size
        ? plural(files.size, { one: '# file', other: '# files' })
        : undefined;
  return [what, `+${added.toLocaleString()} −${removed.toLocaleString()}`]
    .filter(Boolean)
    .join(' ');
}

/** A unified diff as file lines; patch headers become hunk separators. */
export function diffRows(unified: string): DiffRow[] {
  const source = unified.replace(/\r?\n$/u, '').split(/\r?\n/u);
  if (!source.some((text) => HUNK.test(text)))
    return source.map((text, index) => ({ kind: 'context', line: index + 1, text }));
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const text of source) {
    const hunk = HUNK.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      rows.push({ kind: 'hunk', text: hunk[3] ?? '' });
    } else if (/^diff /u.test(text)) {
      // The next file's headers in a multi-file patch are not changed lines.
      inHunk = false;
    } else if (!inHunk || text.startsWith('\\')) {
      continue;
    } else if (text.startsWith('+')) {
      rows.push({ kind: 'addition', line: newLine++, text: text.slice(1) });
    } else if (text.startsWith('-')) {
      rows.push({ kind: 'deletion', line: oldLine++, text: text.slice(1) });
    } else {
      rows.push({ kind: 'context', line: newLine++, text: text.slice(1) });
      oldLine += 1;
    }
  }
  return rows;
}
