import { t } from '@lingui/core/macro';
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
  error: t`Error`,
  undefined_reference: t`Undefined reference`,
  undefined_citation: t`Undefined citation`,
  missing_file: t`Missing file`,
  missing_package: t`Missing package`,
  shell_escape_unsupported: t`Needs shell escape`,
  unsupported_bibliography_backend: t`Unsupported bibliography backend`,
  overfull_box: t`Overfull box`,
  font_warning: t`Font substitution`,
  warning: t`Warning`,
};

export function latexKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replaceAll('_', ' ');
}
