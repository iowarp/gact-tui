/** A plan step's state, as the plan structure marks it (`- [open] name: what it asks`). */
export type PlanStepState = 'open' | 'active' | 'closed' | 'dropped';

export interface PlanStep {
  state: PlanStepState;
  text: string;
}

export type PlanBlock = { kind: 'markdown'; text: string } | { kind: 'steps'; steps: PlanStep[] };

// clio-agent's plan structure names open/active/closed/dropped; agents also write the
// usual synonyms ([done], [in progress], [todo]) and Markdown task boxes.
const STATE_WORDS: Record<string, PlanStepState> = {
  open: 'open',
  todo: 'open',
  pending: 'open',
  ' ': 'open',
  active: 'active',
  'in progress': 'active',
  'in-progress': 'active',
  in_progress: 'active',
  doing: 'active',
  closed: 'closed',
  done: 'closed',
  completed: 'closed',
  complete: 'closed',
  x: 'closed',
  dropped: 'dropped',
  abandoned: 'dropped',
  skipped: 'dropped',
  cancelled: 'dropped',
  canceled: 'dropped',
};
const STEP = /^\s*(?:[-*+]|\d+[.)])\s+\[([^\]\n]{1,12})\]\s*(.*)$/u;
const CONTINUATION = /^\s+\S/u;

function stepState(marker: string): PlanStepState | undefined {
  return STATE_WORDS[marker === ' ' ? ' ' : marker.trim().toLowerCase()];
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
    const state = step ? stepState(step[1]!) : undefined;
    if (step && state) {
      flushProse();
      steps.push({ state, text: step[2]!.trim() });
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
