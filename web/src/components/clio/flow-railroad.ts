import { quoteSafe, type SeriesParallel } from './flow-diagram-source';
import type {
  FlowMember,
  FlowState,
  FlowStep,
  FlowTone,
  FlowVerdict,
} from './flow-run-presentation';

/**
 * A flow as a Pele `railroad-beta` grammar.
 *
 * - `sequence(...)`: steps that run one after another.
 * - `choice(...)`: steps that run side by side (the renderer labels each such
 *   group "parallel", since a railroad choice otherwise reads as either/or).
 * - `optional(...)`: a step an editor proposed that waits for approval.
 * - `oneOrMore(...)`: a step that ran more than once (a retry or a repair).
 * - a step that runs another flow is that flow's own track, inline, inside a
 *   box labelled with the step's name (`nonterminal("x")` until it starts).
 * - `terminal("x")`: an ordinary step.
 *
 * A node's label is only its name; its colour carries its state. Every drawn
 * node gets a mark in drawing order: its state, its name and state in words
 * (the tooltip and the accessible name), and what selecting it shows.
 */
export type RailroadExpr =
  | { kind: 'terminal'; label: string; mark: RailroadMark }
  | { kind: 'nonterminal'; label: string; mark: RailroadMark }
  | { kind: 'sequence'; items: RailroadExpr[] }
  | { kind: 'parallel'; items: RailroadExpr[] }
  | { kind: 'optional'; item: RailroadExpr }
  | { kind: 'repeat'; item: RailroadExpr }
  /** Another flow's track, boxed and labelled with the step that runs it. */
  | { kind: 'flow'; label: string; mark: RailroadMark; item: RailroadExpr };

export interface RailroadMark {
  tone: FlowTone;
  /** The tooltip and accessible name: the step, its state, and who runs it. */
  title: string;
  /** Unique among the diagram's marks; a nested flow's nodes carry its step's id first. */
  key: string;
  /** What selecting the node shows. */
  pick: FlowPick;
  /** The arena entry the judge chose. */
  chosen?: boolean;
}

/** A node the person selected: a workflow step, a council member or arena entry, or the closing step. */
export type FlowPick =
  | { kind: 'step'; step: FlowStep }
  | { kind: 'member'; member: FlowMember }
  | { kind: 'closing'; label: string; state: FlowState; flow: string; verdict: FlowVerdict };

/** A boxed flow inside the track: its step's mark and the range `[from, to)` of its nodes. */
export interface RailroadBox {
  label: string;
  mark: RailroadMark;
  from: number;
  to: number;
}

export interface RailroadDiagram {
  source: string;
  /** One per drawn node (terminal or nonterminal), in the order Pele draws them. */
  marks: RailroadMark[];
  /**
   * Node index ranges `[from, to)` of each parallel group with no boxed flow in it, and
   * how many branches it has, for its "N in parallel" label.
   */
  parallels: { from: number; to: number; count: number }[];
  /** The flows steps run, drawn inline, each boxed with its step's name. */
  boxes: RailroadBox[];
}

/** Serialize one rule to `railroad-beta` and collect the marks in drawing order. */
export function railroadDiagram(name: string, expr: RailroadExpr): RailroadDiagram {
  const marks: RailroadMark[] = [];
  const parallels: { from: number; to: number; count: number }[] = [];
  const boxes: RailroadBox[] = [];
  const write = (expr: RailroadExpr): string => {
    switch (expr.kind) {
      case 'terminal':
        marks.push(expr.mark);
        return `terminal("${quoteSafe(expr.label)}")`;
      case 'nonterminal':
        marks.push(expr.mark);
        return `nonterminal("${quoteSafe(expr.label)}")`;
      case 'sequence':
        return expr.items.length === 1
          ? write(expr.items[0]!)
          : `sequence(${expr.items.map(write).join(', ')})`;
      case 'parallel': {
        if (expr.items.length === 1) return write(expr.items[0]!);
        const from = marks.length;
        const body = expr.items.map(write).join(', ');
        // A branch that is a boxed flow carries its own name; the fork itself shows the rest.
        if (!expr.items.some(boxed)) parallels.push({ from, to: marks.length, count: expr.items.length });
        return `choice(${body})`;
      }
      case 'optional':
        return `optional(${write(expr.item)})`;
      case 'repeat':
        return `oneOrMore(${write(expr.item)})`;
      case 'flow': {
        const from = marks.length;
        const body = write(expr.item);
        boxes.push({ label: expr.label, mark: expr.mark, from, to: marks.length });
        return body;
      }
    }
  };
  const rule = `  ${ruleName(name)} = ${write(expr)};`;
  // A boxed flow's frame and name tab need more room between branches than Pele leaves.
  const room = boxes.length ? BOXED_CONFIG : [];
  return { source: [...room, 'railroad-beta', rule].join('\n'), marks, parallels, boxes };
}

const BOXED_CONFIG = ['---', 'config:', '  railroad:', '    verticalSeparation: 44', '---'];

function boxed(expr: RailroadExpr): boolean {
  switch (expr.kind) {
    case 'flow':
      return true;
    case 'sequence':
    case 'parallel':
      return expr.items.some(boxed);
    case 'optional':
    case 'repeat':
      return boxed(expr.item);
    default:
      return false;
  }
}

/** A railroad rule name: letters, digits and underscores. */
function ruleName(id: string): string {
  const base = id.replaceAll(/[^A-Za-z0-9_]/gu, '_') || 'flow';
  return /^[A-Za-z_]/u.test(base) ? base : `f_${base}`;
}

/**
 * The workflow as one railroad expression, from its series-parallel shape. A step
 * that runs another flow is that flow's track (`subflows`, by step id) when
 * the flow has started, else a nonterminal with the step's name.
 */
export function workflowRailroadExpr(
  steps: readonly FlowStep[],
  shape: SeriesParallel,
  subflows: ReadonlyMap<string, RailroadExpr> = new Map(),
): RailroadExpr {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const build = (part: SeriesParallel): RailroadExpr => {
    if (part.kind === 'seq') return { kind: 'sequence', items: part.items.map(build) };
    if (part.kind === 'par') return { kind: 'parallel', items: part.items.map(build) };
    const step = byId.get(part.id)!;
    const attempts = step.attempts > 1 ? `, ${step.attempts} attempts` : '';
    const mark: RailroadMark = {
      tone: step.status.tone,
      title: `${step.id}: ${step.status.label}${attempts}. Runs ${step.targetLabel}.`,
      key: step.id,
      pick: { kind: 'step', step },
    };
    const inner = step.kind === 'flow' ? subflows.get(step.id) : undefined;
    let node: RailroadExpr = inner
      ? { kind: 'flow', label: step.id, mark, item: prefixKeys(inner, `${step.id}/`) }
      : { kind: step.kind === 'flow' ? 'nonterminal' : 'terminal', label: step.id, mark };
    if (step.attempts > 1) node = { kind: 'repeat', item: node };
    return step.kind === 'proposal' ? { kind: 'optional', item: node } : node;
  };
  return build(shape);
}

function memberTerminal(member: FlowMember): RailroadExpr {
  return {
    kind: 'terminal',
    label: member.label.toLowerCase(),
    mark: {
      tone: member.status.tone,
      title: `${member.label}: ${member.status.label}${member.chosen ? ", the judge's choice" : ''}. Runs ${member.targetLabel}.`,
      key: member.key,
      pick: { kind: 'member', member },
      ...(member.chosen ? { chosen: true } : {}),
    },
  };
}

/**
 * A council or an arena: its members side by side, then the synthesis or the
 * judge. Also the railroad of a workflow step that runs one.
 */
export function membersRailroadExpr(
  members: readonly FlowMember[],
  closing: { label: string; state: FlowState },
  flow: string,
  verdict: FlowVerdict,
): RailroadExpr {
  return {
    kind: 'sequence',
    items: [
      { kind: 'parallel', items: members.map(memberTerminal) },
      {
        kind: 'terminal',
        label: closing.label,
        mark: {
          tone: closing.state.tone,
          title: `The ${closing.label}: ${closing.state.word}.`,
          key: 'closing',
          pick: { kind: 'closing', ...closing, flow, verdict },
        },
      },
    ],
  };
}

/**
 * Any other flow, drawn from the calls it made, as it made them: calls it started
 * together (one gather) side by side, and each batch after the one before. A flow
 * that loops shows each round; one still running shows the calls made so far.
 */
export function callsRailroadExpr(members: readonly FlowMember[]): RailroadExpr | undefined {
  const batches: FlowMember[][] = [];
  for (const member of members) {
    const last = batches.at(-1);
    if (member.together && last?.[0]?.together === member.together) last.push(member);
    else batches.push([member]);
  }
  const items = batches.map((batch): RailroadExpr =>
    batch.length > 1 ? { kind: 'parallel', items: batch.map(memberTerminal) } : memberTerminal(batch[0]!),
  );
  if (!items.length) return undefined;
  return items.length === 1 ? items[0] : { kind: 'sequence', items };
}

/** The same expression with every mark's key prefixed, so an inline flow's keys stay unique. */
function prefixKeys(expr: RailroadExpr, prefix: string): RailroadExpr {
  switch (expr.kind) {
    case 'terminal':
    case 'nonterminal':
      return { ...expr, mark: { ...expr.mark, key: `${prefix}${expr.mark.key}` } };
    case 'flow':
      return {
        ...expr,
        mark: { ...expr.mark, key: `${prefix}${expr.mark.key}` },
        item: prefixKeys(expr.item, prefix),
      };
    case 'sequence':
    case 'parallel':
      return { ...expr, items: expr.items.map((item) => prefixKeys(item, prefix)) };
    case 'optional':
    case 'repeat':
      return { ...expr, item: prefixKeys(expr.item, prefix) };
  }
}
