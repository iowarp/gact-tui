import type { HttpTransport } from './transport.js';

type RunsTransport = Pick<HttpTransport, 'post'>;

/** Response from ``POST /v1/runs/{handle_id}/dismiss``. */
export interface DismissRunResult {
  dismissed: boolean;
  handle_id: string;
}

/**
 * Dismiss one run (agent OR durable MCP/relay task) by its handle id — the
 * server's existing ``run_registry.dismiss_run`` (#1127 P2.10). For an
 * ``AgentTask``-backed run this is display-only (flips ``dismissed``, the row
 * stays in the registry). For a durable MCP/relay ``TaskRecord`` (#1205) it is
 * the ONE reachable way to clear a settled row: retention keeps it in
 * ``sessions.json`` with its terminal status until this call, so without
 * wiring this the async-processes tray's "recently finished" section would
 * accumulate unboundedly with no way to clear it. 404s (an unknown handle, or
 * — #1205 review 3rd round — a non-terminal task the server refuses to drop)
 * surface as a thrown ``HttpError``; callers decide how to react.
 */
export function dismissRun(client: RunsTransport, handleId: string): Promise<DismissRunResult> {
  return client.post(`/v1/runs/${encodeURIComponent(handleId)}/dismiss`, {});
}
