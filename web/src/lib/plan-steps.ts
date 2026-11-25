/** A plan step's state, as the plan structure marks it (`- [open] name: what it asks`). */
export type PlanStepState = 'open' | 'active' | 'closed' | 'dropped';

export interface PlanStep {
  state: PlanStepState;
  text: string;
}

export type PlanBlock = { kind: 'markdown'; text: string } | { kind: 'steps'; steps: PlanStep[] };

// The state-word markers clio-agent's plan structure names, plus Markdown task boxes.
const STEP = /^\s*(?:[-*+]|\d+[.)])\s+\[(open|active|closed|dropped|x| )\]\s*(.*)$/iu;
const CONTINUATION = /^\s+\S/u;

function stepState(marker: string): PlanStepState {
  const word = marker.toLowerCase();
  if (word === 'x') return 'closed';
  if (word === ' ') return 'open';
  return word as PlanStepState;
}

/**
 * The plan's Markdown split into prose and runs of marked steps, so the steps read as a
 * checklist and everything else (objective, approach, findings) stays Markdown.
 */
export function planBlocks(text: string): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  let prose: string[] = [];
  let steps: PlanStep[] = [];
  const flushProse = () => {
    if (prose.join('').trim()) blocks.push({ kind: 'markdown', text: prose.join('\n') });
    prose = [];
  };
  const flushSteps = () => {
    if (steps.length) blocks.push({ kind: 'steps', steps });
    steps = [];
  };
  for (const line of text.split(/\r?\n/u)) {
    const step = STEP.exec(line);
    if (step) {
      flushProse();
      steps.push({ state: stepState(step[1]!), text: step[2]!.trim() });
      continue;
    }
    if (steps.length && CONTINUATION.test(line)) {
      const last = steps[steps.length - 1]!;
      last.text = `${last.text} ${line.trim()}`;
      continue;
    }
    if (steps.length && !line.trim()) continue;
    flushSteps();
    prose.push(line);
  }
  flushSteps();
  flushProse();
  return blocks;
}
