/**
 * View-model / pure logic for Diff Pane: state shaping and helpers, no DOM. Key export `FileDiffStatusTone`.
 */
import type { FileDiff, FileDiffEditMode, FileDiffStatus } from '@clio/core';

/** Presentation tone for a file_diff status badge (drives the CLIO chip color). */
export type FileDiffStatusTone = 'pending' | 'ok' | 'err' | 'muted';

export interface FileDiffStatusBadge {
  status: FileDiffStatus;
  label: string;
  tone: FileDiffStatusTone;
}

const FILE_DIFF_STATUS_BADGES: Record<FileDiffStatus, { label: string; tone: FileDiffStatusTone }> = {
  pending: { label: 'pending', tone: 'pending' },
  applied: { label: 'applied', tone: 'ok' },
  rejected: { label: 'rejected', tone: 'muted' },
  apply_failed: { label: 'apply failed', tone: 'err' },
};

/**
 * Resolve the v0.2 `status` field into a renderable badge. Returns null when the
 * backend omitted it (v0.1 fixtures), so callers render nothing rather than a
 * misleading default. Mirrors the TUI's file_diff status line (applied / rejected
 * / apply-failed; see render_part_tool_diff.go).
 */
export function fileDiffStatusBadge(part: FileDiff): FileDiffStatusBadge | null {
  const status = part.status;
  if (!status) return null;
  const meta = FILE_DIFF_STATUS_BADGES[status];
  if (!meta) return null;
  return { status, label: meta.label, tone: meta.tone };
}

const FILE_DIFF_EDIT_MODE_LABELS: Record<FileDiffEditMode, string> = {
  diff: 'diff',
  whole: 'whole-file',
  patch: 'patch',
};

/** v0.2 `edit_mode` → short human label, or null when absent. */
export function fileDiffEditModeLabel(part: FileDiff): string | null {
  const mode = part.edit_mode;
  if (!mode) return null;
  return FILE_DIFF_EDIT_MODE_LABELS[mode] ?? mode;
}

export interface FileDiffLineCounts {
  adds: number;
  dels: number;
  /** True when the counts came from the wire `lines_added`/`lines_removed`. */
  fromWire: boolean;
}

/**
 * Authoritative add/remove counts for a file_diff. Prefers the v0.2 wire fields
 * (`lines_added`/`lines_removed`) when present — those are the backend's own
 * tally — and otherwise derives them from the parsed unified diff / before+after.
 */
export function fileDiffLineCounts(part: FileDiff, derived?: { adds: number; dels: number }): FileDiffLineCounts {
  const wireAdds = part.lines_added;
  const wireDels = part.lines_removed;
  if (typeof wireAdds === 'number' || typeof wireDels === 'number') {
    return { adds: wireAdds ?? 0, dels: wireDels ?? 0, fromWire: true };
  }
  return { adds: derived?.adds ?? 0, dels: derived?.dels ?? 0, fromWire: false };
}

export interface DiffLineInfo {
  /** Raw line including the +/-/space prefix. */
  text: string;
  sign: 'add' | 'del' | 'ctx';
  /** Line number in the OLD file (null for added lines). */
  oldNo: number | null;
  /** Line number in the NEW file (null for deleted lines). */
  newNo: number | null;
}

export interface Hunk {
  header: string;
  lines: DiffLineInfo[];
  adds: number;
  dels: number;
}

export function compactDiffPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (normalized.length <= 64) return normalized;

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) return normalized;

  const workspaceIndex = parts.lastIndexOf('workspace');
  if (workspaceIndex >= 0 && workspaceIndex < parts.length - 1) {
    const workspaceTail = parts.slice(workspaceIndex).join('/');
    if (workspaceTail.length <= 64) return workspaceTail;
  }

  const tail = parts.slice(-2).join('/');
  if (tail.length <= 60) return `.../${tail}`;

  const file = parts.at(-1) ?? normalized;
  return file.length <= 60 ? `.../${file}` : `.../${file.slice(0, 57)}...`;
}

/** Map a file path to an hljs language id (per-line highlight). */
export function langForPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    rb: 'ruby',
    sh: 'bash',
    bash: 'bash',
    css: 'css',
    html: 'xml',
    xml: 'xml',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    kt: 'kotlin',
    swift: 'swift',
    toml: 'ini',
    ini: 'ini',
  };
  return map[ext] ?? null;
}

export function parseHunks(unified: string): Hunk[] {
  const lines = unified.split(/\r?\n/);
  const out: Hunk[] = [];
  let current: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const ln of lines) {
    if (ln.startsWith('@@')) {
      if (current) out.push(current);
      current = { header: ln, lines: [], adds: 0, dels: 0 };
      // `@@ -oldStart,oldCount +newStart,newCount @@` -> seed the gutter.
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(ln);
      oldNo = m ? parseInt(m[1]!, 10) : 1;
      newNo = m ? parseInt(m[2]!, 10) : 1;
      continue;
    }
    if (!current) continue;
    if (ln.startsWith('+++') || ln.startsWith('---')) continue;
    if (ln.startsWith('+')) {
      current.lines.push({ text: ln, sign: 'add', oldNo: null, newNo: newNo++ });
      current.adds++;
    } else if (ln.startsWith('-')) {
      current.lines.push({ text: ln, sign: 'del', oldNo: oldNo++, newNo: null });
      current.dels++;
    } else {
      current.lines.push({ text: ln, sign: 'ctx', oldNo: oldNo++, newNo: newNo++ });
    }
  }
  if (current) out.push(current);
  return out;
}
