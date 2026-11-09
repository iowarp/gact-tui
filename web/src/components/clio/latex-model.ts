import { CodeXmlIcon, Columns2Icon, EyeIcon } from 'lucide-react';
import type { LatexOutlineNode, LatexReport } from '@clio/core/v3';
import { LATEX_WARNING_KINDS, latexKindLabel } from '@/lib/latex-diagnostics';
import type { FileMode } from './file-mode-controls';

/** A place in the paper's sources: a file and, when known, its line. */
export interface LatexPlace {
  file: string;
  line?: number;
}

/** One build problem: a failing or warning diagnostic, or a venue check that did not pass. */
export interface LatexProblem {
  severity: 'error' | 'warning';
  /** What happened, as the list shows it. */
  title: string;
  /** The longer explanation, on hover. */
  detail: string;
  file: string;
  line?: number;
}

/** A sectioning entry of the outline, numbered as the paper numbers it. */
export interface LatexOutlineRow {
  node: LatexOutlineNode;
  number: string;
  depth: number;
}

const SECTIONING = new Set([
  'part',
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
]);

/** The outline's sections and subsections, depth-first, numbered "2", "2.1", … */
export function latexOutlineRows(nodes: readonly LatexOutlineNode[]): LatexOutlineRow[] {
  const rows: LatexOutlineRow[] = [];
  const visit = (list: readonly LatexOutlineNode[] | undefined, prefix: string, depth: number) => {
    let index = 0;
    for (const node of list ?? []) {
      if (!SECTIONING.has(node.kind)) continue;
      index += 1;
      const number = prefix ? `${prefix}.${index}` : String(index);
      rows.push({ node, number, depth });
      visit(node.children, number, depth + 1);
    }
  };
  visit(nodes, '', 0);
  return rows;
}

/** The build's problems: failing diagnostics and failed checks are errors, the rest warnings. */
export function latexProblems(report: LatexReport): LatexProblem[] {
  const build = report.build;
  return [
    ...build.diagnostics.map(
      (item): LatexProblem => ({
        severity: LATEX_WARNING_KINDS.has(item.kind) ? 'warning' : 'error',
        title: item.message || latexKindLabel(item.kind),
        detail: `${latexKindLabel(item.kind)}: ${item.message}`,
        file: item.file,
        line: item.line || undefined,
      }),
    ),
    ...(build.venue?.checks ?? [])
      .filter((check) => check.status !== 'passed')
      .map(
        (check): LatexProblem => ({
          severity: check.status === 'failed' ? 'error' : 'warning',
          title: check.rule,
          detail: check.message || check.rule,
          file: check.file,
          line: check.line || undefined,
        }),
      ),
  ];
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** What the LaTeX tab shows: the PDF (Render), the .tex (Source), or both side by side. */
export type LatexView = 'pdf' | 'source' | 'both';

const RENDER: FileMode = { value: 'pdf', label: 'Render', title: 'Render (PDF)', icon: EyeIcon };
const SOURCE: FileMode = {
  value: 'source',
  label: 'Source',
  title: 'Source (.tex)',
  icon: CodeXmlIcon,
};
const BOTH: FileMode = { value: 'both', label: 'Side by side', icon: Columns2Icon };

/** The modes; side by side only where both panes fit. */
export function latexModes(wide: boolean): FileMode[] {
  return wide ? [RENDER, SOURCE, BOTH] : [RENDER, SOURCE];
}

/** "built 2m ago": when the shown build finished ("failed 2m ago" when it stopped). */
export function builtAgo(at: number, now: number, verb = 'built'): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return `${verb} just now`;
  if (minutes < 60) return `${verb} ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${verb} ${hours}h ago` : `${verb} ${Math.floor(hours / 24)}d ago`;
}
