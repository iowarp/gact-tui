import type { Message, ScienceBranch, ScienceEntry, ScienceStudy } from '@clio/core/v3';

/**
 * What the Science log tab reads from a study: the study tree (the root
 * question, its hypotheses and the branches with their parent and fork
 * relations), each node's state in text, the links between entries in both
 * directions, and each entry's key field. Pure functions over the server's
 * read; the server owns every status and relation.
 */

/** A node's state, always as text; `tone` only picks the matching science-state token. */
export interface ScienceState {
  label: string;
  tone: 'running' | 'supported' | 'refuted' | 'superseded' | 'neutral';
}

export interface StudyNode {
  /** Unique among the tree's nodes. */
  key: string;
  kind: 'question' | 'hypothesis' | 'reframe' | 'branch';
  /** The branch (session) whose entries selecting this node opens. */
  branch: string;
  /** The entry this node stands for (questions, hypotheses, reframes). */
  entry?: string;
  title: string;
  /** How the node relates to its parent, in text: "fork of …", "step draft", "delegated". */
  relation?: string;
  /** A branch node's relation as the server names it. */
  branchRelation?: ScienceBranch['relation'];
  state: ScienceState;
  /** The fork's or reframe's note, for its tooltip. */
  note?: string;
  /** The branch's task handle, for its task row. */
  handle?: string;
  /** The branch's node folder, when the run keeps one. */
  folder?: string;
  /** Other branches whose observations this branch's observations derive from. */
  derivedFrom: { branch: string; entry: string; title: string }[];
  children: StudyNode[];
}

const RUNNING = new Set(['running', 'queued', 'accepted', 'dispatching', 'pending', 'started']);

/** An entry's status as text; hypotheses use the log's own vocabulary. */
export function entryState(entry: Pick<ScienceEntry, 'status' | 'type'>): ScienceState {
  const status = entry.status.trim();
  if (status === 'supported') return { label: 'supported', tone: 'supported' };
  if (status === 'refuted') return { label: 'refuted', tone: 'refuted' };
  if (status === 'superseded') return { label: 'superseded', tone: 'superseded' };
  if (RUNNING.has(status)) return { label: 'running', tone: 'running' };
  if (status) return { label: status.replaceAll('_', ' '), tone: 'neutral' };
  return { label: entry.type === 'hypothesis' ? 'open' : 'recorded', tone: 'neutral' };
}

/**
 * A branch's own state in text: its task's status (running while it runs). A
 * hypothesis the branch settled carries its own state on its own node; the
 * branch does not borrow it.
 */
export function branchState(branch: ScienceBranch): ScienceState {
  const task = branch.task_status.trim();
  if (RUNNING.has(task)) return { label: 'running', tone: 'running' };
  if (task) return { label: task.replaceAll('_', ' '), tone: 'neutral' };
  return { label: 'no task status', tone: 'neutral' };
}

/** Whether any branch of the study is still running. */
export function studyRunning(study: Pick<ScienceStudy, 'branches'>): boolean {
  return study.branches.some((branch) => branchState(branch).tone === 'running');
}

/** How a branch relates to its parent, in text. */
export function branchRelation(branch: ScienceBranch, titles: ReadonlyMap<string, string>): string {
  switch (branch.relation) {
    case 'root':
      return 'root';
    case 'fork': {
      const source = branch.fork_of_session_id || branch.parent_session_id;
      return `fork of ${titles.get(source) || 'its origin'}`;
    }
    case 'branch':
      return 'branch of the conversation';
    case 'step':
      return branch.workflow_step ? `step ${branch.workflow_step}` : 'step';
    case 'delegated':
      return 'delegated';
    default:
      return 'related branch';
  }
}

/** A branch's display name: its title, else its step, else its session id. */
export function branchTitle(branch: ScienceBranch): string {
  return branch.title || branch.workflow_step || branch.session_id;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The text an entry is about: its statement, claim, method, interpretation, or first text field. */
export function entrySummary(entry: ScienceEntry): string {
  const fields = entry.fields;
  const key: Record<string, string> = {
    question: 'statement',
    hypothesis: 'claim',
    experiment: 'method',
    observation: 'result',
    evidence: 'interpretation',
    reframe: 'rationale',
    conflict: 'description',
    view: 'title',
  };
  const preferred = text(fields[key[entry.type] ?? '']);
  if (preferred) return preferred;
  if (entry.type === 'conclusion') {
    const claims = Array.isArray(fields['claims']) ? fields['claims'] : [];
    const first = claims.map((claim) => text((claim as Record<string, unknown>)?.['text']))[0];
    if (first) return first;
  }
  if (entry.type === 'observation') {
    const count = measurements(entry).length;
    if (count) return `${count} measurement${count === 1 ? '' : 's'}`;
  }
  for (const value of Object.values(fields)) if (text(value)) return text(value);
  return '';
}

export interface Measurement {
  metric: string;
  value: string;
  unit: string;
  conditions: string;
  source: string;
}

function display(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** An observation's measurements as table rows. */
export function measurements(entry: ScienceEntry): Measurement[] {
  const rows = Array.isArray(entry.fields['measurements']) ? entry.fields['measurements'] : [];
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    return [
      {
        metric: display(row['metric']),
        value: display(row['value']),
        unit: display(row['unit']),
        conditions: display(row['conditions']),
        source: display(row['source']),
      },
    ];
  });
}

export interface LineageRow {
  callId: string;
  tool: string;
  /** The call's arguments as recorded, without the runtime's own bookkeeping keys. */
  args: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
  /** SHA-256 of the call's result, as recorded. */
  digest: string;
  /** The session that made the call (the cited call's branch or a delegate). */
  session: string;
}

/** An observation's sources: the recorded calls behind it. */
export function lineage(entry: ScienceEntry): LineageRow[] {
  const rows = Array.isArray(entry.fields['lineage']) ? entry.fields['lineage'] : [];
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    const args =
      row['args'] && typeof row['args'] === 'object' && !Array.isArray(row['args'])
        ? Object.fromEntries(
            Object.entries(row['args'] as Record<string, unknown>).filter(
              ([key]) => !key.startsWith('_clio_'),
            ),
          )
        : {};
    return [
      {
        callId: display(row['call_id']),
        tool: display(row['tool']),
        args,
        startedAt: display(row['started_at']),
        completedAt: display(row['completed_at']),
        digest: display(row['result_sha256']),
        session: display(row['session']) || entry.session || entry.branch,
      },
    ];
  });
}

/** One file an observation's cited calls read or wrote, or the script one ran. */
export interface SourceFile {
  callId: string;
  direction: 'used' | 'generated' | 'script';
  artifactId: string;
  path: string;
  sha256: string;
}

/** The files an observation's cited calls read and wrote, from its `fields.artifacts`. */
export function sourceFiles(entry: ScienceEntry): SourceFile[] {
  const rows = Array.isArray(entry.fields['artifacts']) ? entry.fields['artifacts'] : [];
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    const direction = display(row['direction']);
    if (direction !== 'used' && direction !== 'generated' && direction !== 'script') return [];
    return [
      {
        callId: display(row['call_id']),
        direction,
        artifactId: display(row['artifact_id']),
        path: display(row['path'] || row['name'] || row['external_ref'] || row['cmd']),
        sha256: display(row['sha256']),
      },
    ];
  });
}

/** The entry ids an observation derives from. */
export function derivedFrom(entry: ScienceEntry): string[] {
  const raw = entry.fields['derived_from'];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.flatMap((value) =>
    typeof value === 'string'
      ? [value]
      : value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
        ? [(value as { id: string }).id]
        : [],
  );
}

/** One edge from an entry to another: a link, a conclusion claim's citation, or a derivation. */
export interface EntryEdge {
  from: string;
  to: string;
  relation: string;
}

/** Every edge out of an entry. */
export function outgoing(entry: ScienceEntry): EntryEdge[] {
  const edges: EntryEdge[] = entry.links.map((link) => ({
    from: entry.id,
    to: link.to,
    relation: link.relation || 'links to',
  }));
  if (entry.type === 'conclusion' && Array.isArray(entry.fields['claims'])) {
    for (const claim of entry.fields['claims'] as unknown[]) {
      const cites = (claim as Record<string, unknown>)?.['cites'];
      if (Array.isArray(cites))
        for (const id of cites)
          if (typeof id === 'string') edges.push({ from: entry.id, to: id, relation: 'cites' });
    }
  }
  for (const id of derivedFrom(entry))
    edges.push({ from: entry.id, to: id, relation: 'derived from' });
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.relation}:${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Backlinks: for each entry id, the entries that link to, cite or derive from it. */
export function backlinks(entries: readonly ScienceEntry[]): Map<string, EntryEdge[]> {
  const index = new Map<string, EntryEdge[]>();
  for (const entry of entries)
    for (const edge of outgoing(entry)) index.set(edge.to, [...(index.get(edge.to) ?? []), edge]);
  return index;
}

/** The type's reader-facing name. */
export const ENTRY_TYPE_LABELS: Record<ScienceEntry['type'], string> = {
  question: 'Question',
  hypothesis: 'Hypothesis',
  experiment: 'Experiment',
  observation: 'Observation',
  evidence: 'Evidence',
  reframe: 'Reframe',
  conclusion: 'Conclusion',
  conflict: 'Conflict',
  view: 'View',
  unknown: 'Entry',
};

/** A short, readable reference to an entry: its type and the start of its key field. */
export function entryReference(entry: ScienceEntry | undefined, id: string): string {
  if (!entry) return `entry ${id}`;
  const summary = entrySummary(entry);
  const short = summary.length > 60 ? `${summary.slice(0, 57)}…` : summary;
  return short ? `${ENTRY_TYPE_LABELS[entry.type]}: ${short}` : ENTRY_TYPE_LABELS[entry.type];
}

/** Entries of one branch in the order they were written. */
export function branchEntries(entries: readonly ScienceEntry[], branch: string): ScienceEntry[] {
  return entries
    .filter((entry) => entry.branch === branch)
    .toSorted((left, right) => left.created_at.localeCompare(right.created_at));
}

/**
 * The study tree: the root question, then the root branch's hypotheses and
 * reframes, then each branch under its parent (a fork under the branch it forks),
 * each carrying its own hypotheses and reframes.
 */
export function studyTree(study: ScienceStudy): StudyNode {
  const { branches, entries } = study;
  const titles = new Map(branches.map((branch) => [branch.session_id, branchTitle(branch)]));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const known = new Set(branches.map((branch) => branch.session_id));
  const root = study.root_session_id || branches[0]?.session_id || study.session_id;
  const parentOf = (branch: ScienceBranch) => {
    const parent =
      branch.relation === 'fork'
        ? branch.fork_of_session_id || branch.parent_session_id
        : branch.parent_session_id;
    return parent && parent !== branch.session_id && known.has(parent) ? parent : root;
  };
  const entryNodes = (branch: string): StudyNode[] =>
    branchEntries(entries, branch)
      .filter(
        (entry) =>
          entry.type === 'hypothesis' ||
          entry.type === 'reframe' ||
          (entry.type === 'question' && entry.id !== study.study),
      )
      .map((entry) => ({
        key: `entry:${entry.id}`,
        kind: entry.type === 'hypothesis' ? 'hypothesis' : 'reframe',
        branch,
        entry: entry.id,
        title: entrySummary(entry) || ENTRY_TYPE_LABELS[entry.type],
        ...(entry.type === 'hypothesis' ? {} : { relation: 'reframe' }),
        state: entryState(entry),
        derivedFrom: [],
        children: [],
      }));
  const derivations = (branch: string) =>
    branchEntries(entries, branch).flatMap((entry) =>
      derivedFrom(entry).flatMap((id) => {
        const source = byId.get(id);
        return source && source.branch !== branch
          ? [
              {
                branch: source.branch,
                entry: id,
                title: titles.get(source.branch) || source.branch,
              },
            ]
          : [];
      }),
    );
  const visited = new Set<string>([root]);
  const branchNode = (branch: ScienceBranch): StudyNode => {
    visited.add(branch.session_id);
    const children = branches
      .filter(
        (child) =>
          child.session_id !== root &&
          !visited.has(child.session_id) &&
          parentOf(child) === branch.session_id,
      )
      .map(branchNode);
    return {
      key: `branch:${branch.session_id}`,
      kind: 'branch',
      branch: branch.session_id,
      title: branchTitle(branch),
      relation: branchRelation(branch, titles),
      branchRelation: branch.relation,
      state: branchState(branch),
      ...(branch.note ? { note: branch.note } : {}),
      ...(branch.handle ? { handle: branch.handle } : {}),
      ...(branch.node_folder ? { folder: branch.node_folder } : {}),
      derivedFrom: derivations(branch.session_id),
      children: [...entryNodes(branch.session_id), ...children],
    };
  };
  const question = byId.get(study.study);
  const rootBranch = branches.find((branch) => branch.session_id === root);
  const topBranches = branches
    .filter((branch) => branch.session_id !== root && parentOf(branch) === root)
    .map(branchNode);
  // A branch whose parent chain loops back on itself still appears once, under the root.
  const orphans = branches
    .filter((branch) => branch.session_id !== root && !visited.has(branch.session_id))
    .map(branchNode);
  return {
    key: `question:${study.study || root}`,
    kind: 'question',
    branch: root,
    ...(question ? { entry: question.id } : {}),
    title: (question && entrySummary(question)) || 'Study question',
    relation: rootBranch ? `asked in ${branchTitle(rootBranch)}` : undefined,
    // The question's own status; the root branch's task state only when no question is logged.
    state: question
      ? entryState(question)
      : rootBranch
        ? branchState(rootBranch)
        : { label: 'recorded', tone: 'neutral' },
    ...(rootBranch?.handle ? { handle: rootBranch.handle } : {}),
    ...(rootBranch?.node_folder ? { folder: rootBranch.node_folder } : {}),
    derivedFrom: derivations(root),
    children: [...entryNodes(root), ...topBranches, ...orphans],
  };
}

/** The DOM id an entry's card carries, so a citation can bring it into view. */
/** The element id of a study view's panel, for opening it in place. */
export function studyViewDomId(entry: string): string {
  return `study-view-${entry}`;
}

export function scienceEntryDomId(entryId: string): string {
  return `science-entry-${entryId}`;
}

/** The message whose tool block is the call `callId`, among one session's messages. */
export function messageForCall(
  messages: readonly Message[],
  sessionId: string,
  callId: string,
): string | undefined {
  return messages.find(
    (message) =>
      message.session_id === sessionId &&
      message.blocks.some((block) => block.type === 'tool' && block.tool_id === callId),
  )?.id;
}
