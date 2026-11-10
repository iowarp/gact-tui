import type { BundledLanguage } from 'shiki';
import { languageForPath } from './code-language';

/** One output a notebook cell keeps, reduced to what the reader can show. */
export type NotebookOutput =
  | { kind: 'stream'; stream: 'stdout' | 'stderr'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string }
  | { kind: 'markdown'; markdown: string }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'error'; name: string; value: string; traceback: string };

export type NotebookCell =
  | { kind: 'markdown'; source: string }
  | { kind: 'raw'; source: string }
  | { kind: 'code'; source: string; count: number | null; outputs: NotebookOutput[] };

export type Notebook = {
  cells: NotebookCell[];
  language: BundledLanguage;
  /** The kernel's display name, e.g. "Python 3 (ipykernel)". */
  kernel?: string;
};

export type NotebookRead = { ok: true; notebook: Notebook } | { ok: false; reason: string };

type Json = Record<string, unknown>;

const KERNEL_LANGUAGES: Record<string, BundledLanguage> = {
  python: 'python',
  python3: 'python',
  julia: 'julia',
  r: 'r',
  javascript: 'javascript',
  typescript: 'typescript',
  scala: 'scala',
  rust: 'rust',
  go: 'go',
  sql: 'sql',
  bash: 'shellscript',
  sh: 'shellscript',
  'c++': 'cpp',
  cpp: 'cpp',
  c: 'c',
  java: 'java',
  ruby: 'ruby',
};

// oxlint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/gu;

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** nbformat stores multiline strings as a string or a list of lines. */
function multiline(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((part) => typeof part === 'string').join('');
  return '';
}

/** Terminal text without colour codes, and a progress line's last redraw only. */
export function plainTerminalText(text: string): string {
  return text
    .replace(ANSI, '')
    .split('\n')
    .map((line) => line.split('\r').filter(Boolean).at(-1) ?? '')
    .join('\n');
}

function notebookLanguage(metadata: Json): BundledLanguage {
  const info = isRecord(metadata['language_info']) ? metadata['language_info'] : {};
  const spec = isRecord(metadata['kernelspec']) ? metadata['kernelspec'] : {};
  for (const name of [info['name'], spec['language']]) {
    if (typeof name !== 'string') continue;
    const known = KERNEL_LANGUAGES[name.toLowerCase()];
    if (known) return known;
  }
  const extension = info['file_extension'];
  if (typeof extension === 'string') {
    const language = languageForPath(`cell${extension}`);
    if (String(language) !== 'text') return language;
  }
  // Jupyter's own default kernel.
  return 'python';
}

/** Jupyter's display order: the richest representation the reader can show safely. */
function richOutput(data: Json, cell: number): NotebookOutput | undefined {
  const plain = plainTerminalText(multiline(data['text/plain']));
  // The sanitizer drops a <style> tag but keeps its rules as text (pandas' scoped CSS).
  const html = multiline(data['text/html'])
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/giu, '')
    .trim();
  // Script-driven output (widgets, interactive plots) is empty once sanitized.
  if (html && !/<script\b/iu.test(html)) return { kind: 'html', html };
  const markdown = multiline(data['text/markdown']);
  if (markdown) return { kind: 'markdown', markdown };
  const alt = plain && !plain.startsWith('<') ? plain : `Figure from cell ${cell}`;
  const svg = multiline(data['image/svg+xml']);
  if (svg)
    return {
      kind: 'image',
      alt,
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    };
  for (const type of IMAGE_TYPES) {
    const bytes = multiline(data[type]).replace(/\s+/gu, '');
    if (bytes) return { kind: 'image', alt, src: `data:${type};base64,${bytes}` };
  }
  if (plain) return { kind: 'text', text: plain };
  if (data['application/json'] !== undefined)
    return { kind: 'text', text: JSON.stringify(data['application/json'], null, 2) };
  return undefined;
}

function cellOutputs(value: unknown, cell: number): NotebookOutput[] {
  const outputs: NotebookOutput[] = [];
  for (const output of Array.isArray(value) ? value : []) {
    if (!isRecord(output)) continue;
    const type = output['output_type'];
    if (type === 'stream') {
      const stream = output['name'] === 'stderr' ? 'stderr' : 'stdout';
      const text = plainTerminalText(multiline(output['text']));
      const previous = outputs.at(-1);
      // Jupyter writes one stream in many chunks; the reader sees one block.
      if (previous?.kind === 'stream' && previous.stream === stream) previous.text += text;
      else if (text) outputs.push({ kind: 'stream', stream, text });
    } else if (type === 'execute_result' || type === 'display_data') {
      const rich = isRecord(output['data']) ? richOutput(output['data'], cell) : undefined;
      if (rich) outputs.push(rich);
    } else if (type === 'error') {
      const traceback = Array.isArray(output['traceback'])
        ? output['traceback'].filter((line) => typeof line === 'string').join('\n')
        : '';
      outputs.push({
        kind: 'error',
        name: typeof output['ename'] === 'string' ? output['ename'] : 'Error',
        value: typeof output['evalue'] === 'string' ? output['evalue'] : '',
        traceback: plainTerminalText(traceback).trimEnd(),
      });
    }
  }
  for (const output of outputs) if (output.kind === 'stream') output.text = output.text.trimEnd();
  return outputs;
}

/** Markdown cells reference pasted images as `attachment:name`; inline them. */
function withAttachments(source: string, attachments: unknown): string {
  if (!isRecord(attachments)) return source;
  return source.replace(/attachment:([^\s)"']+)/gu, (match, name: string) => {
    const bundle = attachments[decodeURIComponent(name)];
    if (!isRecord(bundle)) return match;
    for (const [type, bytes] of Object.entries(bundle))
      if (type.startsWith('image/') && typeof bytes === 'string')
        return `data:${type};base64,${bytes.replace(/\s+/gu, '')}`;
    return match;
  });
}

/** Read an nbformat 4 notebook. Anything else says why, so the reader can point to Source. */
export function readNotebook(content: string): NotebookRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, reason: 'The file isn’t complete JSON.' };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'The file isn’t a notebook object.' };
  if (!Array.isArray(parsed['cells']))
    return {
      ok: false,
      reason: Array.isArray(parsed['worksheets'])
        ? 'It’s a version 3 notebook. Only version 4 notebooks are shown as cells.'
        : 'The file has no cells.',
    };
  const metadata = isRecord(parsed['metadata']) ? parsed['metadata'] : {};
  const spec = isRecord(metadata['kernelspec']) ? metadata['kernelspec'] : {};
  const cells: NotebookCell[] = [];
  for (const cell of parsed['cells']) {
    if (!isRecord(cell)) continue;
    const source = multiline(cell['source']);
    if (cell['cell_type'] === 'markdown')
      cells.push({ kind: 'markdown', source: withAttachments(source, cell['attachments']) });
    else if (cell['cell_type'] === 'code') {
      const count = cell['execution_count'];
      cells.push({
        kind: 'code',
        source,
        count: typeof count === 'number' ? count : null,
        outputs: cellOutputs(cell['outputs'], cells.length + 1),
      });
    } else cells.push({ kind: 'raw', source });
  }
  return {
    ok: true,
    notebook: {
      cells,
      language: notebookLanguage(metadata),
      kernel: typeof spec['display_name'] === 'string' ? spec['display_name'] : undefined,
    },
  };
}
