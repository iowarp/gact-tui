import type { AttentionPromptLine } from '@clio/core/v3';

export type PromptMapRow =
  | { kind: 'line'; line: AttentionPromptLine; domainChanged: boolean }
  | { kind: 'gap'; from: number; count: number };

/** All lines, or only heated ones with each cold run collapsed to one gap row. */
export function visibleRows(
  lines: readonly AttentionPromptLine[],
  onlyHeated: boolean,
): PromptMapRow[] {
  const rows: PromptMapRow[] = [];
  let previousDomain: string | null | undefined;
  let gapFrom = -1;
  for (const line of lines) {
    const heated = line.levels.some((level) => level > 0);
    if (onlyHeated && !heated) {
      if (gapFrom < 0) gapFrom = line.index;
      continue;
    }
    if (gapFrom >= 0) {
      rows.push({ kind: 'gap', from: gapFrom, count: line.index - gapFrom });
      gapFrom = -1;
    }
    rows.push({ kind: 'line', line, domainChanged: line.domain !== previousDomain });
    previousDomain = line.domain;
  }
  if (gapFrom >= 0 && lines.length)
    rows.push({ kind: 'gap', from: gapFrom, count: lines.length - gapFrom });
  return rows;
}
