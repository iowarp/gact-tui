import type { HttpTransport } from './transport.js';

type HookTransport = Pick<HttpTransport, 'get' | 'post' | 'del'>;

/**
 * The six declarative-hook event kinds clio accepts (verified against
 * live :17803 `x_clio_hook_events`). A bare `string` is also tolerated on
 * the wire so an unknown future kind does not break parsing.
 */
export type HookEvent =
  | 'pre_tool'
  | 'post_tool'
  | 'pre_message'
  | 'post_message'
  | 'semantic_event'
  | 'on_error';

/** A declarative hook row as returned by GET/POST /v1/hooks. */
export interface HookRow {
  id: string;
  event: HookEvent | string;
  /** Local command/script path. Empty string when a `url` hook instead. */
  command?: string;
  /** HTTP endpoint clio would POST to. Empty string when a `command` hook. */
  url?: string;
  session_id?: string;
  workspace_id?: string;
}

export interface HooksResult {
  hooks: HookRow[];
}

export interface CreateHookInput {
  event: HookEvent | string;
  command?: string;
  url?: string;
  session_id?: string;
  workspace_id?: string;
}

export function fetchHooks(client: HookTransport): Promise<HooksResult> {
  return client.get('/v1/hooks');
}

export function registerHook(
  client: HookTransport,
  body: CreateHookInput,
): Promise<HookRow> {
  return client.post('/v1/hooks', body);
}

export function removeHook(client: HookTransport, hookId: string): Promise<void> {
  return client.del(`/v1/hooks/${encodeURIComponent(hookId)}`);
}
