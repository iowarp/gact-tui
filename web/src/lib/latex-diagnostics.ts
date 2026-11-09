/** How the LaTeX workspace names a build problem's kind, and which kinds only warn. */

/**
 * Kinds that only warn; every other kind makes the build fail. An undefined citation or
 * reference is a LaTeX warning: the PDF still builds, with "?" in its place.
 */
export const LATEX_WARNING_KINDS = new Set([
  'overfull_box',
  'font_warning',
  'warning',
  'undefined_citation',
  'undefined_reference',
]);

const KIND_LABELS: Record<string, string> = {
  error: 'Error',
  undefined_reference: 'Undefined reference',
  undefined_citation: 'Undefined citation',
  missing_file: 'Missing file',
  missing_package: 'Missing package',
  shell_escape_unsupported: 'Needs shell escape',
  unsupported_bibliography_backend: 'Unsupported bibliography backend',
  overfull_box: 'Overfull box',
  font_warning: 'Font substitution',
  warning: 'Warning',
};

export function latexKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replaceAll('_', ' ');
}
