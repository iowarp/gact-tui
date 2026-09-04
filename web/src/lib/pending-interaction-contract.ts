import type {
  ApprovalRequest,
  PendingInteraction,
  PendingInteractionCorrelation,
  PendingInteractionResponse,
  Session,
  UserQuestion,
} from '@clio/core/v3';

export type PermissionAction = 'allow' | 'deny' | 'allow_session' | 'allow_workspace';

const PERMISSION_ACTIONS: ReadonlySet<string> = new Set<PermissionAction>([
  'allow',
  'deny',
  'allow_session',
  'allow_workspace',
]);

function isPermissionAction(value: string | undefined): value is PermissionAction {
  return value !== undefined && PERMISSION_ACTIONS.has(value);
}

/** Keeps the normalized endpoint opt-in so older backends retain their legacy paths. */
export function hasUnifiedInteractionCapability(
  capabilities?: Readonly<Record<string, unknown>>,
): boolean {
  return capabilities?.x_clio_interactions === true;
}

/** A locally-known root session id, or one this client could only walk partway to. */
export interface InteractionRootResolution {
  id: string;
  /**
   * False when the walk stopped because a session's `parent_session_id` points
   * at an ancestor this client has not listed (or the hierarchy cycles) — `id`
   * is the highest node reachable from local data, not provably the true root.
   * True for a genuine root (no parent) or the starting session itself.
   */
  resolved: boolean;
}

/** Resolves the attended root from the locally known session hierarchy. */
export function interactionRootSessionId(
  sessionId: string,
  sessions: readonly Session[],
): InteractionRootResolution {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  let currentId = sessionId;
  const visited = new Set<string>();
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const parentId = sessionsById.get(currentId)?.parent_session_id;
    if (!parentId) return { id: currentId, resolved: true };
    if (!sessionsById.has(parentId)) return { id: currentId, resolved: false };
    currentId = parentId;
  }
  // A cycle in the locally known hierarchy is a data-integrity problem, not a
  // resolved root; the starting session is returned as the best-effort id.
  return { id: sessionId, resolved: false };
}

/** Adapts the legacy question and permission ledgers to the normalized UI projection. */
export function legacyPendingInteractions(
  sessions: readonly Session[],
  approvals: readonly ApprovalRequest[],
  questions: readonly UserQuestion[],
): PendingInteraction[] {
  return [
    ...approvals.map(
      (approval): PendingInteraction => ({
        id: approval.id,
        kind: 'permission',
        owner_session_id: approval.session_id,
        attended_session_id: interactionRootSessionId(approval.session_id, sessions).id,
        status: 'pending',
        title: approval.summary,
        prompt: approval.reason,
        source: { protocol: 'native', tool_name: approval.tool_name },
        created_at: approval.created_at,
        payload: {
          permission_id: approval.id,
          tool_call: { tool_name: approval.tool_name, input: approval.input },
        },
        actions: ['allow', 'deny', 'allow_session', 'allow_workspace'],
      }),
    ),
    ...questions.map(
      (question): PendingInteraction => ({
        id: question.id,
        kind: 'question',
        owner_session_id: question.session_id,
        attended_session_id: interactionRootSessionId(question.session_id, sessions).id,
        status: question.status,
        title: 'Question from agent',
        prompt: question.prompt,
        source: { protocol: 'native' },
        created_at: question.created_at,
        payload: {
          question_id: question.id,
          question_kind: question.kind,
          options: question.options,
          allow_freeform: question.allow_freeform,
          expires_at: question.expires_at,
        },
        actions: ['answer', 'cancel'],
      }),
    ),
  ];
}

/** Sends a normalized response through the legacy endpoints of an older backend. */
export async function respondToLegacyInteraction(
  interaction: PendingInteraction,
  response: PendingInteractionResponse,
  legacy: {
    answerQuestion: (
      sessionId: string,
      questionId: string,
      answer: { answer?: string; selected_options?: string[] },
    ) => Promise<unknown>;
    cancelQuestion: (sessionId: string, questionId: string) => Promise<unknown>;
    respondPermission: (permissionId: string, action: PermissionAction) => Promise<unknown>;
    a2uiAction: (
      sessionId: string,
      message: unknown,
      correlation?: PendingInteractionCorrelation,
    ) => Promise<unknown>;
  },
): Promise<unknown> {
  if (interaction.kind === 'permission') {
    // The legacy endpoint genuinely only accepts these four values; a caller
    // that got here with anything else (an unrecognized server-offered action
    // this client never renders a clickable control for) is a real bug, not
    // a case an unchecked cast should paper over.
    if (!isPermissionAction(response.action)) {
      throw new Error(`Unsupported permission action: ${response.action ?? '(none)'}`);
    }
    return legacy.respondPermission(
      interaction.payload?.permission_id ?? interaction.id,
      response.action,
    );
  }
  if (interaction.kind === 'a2ui') {
    return legacy.a2uiAction(interaction.owner_session_id, response.message, response.correlation);
  }
  const questionId = interaction.payload?.question_id ?? interaction.id;
  if (response.action === 'cancel') {
    return legacy.cancelQuestion(interaction.owner_session_id, questionId);
  }
  return legacy.answerQuestion(interaction.owner_session_id, questionId, {
    answer: response.answer,
    selected_options: response.selected_options,
  });
}
