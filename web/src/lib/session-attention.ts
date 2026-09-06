import type { PendingInteraction, PendingInteractionKind, Session } from '@clio/core/v3';

export interface SessionAttention {
  sessionId: string;
  permissionIds: readonly string[];
  questionIds: readonly string[];
  mcpTaskInputIds: readonly string[];
  a2uiIds: readonly string[];
  /**
   * Requests of a kind this build has no surface for. They still block the
   * session, so they are counted — but counting them as questions told the
   * person to answer something this app cannot even show them.
   */
  unknownIds: readonly string[];
  total: number;
}

interface MutableSessionAttention {
  permissionIds: Set<string>;
  questionIds: Set<string>;
  mcpTaskInputIds: Set<string>;
  a2uiIds: Set<string>;
  unknownIds: Set<string>;
}

/** Builds durable attention state using the server's attended-session projection. */
export function buildSessionAttentionMap(
  sessions: readonly Session[],
  interactions: readonly PendingInteraction[],
): Readonly<Record<string, SessionAttention>> {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const pendingBySession = new Map<string, MutableSessionAttention>();
  const pending = (sessionId: string) => {
    const rootId = rootSessionId(sessionId, sessionsById);
    const existing = pendingBySession.get(rootId);
    if (existing) return existing;
    const created: MutableSessionAttention = {
      permissionIds: new Set(),
      questionIds: new Set(),
      mcpTaskInputIds: new Set(),
      a2uiIds: new Set(),
      unknownIds: new Set(),
    };
    pendingBySession.set(rootId, created);
    return created;
  };

  for (const interaction of interactions) {
    if (interaction.status !== 'pending' || interaction.requires_human_response === false) continue;
    const target = pending(interaction.attended_session_id);
    interactionIdsForKind(target, interaction.kind).add(interaction.id);
  }

  // Snapshot the REAL pending counts per root before adding any synthetic
  // `session.state` markers below. The loop below mutates `pendingBySession`
  // as it adds markers, so reading it live (as this used to) meant one
  // child's synthetic marker could suppress a sibling's — the count would
  // then depend on iteration order instead of on what is actually pending.
  const realPermissionCounts = new Map(
    [...pendingBySession.entries()].map(([rootId, value]) => [rootId, value.permissionIds.size]),
  );
  const realUserInputCounts = new Map(
    [...pendingBySession.entries()].map(([rootId, value]) => [
      rootId,
      value.questionIds.size +
        value.mcpTaskInputIds.size +
        value.a2uiIds.size +
        value.unknownIds.size,
    ]),
  );

  for (const session of sessions) {
    const rootId = rootSessionId(session.id, sessionsById);
    if (session.state === 'waiting_permission' && !realPermissionCounts.get(rootId)) {
      pending(session.id).permissionIds.add(`state:${session.id}:waiting_permission`);
    }
    if (session.state === 'waiting_user' && !realUserInputCounts.get(rootId)) {
      pending(session.id).questionIds.add(`state:${session.id}:waiting_user`);
    }
  }

  return Object.fromEntries(
    [...pendingBySession.entries()].map(([sessionId, value]) => {
      const permissionIds = [...value.permissionIds];
      const questionIds = [...value.questionIds];
      const mcpTaskInputIds = [...value.mcpTaskInputIds];
      const a2uiIds = [...value.a2uiIds];
      const unknownIds = [...value.unknownIds];
      return [
        sessionId,
        {
          sessionId,
          permissionIds,
          questionIds,
          mcpTaskInputIds,
          a2uiIds,
          unknownIds,
          total:
            permissionIds.length +
            questionIds.length +
            mcpTaskInputIds.length +
            a2uiIds.length +
            unknownIds.length,
        },
      ];
    }),
  );
}

export function sessionAttentionLabel(attention: SessionAttention): string {
  const labels = [
    countLabel(attention.permissionIds.length, 'permission'),
    countLabel(attention.questionIds.length, 'question'),
    countLabel(attention.mcpTaskInputIds.length, 'task input', 'task inputs'),
    countLabel(attention.a2uiIds.length, 'interactive view'),
    countLabel(attention.unknownIds.length, 'unrecognized request'),
  ].filter(Boolean);
  if (labels.length <= 1) return labels[0] ?? 'response';
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

export function sessionAttentionIds(attention: SessionAttention): readonly string[] {
  return [
    ...attention.permissionIds,
    ...attention.questionIds,
    ...attention.mcpTaskInputIds,
    ...attention.a2uiIds,
    ...attention.unknownIds,
  ];
}

function interactionIdsForKind(
  attention: MutableSessionAttention,
  kind: PendingInteractionKind,
): Set<string> {
  if (kind === 'permission') return attention.permissionIds;
  if (kind === 'mcp_task_input') return attention.mcpTaskInputIds;
  if (kind === 'a2ui') return attention.a2uiIds;
  if (kind === 'question') return attention.questionIds;
  return attention.unknownIds;
}

function rootSessionId(sessionId: string, sessionsById: ReadonlyMap<string, Session>): string {
  let currentId = sessionId;
  const visited = new Set<string>();
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const parentId = sessionsById.get(currentId)?.parent_session_id;
    if (!parentId || !sessionsById.has(parentId)) return currentId;
    currentId = parentId;
  }
  return sessionId;
}

function countLabel(count: number, noun: string, plural = `${noun}s`): string {
  if (!count) return '';
  return `${count} ${count === 1 ? noun : plural}`;
}
