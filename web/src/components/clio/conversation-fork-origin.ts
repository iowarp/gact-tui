import type { Session } from '@clio/core/v3';

/** Who made a fork: the person, or the agent through its `fork` tool. */
export interface ConversationForkAuthor {
  kind: 'agent' | 'human';
  agent_id?: string;
}

export interface ConversationForkOrigin {
  session_id: string;
  message_id: string;
  message_count: number;
  created_at: string;
  title?: string;
  /** Absent on a person's fork recorded before authors were saved. */
  author?: ConversationForkAuthor;
  /** The tool call that made an agent's fork. */
  invocation?: string;
  /** What an agent's fork does differently. */
  note?: string;
}

function forkAuthor(value: unknown): ConversationForkAuthor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  if (row['kind'] !== 'agent' && row['kind'] !== 'human') return undefined;
  return {
    kind: row['kind'],
    ...(typeof row['agent_id'] === 'string' && row['agent_id']
      ? { agent_id: row['agent_id'] }
      : {}),
  };
}

/** Read a saved checkpoint; never guess the boundary from the parent's current history. */
export function conversationForkOrigin(session?: Session): ConversationForkOrigin | undefined {
  const raw = session?.metadata?.['fork_origin'];
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const author = forkAuthor(value['author']);
  // An agent forks mid-turn: its copy may end without a completed message boundary.
  const agent = author?.kind === 'agent';
  const messageId = value['message_id'] ?? (agent ? '' : undefined);
  const messageCount = value['message_count'] ?? (agent ? 0 : undefined);
  if (
    value['session_id'] !== session?.parent_session_id ||
    typeof value['session_id'] !== 'string' ||
    !value['session_id'] ||
    typeof messageId !== 'string' ||
    typeof messageCount !== 'number' ||
    !Number.isInteger(messageCount) ||
    messageCount < 0 ||
    (!agent && Boolean(messageId) !== Boolean(messageCount)) ||
    typeof value['created_at'] !== 'string' ||
    !value['created_at']
  )
    return undefined;
  return {
    session_id: value['session_id'],
    message_id: messageId,
    message_count: messageCount,
    created_at: value['created_at'],
    title: typeof value['title'] === 'string' ? value['title'] : undefined,
    ...(author ? { author } : {}),
    ...(typeof value['invocation'] === 'string' && value['invocation']
      ? { invocation: value['invocation'] }
      : {}),
    ...(typeof value['note'] === 'string' && value['note'].trim()
      ? { note: value['note'].trim() }
      : {}),
  };
}

/** Whether the agent, not the person, made this fork. */
export function isAgentFork(origin: ConversationForkOrigin | undefined): boolean {
  return origin?.author?.kind === 'agent';
}

/** Who forked, in text: "Forked by the agent: <note>" for an agent's fork. */
export function forkAuthorLabel(origin: ConversationForkOrigin | undefined): string | undefined {
  if (!isAgentFork(origin)) return undefined;
  return origin!.note ? `Forked by the agent: ${origin!.note}` : 'Forked by the agent';
}

/**
 * Sessions in navigation order with each agent fork placed under its origin
 * (after the origin's earlier forks) when the origin is listed; `depth` counts
 * how many agent forks deep a row sits. Every other row keeps its place.
 */
export function nestAgentForks<T extends Session>(
  sessions: readonly T[],
): { session: T; depth: number }[] {
  const listed = new Set(sessions.map((session) => session.id));
  const forksOf = new Map<string, T[]>();
  const nested = new Set<string>();
  for (const session of sessions) {
    const origin = conversationForkOrigin(session);
    if (
      !isAgentFork(origin) ||
      !listed.has(origin!.session_id) ||
      origin!.session_id === session.id
    )
      continue;
    forksOf.set(origin!.session_id, [...(forksOf.get(origin!.session_id) ?? []), session]);
    nested.add(session.id);
  }
  const rows: { session: T; depth: number }[] = [];
  const seen = new Set<string>();
  const visit = (session: T, depth: number) => {
    if (seen.has(session.id)) return;
    seen.add(session.id);
    rows.push({ session, depth });
    for (const fork of forksOf.get(session.id) ?? []) visit(fork, depth + 1);
  };
  for (const session of sessions) if (!nested.has(session.id)) visit(session, 0);
  // A fork whose origin chain loops never reaches a top-level row; keep it listed.
  for (const session of sessions) visit(session, 0);
  return rows;
}
