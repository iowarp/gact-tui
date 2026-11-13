/** A Markdown file's leading `---` block, read as flat facts, and the prose after it. */
export interface FrontmatterDocument {
  /** Keys in file order; lists read as comma-separated text. */
  meta: [key: string, value: string][];
  body: string;
}

const BLOCK = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/u;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  )
    return trimmed.slice(1, -1);
  return trimmed;
}

/**
 * Reads the flat front matter skills and agent files use (`name:`,
 * `description:`, `allowed-tools: [a, b]` or an indented `- a` list, folded
 * `>`/`|` text). Nested maps read as their raw lines; nothing is evaluated.
 */
export function splitFrontmatter(text: string): FrontmatterDocument {
  const match = BLOCK.exec(text);
  if (!match) return { meta: [], body: text };
  const meta: [string, string][] = [];
  let current: { key: string; parts: string[]; list: boolean } | undefined;
  const flush = () => {
    if (!current) return;
    const value = current.list
      ? current.parts.join(', ')
      : current.parts.join(' ').replace(/\s+/gu, ' ');
    meta.push([current.key, value.trim()]);
    current = undefined;
  };
  for (const line of match[1].split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const entry = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/u.exec(line);
    if (entry && !/^\s/u.test(line)) {
      flush();
      const raw = (entry[2] ?? '').trim();
      if (raw.startsWith('[') && raw.endsWith(']')) {
        const items = raw.slice(1, -1).split(',').map(unquote).filter(Boolean);
        current = { key: entry[1], parts: items, list: true };
      } else if (raw === '>' || raw === '|' || raw === '>-' || raw === '|-' || raw === '') {
        current = { key: entry[1], parts: [], list: false };
      } else {
        current = { key: entry[1], parts: [unquote(raw)], list: false };
      }
      continue;
    }
    if (!current) continue;
    const item = /^\s*-\s+(.*)$/u.exec(line);
    if (item) {
      current.list = true;
      current.parts.push(unquote(item[1]));
    } else current.parts.push(line.trim());
  }
  flush();
  return { meta, body: text.slice(match[0].length).replace(/^\s+/u, '') };
}
