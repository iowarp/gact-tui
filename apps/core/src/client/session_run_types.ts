import type { PermissionRequest, TurnAttempt } from '../wire/types.js';

export type RunCommandArgs = Record<string, unknown>;

export type RunCommandResult = Record<string, unknown>;

export interface RollbackSessionInput {
  count?: number;
}

export interface RewindSessionInput {
  message_id: string;
  include_target?: boolean;
}

export interface RollbackSessionResult {
  kept_messages?: unknown[];
  deleted_messages?: unknown[];
}

export interface CompactSessionInput {
  reason?: string;
}

export interface SummarizeSessionInput {
  auto?: boolean;
  instructions?: string;
}

export interface RetryTurnInput {
  execute?: boolean;
  notes?: string;
  provider_id?: string;
  model_id?: string;
}

export interface SessionAttemptsResult {
  attempts: TurnAttempt[];
}

export interface SessionPermissionsResult {
  permissions: PermissionRequest[];
}
