import type { PendingInteraction, PendingInteractionKind, Session } from '@clio/core/v3';
import { PROTOCOL } from '@/lib/brand-vocabulary';
import { formatLocale } from '@/lib/locale-format';
import { t, plural } from '@lingui/core/macro';

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
  /**
   * The real pending requests, oldest first. A session that only reports a
   * waiting state has none; its counts above still hold the synthetic marker.
   */
  requests?: readonly PendingInteraction[];
  total: number;
}

interface MutableSessionAttention {
  permissionIds: Set<string>;
  questionIds: Set<string>;
  mcpTaskInputIds: Set<string>;
  a2uiIds: Set<string>;
  unknownIds: Set<string>;
  requests: PendingInteraction[];
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
      requests: [],
    };
    pendingBySession.set(rootId, created);
    return created;
  };

  for (const interaction of interactions) {
    if (interaction.status !== 'pending' || interaction.requires_human_response === false) continue;
    const target = pending(interaction.attended_session_id);
    const ids = interactionIdsForKind(target, interaction.kind);
    if (!ids.has(interaction.id)) target.requests.push(interaction);
    ids.add(interaction.id);
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
          requests: [...value.requests].sort((a, b) => a.created_at.localeCompare(b.created_at)),
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
  const protocol = PROTOCOL.a2ui;
  const labels = [
    countLabel(attention.permissionIds.length, (n) =>
      plural(n, { one: '# permission', other: '# permissions' }),
    ),
    countLabel(attention.questionIds.length, (n) =>
      plural(n, { one: '# question', other: '# questions' }),
    ),
    countLabel(attention.mcpTaskInputIds.length, (n) =>
      plural(n, { one: '# task input', other: '# task inputs' }),
    ),
    countLabel(attention.a2uiIds.length, (n) =>
      plural(n, { one: `# ${protocol} surface`, other: `# ${protocol} surfaces` }),
    ),
    countLabel(attention.unknownIds.length, (n) =>
      plural(n, { one: '# unrecognized request', other: '# unrecognized requests' }),
    ),
  ].filter(Boolean);
  if (labels.length <= 1) return labels[0] ?? t`response`;
  return new Intl.ListFormat(formatLocale(), { type: 'conjunction' }).format(labels);
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
    const current = sessionsById.get(currentId);
    if (current?.session_kind === 'branch') return currentId;
    const parentId = current?.parent_session_id;
    if (!parentId || !sessionsById.has(parentId)) return currentId;
    currentId = parentId;
  }
  return sessionId;
}

function countLabel(count: number, words: (count: number) => string): string {
  return count ? words(count) : '';
}
