import {
  cancelSessionRun,
  createSessionSchedule,
  fetchSessionSchedules,
  removeSchedule,
  runSessionCommand,
  type CreateScheduleInput,
  type CreateScheduleResult,
  type RunCommandArgs,
  type RunCommandResult,
  type SessionSchedulesResult,
} from './session.js';
import { SessionCoordinationClient } from './session_coordination_client.js';

export class SessionOperationsClient extends SessionCoordinationClient {
  /**
   * POST /v1/sessions/{id}/commands/{cmd} — execute a slash command
   * via the structured route rather than dispatching it as a user
   * message. Preserves per-command argument schemas (a thing the
   * "send as user message and let the parser split it" path loses).
   */
  runCommand(
    sessionId: string,
    commandId: string,
    args: RunCommandArgs = {},
  ): Promise<RunCommandResult> {
    return runSessionCommand(this, sessionId, commandId, args);
  }

  /**
   * GET /v1/sessions/{id}/schedules — list cron-style triggers for
   * this session (PR #353 backend surface; SPEC §6.15 marks the
   * capability as optional).
   */
  sessionSchedules(sessionId: string): Promise<SessionSchedulesResult> {
    return fetchSessionSchedules(this, sessionId);
  }

  /**
   * POST /v1/sessions/{id}/schedules — create a new cron trigger.
   * Wire wants `question`, callers think in `prompt`; normalize.
   */
  createSchedule(sessionId: string, body: CreateScheduleInput): Promise<CreateScheduleResult> {
    return createSessionSchedule(this, sessionId, body);
  }

  /**
   * DELETE /v1/schedules/{id} — remove a cron trigger globally.
   */
  deleteSchedule(scheduleId: string): Promise<void> {
    return removeSchedule(this, scheduleId);
  }

  /**
   * POST /v1/sessions/{id}/cancel — interrupts an in-flight run. The
   * backend emits a `message.completed { stop_reason: "cancelled" }`
   * over SSE for any in-progress message. Returns 204.
   */
  cancelSession(sessionId: string): Promise<void> {
    return cancelSessionRun(this, sessionId);
  }
}
