import type { AsyncProcess, Message, Session, SubagentRun } from '@clio/core/v3';

export interface SessionChildRelations {
  messages: Message[];
  processes: AsyncProcess[];
  subagents: SubagentRun[];
}

/** Reconciles authoritative parent/child session links omitted by older transcript snapshots. */
export function sessionChildRelations({
  messages,
  parentSessionId,
  processes,
  sessions,
  subagents,
}: {
  messages: readonly Message[];
  parentSessionId: string;
  processes: readonly AsyncProcess[];
  sessions: readonly Session[];
  subagents: readonly SubagentRun[];
}): SessionChildRelations {
  const children = sessions.filter((session) => session.parent_session_id === parentSessionId);
  const subagentById = new Map(subagents.map((subagent) => [subagent.id, subagent]));
  const representedChildren = new Set(
    subagents.flatMap((subagent) =>
      subagent.child_session_id ? [subagent.child_session_id] : [],
    ),
  );
  const referencedChildren = new Set(
    messages.flatMap((message) =>
      message.blocks.flatMap((block) => {
        if (block.type !== 'subagent') return [];
        const childSessionId = subagentById.get(block.subagent_id)?.child_session_id;
        return childSessionId ? [childSessionId] : [];
      }),
    ),
  );
  const processChildren = new Set(
    processes.flatMap((process) => (process.child_session_id ? [process.child_session_id] : [])),
  );
  const derivedSubagents = children
    .filter((child) => !representedChildren.has(child.id))
    .map(childSessionSubagent);
  const completeSubagents = [...subagents, ...derivedSubagents];
  const completeMessages = [
    ...messages,
    ...children
      .filter((child) => !referencedChildren.has(child.id))
      .map((child) => childSessionMessage(child, parentSessionId)),
  ].sort((left, right) => left.created_at.localeCompare(right.created_at));
  const completeProcesses = [
    ...processes,
    ...children
      .filter((child) => !processChildren.has(child.id))
      .map((child) => childSessionProcess(child, parentSessionId)),
  ];
  return {
    messages: completeMessages,
    processes: completeProcesses,
    subagents: completeSubagents,
  };
}

function childSessionSubagent(child: Session): SubagentRun {
  return {
    id: childRelationId(child.id),
    session_id: child.parent_session_id ?? '',
    child_session_id: child.id,
    agent_id: child.agent_id,
    title: child.title || 'Child conversation',
    state: child.state,
    summary: 'Asynchronous child conversation',
  };
}

function childSessionMessage(child: Session, parentSessionId: string): Message {
  const subagentId = childRelationId(child.id);
  return {
    id: `session-relation:${child.id}`,
    session_id: parentSessionId,
    role: 'system',
    created_at: child.created_at,
    blocks: [{ id: `session-relation-block:${child.id}`, type: 'subagent', subagent_id: subagentId }],
  };
}

function childSessionProcess(child: Session, parentSessionId: string): AsyncProcess {
  return {
    kind: 'agent',
    id: childRelationId(child.id),
    title: child.title || 'Child conversation',
    live_state: child.state,
    status: child.state,
    parent_session_id: parentSessionId,
    child_session_id: child.id,
    created_at: child.created_at,
    updated_at: child.last_interaction_at ?? child.updated_at,
    metadata: {
      source: 'session_relationship',
      ...(child.agent_id ? { agent_id: child.agent_id } : {}),
    },
  };
}

function childRelationId(childSessionId: string): string {
  return `session-child:${childSessionId}`;
}
