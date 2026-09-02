import type { ApprovalRequest, Session, UserQuestion } from '@clio/core/v3';

export interface SessionAttention {
  sessionId: string;
  permissionIds: readonly string[];
  questionIds: readonly string[];
  total: number;
}

interface MutableSessionAttention {
  permissionIds: Set<string>;
  questionIds: Set<string>;
}

/** Builds durable, parent-bubbled attention state from pending interactions and run states. */
export function buildSessionAttentionMap(
  sessions: readonly Session[],
  approvals: readonly ApprovalRequest[],
  questions: readonly UserQuestion[],
): Readonly<Record<string, SessionAttention>> {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const pendingBySession = new Map<string, MutableSessionAttention>();
  const pending = (sessionId: string) => {
    const rootId = rootSessionId(sessionId, sessionsById);
    const existing = pendingBySession.get(rootId);
    if (existing) return existing;
    const created = { permissionIds: new Set<string>(), questionIds: new Set<string>() };
    pendingBySession.set(rootId, created);
    return created;
  };

  for (const approval of approvals) pending(approval.session_id).permissionIds.add(approval.id);
  for (const question of questions) pending(question.session_id).questionIds.add(question.id);

  // Snapshot the REAL pending counts per root before adding any synthetic
  // `session.state` markers below. The loop below mutates `pendingBySession`
  // as it adds markers, so reading it live (as this used to) meant one
  // child's synthetic marker could suppress a sibling's — the count would
  // then depend on iteration order instead of on what is actually pending.
  const realPermissionCounts = new Map(
    [...pendingBySession.entries()].map(([rootId, value]) => [rootId, value.permissionIds.size]),
  );
  const realQuestionCounts = new Map(
    [...pendingBySession.entries()].map(([rootId, value]) => [rootId, value.questionIds.size]),
  );

  for (const session of sessions) {
    const rootId = rootSessionId(session.id, sessionsById);
    if (session.state === 'waiting_permission' && !realPermissionCounts.get(rootId)) {
      pending(session.id).permissionIds.add(`state:${session.id}:waiting_permission`);
    }
    if (session.state === 'waiting_user' && !realQuestionCounts.get(rootId)) {
      pending(session.id).questionIds.add(`state:${session.id}:waiting_user`);
    }
  }

  return Object.fromEntries(
    [...pendingBySession.entries()].map(([sessionId, value]) => {
      const permissionIds = [...value.permissionIds];
      const questionIds = [...value.questionIds];
      return [
        sessionId,
        {
          sessionId,
          permissionIds,
          questionIds,
          total: permissionIds.length + questionIds.length,
        },
      ];
    }),
  );
}

export function sessionAttentionLabel(attention: SessionAttention): string {
  const permissions = attention.permissionIds.length;
  const questions = attention.questionIds.length;
  if (permissions && questions) {
    return `${countLabel(permissions, 'permission')} and ${countLabel(questions, 'question')}`;
  }
  if (permissions) return countLabel(permissions, 'permission');
  return countLabel(questions, 'question');
}

export function sessionAttentionIds(attention: SessionAttention): readonly string[] {
  return [...attention.permissionIds, ...attention.questionIds];
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

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
