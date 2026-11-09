/** What a plan contains, read from its markdown: steps, a recommendation, risks. */
export interface PlanSections {
  steps: number;
  risks: number;
  hasRecommendation: boolean;
  hasRisks: boolean;
}

const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u;
// Top-level items only; nested items sit two or more spaces in.
const ORDERED = /^ ?\d+[.)]\s+\S/u;
const BULLET = /^ ?[-*+]\s+\S/u;
const FENCE = /^\s{0,3}(```|~~~)/u;

export function planSections(markdown: string | undefined): PlanSections {
  let heading = '';
  let fenced = false;
  let stepsHeading = false;
  let steps = 0;
  let numbered = 0;
  let risks = 0;
  let hasRecommendation = false;
  let hasRisks = false;
  for (const line of (markdown ?? '').split(/\r?\n/u)) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const title = HEADING.exec(line)?.[1]?.toLowerCase();
    if (title !== undefined) {
      heading = title;
      if (/\brisks?\b/u.test(title)) hasRisks = true;
      else if (/\bsteps?\b/u.test(title)) stepsHeading = true;
      if (/recommend/u.test(title)) hasRecommendation = true;
      continue;
    }
    const ordered = ORDERED.test(line);
    if (!ordered && !BULLET.test(line)) continue;
    if (/\brisks?\b/u.test(heading)) risks += 1;
    else if (/\bsteps?\b/u.test(heading)) steps += 1;
    else if (ordered && !/recommend/u.test(heading)) numbered += 1;
  }
  return { steps: stepsHeading ? steps : numbered, risks, hasRecommendation, hasRisks };
}

function count(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/** "4 steps, execution recommendation, 2 risks": only what the plan actually has. */
export function planOutline(
  markdown: string | undefined,
  guidance: { recommended_mode?: string; risk_notes?: string } = {},
): string {
  const sections = planSections(markdown);
  const parts = [
    sections.steps ? count(sections.steps, 'step') : '',
    sections.hasRecommendation || guidance.recommended_mode ? 'execution recommendation' : '',
    sections.risks
      ? count(sections.risks, 'risk')
      : sections.hasRisks || guidance.risk_notes?.trim()
        ? 'risk notes'
        : '',
  ].filter(Boolean);
  const text = parts.join(', ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}
