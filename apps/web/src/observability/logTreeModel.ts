/**
 * The timeline log's branch-tree model (viz rebuild, 2026-08).
 *
 * Owner direction: the depth rail should read like a git branch tree — a
 * distinct colour per branch (agent), with fork and merge elbows at the spawn
 * and return rows.
 *
 * The thing that stopped it reading that way was not the elbows (those already
 * existed) but the COLUMN rule: a rail was drawn per ancestor DEPTH, so an open
 * child's line vanished on every row main logged, and two concurrent siblings —
 * both at depth 1 — collided on one column, exactly the "fanout branches
 * overlap" complaint applied to the log.
 *
 * So a column here is allocated to an AGENT, not to a depth: main holds column
 * 0 for the whole session, each open child takes the first free column and
 * keeps it until it returns, and every occupied column draws a continuous rail
 * on every row. A row's own marker sits on its agent's column.
 *
 * Nothing is derived beyond layout. A column's occupant is the real agent
 * identity the row already carries (`ObsTimelineRow.agent`, threaded from the
 * agent-task run label in build.ts); colours come from the SAME `branchColor`
 * the gantt uses, so one agent is one colour across the whole layer. Rows that
 * carry no agent fact (fixtures older than the field) fall back to depth-as-
 * column, which reproduces the previous behaviour exactly.
 */
import { branchColor, MAIN_BRANCH, type BranchColorResolver } from './ganttModel';
import type { ObsTimelineRow } from './types';

export interface LogRail {
  /** Rail column index — 0 is main, held for the whole session. */
  column: number;
  /** The agent occupying this column at this row. */
  branch: string;
  color: string;
}

export interface LogRowTree {
  /** One rail per OCCUPIED column at this row, ascending — an open branch's
   *  line is continuous through rows belonging to other branches. */
  rails: LogRail[];
  /** The fork (`open`) or merge (`close`) elbow this row draws, if any, in the
   *  CHILD's colour: the elbow belongs to the branch it creates or retires. */
  elbow?: {
    edge: 'open' | 'close';
    /** Leftmost column the elbow touches — the parent's. Positions it. */
    column: number;
    /** How many columns it spans to reach the child (>= 1). */
    span: number;
    branch: string;
    color: string;
  };
  /** The column this row's own marker sits on. */
  nodeColumn: number;
  nodeBranch: string;
  nodeColor: string;
}

/**
 * The branch a spawn row's child belongs to. The delegation event's actor names
 * it (`agent_id`), but the CHILD's own rows carry the agent-task run label, and
 * the two can spell one agent differently — which would draw the fork elbow in
 * a different colour from the rail it opens. Looking ahead to the child's own
 * first row settles it. Branches that already hold a column are skipped, so a
 * concurrent sibling's rows cannot be mistaken for this spawn's child.
 */
function childBranchAt(
  rows: ObsTimelineRow[],
  index: number,
  parentDepth: number,
  taken: ReadonlySet<string>,
): string {
  for (let i = index + 1; i < rows.length; i += 1) {
    const row = rows[i]!;
    const depth = row.depth ?? 0;
    if (row.branch === 'close' && depth <= parentDepth) break;
    if (depth > parentDepth && row.agent && !taken.has(row.agent)) return row.agent;
  }
  return rows[index]!.actor || `depth-${parentDepth + 1}`;
}

export function buildLogTree(
  rows: ObsTimelineRow[],
  colorOf: BranchColorResolver = branchColor,
): LogRowTree[] {
  /** column -> the agent holding it. */
  const occupied = new Map<number, string>([[0, MAIN_BRANCH]]);
  /** agent -> the column it holds. */
  const columnOf = new Map<string, number>([[MAIN_BRANCH, 0]]);

  const firstFreeColumn = (): number => {
    for (let column = 1; ; column += 1) {
      if (!occupied.has(column)) return column;
    }
  };
  const release = (column: number) => {
    const branch = occupied.get(column);
    if (branch !== undefined) {
      occupied.delete(column);
      if (columnOf.get(branch) === column) columnOf.delete(branch);
    }
  };

  return rows.map((row, index) => {
    const depth = row.depth ?? 0;
    const agent = row.agent;

    // This row's own column: its agent's, if that agent already holds one.
    // Otherwise depth doubles as the column — the pre-existing behaviour, and
    // the only honest guess for a row that never names its agent.
    let column = agent !== undefined ? columnOf.get(agent) : undefined;
    if (column === undefined) {
      column = depth;
      for (let i = 0; i <= column; i += 1) {
        if (!occupied.has(i)) occupied.set(i, i === 0 ? MAIN_BRANCH : `depth-${i}`);
      }
      if (agent !== undefined) {
        // A column reused by a DIFFERENT agent must not keep the previous
        // occupant's identity (or its colour).
        release(column);
        occupied.set(column, agent);
        columnOf.set(agent, column);
      }
    }

    let elbow: LogRowTree['elbow'];

    if (row.branch === 'close') {
      // Pop the returning child BEFORE the rails are read: on a return row the
      // elbow is the branch's last mark, not a rail alongside it.
      const named = row.actor && columnOf.has(row.actor) ? columnOf.get(row.actor)! : undefined;
      const innermost = [...occupied.keys()].filter((c) => c > column).sort((a, b) => b - a)[0];
      const childColumn = named ?? innermost ?? column + 1;
      const childBranch = occupied.get(childColumn) ?? row.actor ?? `depth-${childColumn}`;
      release(childColumn);
      elbow = {
        edge: 'close',
        column,
        span: Math.max(1, childColumn - column),
        branch: childBranch,
        color: colorOf(childBranch),
      };
    }

    const rails: LogRail[] = [...occupied.entries()]
      .sort(([a], [b]) => a - b)
      .map(([col, branch]) => ({ column: col, branch, color: colorOf(branch) }));

    if (row.branch === 'open') {
      // Allocate AFTER the rails are read: the row that creates a branch draws
      // the elbow, not yet a rail — the branch's line starts here.
      const childBranch = childBranchAt(rows, index, depth, new Set(columnOf.keys()));
      const childColumn = columnOf.get(childBranch) ?? firstFreeColumn();
      occupied.set(childColumn, childBranch);
      columnOf.set(childBranch, childColumn);
      elbow = {
        edge: 'open',
        column,
        span: Math.max(1, childColumn - column),
        branch: childBranch,
        color: colorOf(childBranch),
      };
    }

    const nodeBranch = occupied.get(column) ?? agent ?? MAIN_BRANCH;
    return {
      rails,
      ...(elbow ? { elbow } : {}),
      nodeColumn: column,
      nodeBranch,
      nodeColor: colorOf(nodeBranch),
    };
  });
}
