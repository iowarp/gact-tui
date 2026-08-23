import type { PermissionScope, SessionTask, UserQuestion } from '../wire/types.js';
import {
  answerSessionUserQuestion,
  cancelSessionUserQuestion,
  createTask,
  fetchSessionPermissions,
  fetchSessionQuestions,
  fetchSessionTasks,
  patchTask,
  removeTask,
  resolveSessionPermission,
  type AnswerSessionQuestionInput,
  type CreateSessionTaskInput,
  type PatchSessionTaskInput,
  type SessionPermissionsResult,
  type SessionQuestionsResult,
  type SessionTasksResult,
} from './session.js';
import { SessionMemoryClient } from './session_memory_client.js';

export class SessionCoordinationClient extends SessionMemoryClient {
  /**
   * POST /v1/sessions/{id}/questions/{qid}/answer — resolve a pending
   * orchestrator question (#380). Body carries the user's reply (free
   * text for `freeform`, value for `choice` / `confirmation`).
   */
  answerSessionQuestion(
    sessionId: string,
    questionId: string,
    body: AnswerSessionQuestionInput,
  ): Promise<UserQuestion> {
    return answerSessionUserQuestion(this, sessionId, questionId, body);
  }

  /**
   * POST /v1/sessions/{id}/questions/{qid}/cancel — abort a pending
   * orchestrator question.
   */
  cancelSessionQuestion(sessionId: string, questionId: string): Promise<UserQuestion> {
    return cancelSessionUserQuestion(this, sessionId, questionId);
  }

  /**
   * GET /v1/sessions/{id}/questions — pending ask-user questions
   * from the orchestrator (#380). Defaults to all statuses.
   */
  sessionQuestions(
    sessionId: string,
    status?: UserQuestion['status'],
  ): Promise<SessionQuestionsResult> {
    return fetchSessionQuestions(this, sessionId, status);
  }

  /**
   * GET /v1/sessions/{id}/tasks — list the lightweight TODO entries
   * scoped to a session (clio-agent develop).
   */
  sessionTasks(sessionId: string): Promise<SessionTasksResult> {
    return fetchSessionTasks(this, sessionId);
  }

  /**
   * POST /v1/sessions/{id}/tasks — create a session task.
   */
  createSessionTask(sessionId: string, body: CreateSessionTaskInput): Promise<SessionTask> {
    return createTask(this, sessionId, body);
  }

  /**
   * PATCH /v1/tasks/{tid} — update a session task. Pass any subset of
   * {title, status, metadata}.
   */
  patchSessionTask(taskId: string, patch: PatchSessionTaskInput): Promise<SessionTask> {
    return patchTask(this, taskId, patch);
  }

  /**
   * DELETE /v1/tasks/{tid} — remove a session task.
   */
  deleteSessionTask(taskId: string): Promise<void> {
    return removeTask(this, taskId);
  }

  /**
   * GET /v1/permissions?session_id=… — list pending permissions for a
   * session. The frontend uses this for the initial fetch; subsequent
   * arrivals come over SSE as `permission.requested` events.
   */
  permissions(sessionId: string, status?: string): Promise<SessionPermissionsResult> {
    return fetchSessionPermissions(this, sessionId, status);
  }

  /**
   * POST /v1/permissions/{pid} — resolve a pending request. `decision`
   * is "approve" or "deny"; for approvals the `scope` carries the
   * inline-card button (once / session / always_tool / always_server).
   */
  resolvePermission(
    permissionId: string,
    decision: 'approve' | 'deny',
    scope?: PermissionScope,
  ): Promise<void> {
    return resolveSessionPermission(this, permissionId, decision, scope);
  }
}
