import type { FlowMember, FlowState, FlowStep, FlowVerdict } from './flow-run-presentation';
import { formatDuration } from '@/lib/format';

/**
 * The shape of a workflow and the agentflow graph for a workflow the railroad
 * cannot draw. `seriesParallel` finds the nested sequence/parallel structure
 * the railroad (flow-railroad.ts) draws; a workflow without one is drawn as a graph,
 * each step's state in its label and a class per state.
 */

/** A series-parallel shape over step ids. */
export type SeriesParallel =
  | { kind: 'step'; id: string }
  | { kind: 'seq'; items: SeriesParallel[] }
  | { kind: 'par'; items: SeriesParallel[] };

/** Above this many steps the strip stops being a one-line summary; the graph draws it. */
const MAX_RAILROAD_STEPS = 24;

/**
 * Decompose a dependency graph into series and parallel parts, or `null` when
 * it has another shape (an N-shaped dependency, a cycle, too many steps).
 */
export function seriesParallel(
  steps: readonly { id: string; after: readonly string[] }[],
): SeriesParallel | null {
  if (!steps.length || steps.length > MAX_RAILROAD_STEPS) return null;
  const ids = steps.map((step) => step.id);
  const known = new Set(ids);
  const parents = new Map(
    steps.map((step) => [step.id, step.after.filter((id) => known.has(id))] as const),
  );
  const ancestors = ancestorSets(ids, parents);
  if (!ancestors) return null;
  // Every ancestor precedes its descendants: sorting by ancestor count is a topological order.
  const order = [...ids].sort((a, b) => ancestors.get(a)!.size - ancestors.get(b)!.size);
  const related = (a: string, b: string) => ancestors.get(a)!.has(b) || ancestors.get(b)!.has(a);

  const decompose = (set: readonly string[]): SeriesParallel | null => {
    if (set.length === 1) return { kind: 'step', id: set[0]! };
    const components = connectedComponents(set, related);
    if (components.length > 1) {
      const items = components.map(decompose);
      return items.every(Boolean) ? { kind: 'par', items: items as SeriesParallel[] } : null;
    }
    const ordered = order.filter((id) => set.includes(id));
    for (let cut = 1; cut < ordered.length; cut += 1) {
      const head = ordered.slice(0, cut);
      const tail = ordered.slice(cut);
      if (!tail.every((b) => head.every((a) => ancestors.get(b)!.has(a)))) continue;
      const first = decompose(head);
      const rest = decompose(tail);
      if (!first || !rest) return null;
      return {
        kind: 'seq',
        items: [first, rest].flatMap((part) => (part.kind === 'seq' ? part.items : [part])),
      };
    }
    return null;
  };
  return decompose(ids);
}

/** A step's diagram word: its state, with the time it took or has been running. */
export function stepWord(state: FlowState, elapsedMs?: number): string {
  return elapsedMs === undefined
    ? state.word
    : `${state.word} ${formatDuration(elapsedMs, 'compact')}`;
}

/** The full workflow graph: every step with its state, dependencies reduced to the direct ones. */
export function workflowAgentflowSource(
  steps: readonly FlowStep[],
  elapsed: ReadonlyMap<string, number>,
): string {
  const ids = new Map(steps.map((step, index) => [step.id, `s${index}`]));
  const lines = ['agentflow-beta LR'];
  for (const step of steps) {
    const second = [
      stepWord(step.status, elapsed.get(step.id)),
      step.targetLabel === 'this agent' ? '' : step.targetLabel,
    ]
      .filter(Boolean)
      .join(' · ');
    const third = step.addedBy && step.kind !== 'proposal' ? `added by ${step.addedBy}` : '';
    const label = [step.id, second, third].filter(Boolean).map(quoteSafe).join('\\n');
    lines.push(`  ${ids.get(step.id)}${shape(step.kind, label)}:::st-${step.status.tone}`);
    if (step.addedBy) lines.push(`  class ${ids.get(step.id)} st-added`);
  }
  const parents = new Map(
    steps.map((step) => [step.id, step.after.filter((id) => ids.has(id))] as const),
  );
  for (const step of steps) {
    for (const parent of directParents(step.id, parents)) {
      // Agentflow draws a reference edge dashed: a proposal waits on these steps but has not joined the workflow.
      const arrow = step.kind === 'proposal' ? '-.-' : '-->';
      lines.push(`  ${ids.get(parent)} ${arrow} ${ids.get(step.id)}`);
    }
  }
  return lines.join('\n');
}

/** The closing step of a council or arena: synthesis or judge, with its state in words. */
export function closingStep(
  flow: string,
  runStatus: string,
  members: readonly FlowMember[],
  verdict: FlowVerdict,
): { label: string; state: FlowState } {
  const label = flow === 'arena' ? 'judge' : 'synthesis';
  if (runStatus === 'completed') {
    const word =
      flow === 'arena' && verdict.winner !== undefined ? `picked entry ${verdict.winner}` : 'done';
    return { label, state: { value: 'completed', label: 'Completed', word, tone: 'done' } };
  }
  if (runStatus !== 'running')
    return {
      label,
      state: { value: 'cancelled', label: 'Did not run', word: 'did not run', tone: 'cancelled' },
    };
  const answered = members.length > 0 && members.every((member) => member.status.tone === 'done');
  return answered
    ? { label, state: { value: 'running', label: 'Running', word: 'running', tone: 'running' } }
    : { label, state: { value: 'queued', label: 'Waiting', word: 'waiting', tone: 'waiting' } };
}

function shape(kind: FlowStep['kind'], label: string): string {
  if (kind === 'flow') return `{{"${label}"}}`;
  if (kind === 'editor') return `[["${label}"]]`;
  return `["${label}"]`;
}

/** Text Pele reads inside a quoted label: no quotes, no escapes, no line breaks of its own. */
export function quoteSafe(text: string): string {
  return text.replaceAll(/["\\]/gu, "'").replaceAll(/\s+/gu, ' ').trim();
}

function ancestorSets(
  ids: readonly string[],
  parents: ReadonlyMap<string, readonly string[]>,
): Map<string, Set<string>> | null {
  const result = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  const visit = (id: string): Set<string> | null => {
    const done = result.get(id);
    if (done) return done;
    if (visiting.has(id)) return null;
    visiting.add(id);
    const set = new Set<string>();
    for (const parent of parents.get(id) ?? []) {
      const above = visit(parent);
      if (!above) return null;
      set.add(parent);
      above.forEach((ancestor) => set.add(ancestor));
    }
    visiting.delete(id);
    result.set(id, set);
    return set;
  };
  return ids.every((id) => visit(id)) ? result : null;
}

/** The parents of `id` that no other parent already depends on (a transitive reduction). */
function directParents(id: string, parents: ReadonlyMap<string, readonly string[]>): string[] {
  const own = parents.get(id) ?? [];
  const reachable = (from: string, target: string, seen = new Set<string>()): boolean => {
    for (const parent of parents.get(from) ?? []) {
      if (parent === target) return true;
      if (seen.has(parent)) continue;
      seen.add(parent);
      if (reachable(parent, target, seen)) return true;
    }
    return false;
  };
  return own.filter(
    (candidate) => !own.some((other) => other !== candidate && reachable(other, candidate)),
  );
}

function connectedComponents(
  set: readonly string[],
  related: (a: string, b: string) => boolean,
): string[][] {
  const left = new Set(set);
  const components: string[][] = [];
  for (const start of set) {
    if (!left.has(start)) continue;
    left.delete(start);
    const component = [start];
    for (let index = 0; index < component.length; index += 1) {
      for (const other of [...left]) {
        if (related(component[index]!, other)) {
          left.delete(other);
          component.push(other);
        }
      }
    }
    components.push(component);
  }
  return components;
}
