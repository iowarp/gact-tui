import { PromptSettingsClient } from './prompt_settings_client.js';
import { fetchHooks, registerHook, removeHook } from './hooks.js';
import type { CreateHookInput, HookRow, HooksResult } from './hooks.js';
import { fetchPolicies, updatePolicies } from './system.js';
import type { PoliciesResult, PutPoliciesInput } from './system.js';

export class SettingsClient extends PromptSettingsClient {
  /**
   * GET /v1/policies — the global + workspace policy that governs
   * tool / command / memory autonomy. PR #378 added the
   * `command.agent_invocable` gate.
   */
  policies(): Promise<PoliciesResult> {
    return fetchPolicies(this);
  }

  /** PUT /v1/policies — replace the policy document. */
  putPolicies(body: PutPoliciesInput): Promise<unknown> {
    return updatePolicies(this, body);
  }

  /**
   * GET /v1/hooks — list registered declarative hooks. clio sends rows
   * shaped `{id, event, command, url, session_id, workspace_id}` (verified
   * against live :17803 + app.py:19121-19166). The desktop previously
   * typed these as `{id, type, handler_uri}`, so every field rendered
   * `undefined`. The six valid `event` kinds are pre_tool / post_tool /
   * pre_message / post_message / semantic_event / on_error.
   *
   * HONESTY NOTE: on the current clio build these declarative rows are
   * STORED but NOT dispatched during turns (app.py:8384-8389 is
   * storage-only). The hooks that actually fire are the file-based
   * runtime hooks reported via capabilities (x_clio_hook_backend /
   * x_clio_hook_events).
   */
  hooks(): Promise<HooksResult> {
    return fetchHooks(this);
  }

  /**
   * POST /v1/hooks — register a new declarative hook. clio REQUIRES a
   * non-empty `event` (else 400 "hook missing required field: event")
   * plus `command` OR `url` (else 400 "hook needs command or url"). The
   * desktop previously POSTed `{type, handler_uri}`, which clio ignored —
   * every add 400'd. Send the real wire shape and return the created row.
   */
  createHook(body: CreateHookInput): Promise<HookRow> {
    return registerHook(this, body);
  }

  /** DELETE /v1/hooks/{id} — remove a hook (204). */
  deleteHook(hookId: string): Promise<void> {
    return removeHook(this, hookId);
  }
}
