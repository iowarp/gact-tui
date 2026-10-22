import { quoteSafe, type SeriesParallel } from './flow-diagram-source';
import type { FlowMember, FlowState, FlowStep, FlowTone } from './flow-run-presentation';

/**
 * A flow as a Pele `railroad-beta` grammar.
 *
 * - `sequence(...)`: steps that run one after another.
 * - `choice(...)`: steps that run side by side (the renderer labels each such
 *   group "parallel", since a railroad choice otherwise reads as either/or).
 * - `optional(...)`: a step an editor proposed that waits for approval.
 * - `oneOrMore(...)`: a step that ran more than once (a retry or a repair).
 * - `nonterminal("x")`: a step that runs another flow, drawn as its own rule
 *   below the main one.
 * - `terminal("x · state")`: an ordinary step, its state in words.
 *
 * Every drawn node gets a mark (its state and a tooltip) in drawing order, so
 * the renderer can colour each one; the state is always in the label too.
 */
export type RailroadExpr =
  | { kind: 'terminal'; label: string; mark: RailroadMark }
  | { kind: 'nonterminal'; rule: string; mark: RailroadMark }
  | { kind: 'sequence'; items: RailroadExpr[] }
  | { kind: 'parallel'; items: RailroadExpr[] }
  | { kind: 'optional'; item: RailroadExpr }
  | { kind: 'repeat'; item: RailroadExpr };

export interface RailroadMark {
  tone: FlowTone;
  /** The tooltip: the step, its state, and who runs it. */
  title: string;
}

export interface RailroadRule {
  name: string;
  /** The heading drawn above a sub-flow's rule; the main rule draws none. */
  heading?: string;
  expr: RailroadExpr;
}

export interface RailroadDiagram {
  source: string;
  /** One per drawn node (terminal or nonterminal), in the order Pele draws them. */
  marks: RailroadMark[];
  /** Node index ranges `[from, to)` of each parallel group, for its "parallel" label. */
  parallels: { from: number; to: number }[];
  /** Headings of the sub-flow rules, in rule order after the main rule. */
  headings: string[];
}

/** Serialize rules to `railroad-beta` and collect the marks in drawing order. */
export function railroadDiagram(rules: readonly RailroadRule[]): RailroadDiagram {
  const marks: RailroadMark[] = [];
  const parallels: { from: number; to: number }[] = [];
  const write = (expr: RailroadExpr): string => {
    switch (expr.kind) {
      case 'terminal':
        marks.push(expr.mark);
        return `terminal("${quoteSafe(expr.label)}")`;
      case 'nonterminal':
        marks.push(expr.mark);
        return `nonterminal("${expr.rule}")`;
      case 'sequence':
        return expr.items.length === 1
          ? write(expr.items[0]!)
          : `sequence(${expr.items.map(write).join(', ')})`;
      case 'parallel': {
        if (expr.items.length === 1) return write(expr.items[0]!);
        const from = marks.length;
        const body = expr.items.map(write).join(', ');
        parallels.push({ from, to: marks.length });
        return `choice(${body})`;
      }
      case 'optional':
        return `optional(${write(expr.item)})`;
      case 'repeat':
        return `oneOrMore(${write(expr.item)})`;
    }
  };
  const lines = rules.map((rule) => `  ${rule.name} = ${write(rule.expr)};`);
  return {
    source: ['railroad-beta', ...lines].join('\n'),
    marks,
    parallels,
    headings: rules.slice(1).map((rule) => rule.heading ?? rule.name),
  };
}

/** A railroad rule name: letters, digits and underscores, unique among `taken`. */
export function ruleName(id: string, taken: Set<string>): string {
  let base = id.replaceAll(/[^A-Za-z0-9_]/gu, '_') || 'step';
  if (!/^[A-Za-z_]/u.test(base)) base = `s_${base}`;
  let name = base;
  for (let index = 2; taken.has(name); index += 1) name = `${base}_${index}`;
  taken.add(name);
  return name;
}

/**
 * The plan as railroad rules: the main rule from its series-parallel shape,
 * then one rule per step that runs another flow, built from that flow's own
 * run when it is known (`subflows`), else from the step alone.
 */
export function planRailroadRules(
  name: string,
  steps: readonly FlowStep[],
  shape: SeriesParallel,
  subflows: ReadonlyMap<string, RailroadExpr> = new Map(),
): RailroadRule[] {
  const taken = new Set<string>();
  const main = ruleName(name, taken);
  const byId = new Map(steps.map((step) => [step.id, step]));
  const extra: RailroadRule[] = [];
  const build = (part: SeriesParallel): RailroadExpr => {
    if (part.kind === 'seq') return { kind: 'sequence', items: part.items.map(build) };
    if (part.kind === 'par') return { kind: 'parallel', items: part.items.map(build) };
    const step = byId.get(part.id)!;
    const attempts = step.attempts > 1 ? ` · ${step.attempts} attempts` : '';
    const mark = {
      tone: step.status.tone,
      title: `${step.id}: ${step.status.label}${attempts.replace(' · ', ', ')}. Runs ${step.targetLabel}.`,
    };
    let node: RailroadExpr;
    if (step.kind === 'flow') {
      const rule = ruleName(step.id, taken);
      node = { kind: 'nonterminal', rule, mark };
      extra.push({
        name: rule,
        heading: `${step.id}: the ${step.target} flow, ${step.status.word}`,
        expr: subflows.get(step.id) ?? {
          kind: 'terminal',
          label: `${step.target} · ${step.status.word}`,
          mark,
        },
      });
    } else {
      node = { kind: 'terminal', label: `${step.id} · ${step.status.word}${attempts}`, mark };
    }
    if (step.attempts > 1) node = { kind: 'repeat', item: node };
    return step.kind === 'proposal' ? { kind: 'optional', item: node } : node;
  };
  return [{ name: main, expr: build(shape) }, ...extra];
}

/**
 * A council or an arena: its members side by side, then the synthesis or the
 * judge. Also the sub-rule of a plan step that runs one.
 */
export function membersRailroadExpr(
  members: readonly FlowMember[],
  closing: { label: string; state: FlowState },
): RailroadExpr {
  const items: RailroadExpr[] = members.map((member) => {
    const word = member.chosen ? `${member.status.word}, chosen` : member.status.word;
    return {
      kind: 'terminal',
      label: `${member.label.toLowerCase()} · ${word}`,
      mark: {
        tone: member.status.tone,
        title: `${member.label}: ${member.status.label}${member.chosen ? ", the judge's choice" : ''}. Runs ${member.targetLabel}.`,
      },
    };
  });
  return {
    kind: 'sequence',
    items: [
      { kind: 'parallel', items },
      {
        kind: 'terminal',
        label: `${closing.label} · ${closing.state.word}`,
        mark: { tone: closing.state.tone, title: `The ${closing.label}: ${closing.state.word}.` },
      },
    ],
  };
}
