/**
 * History mode: the server has no clio-core (its storage engine), so the agent's
 * context is kept in memory only. A working but reduced service, named everywhere
 * the service status is shown so it is never mistaken for a ready one.
 */
export const HISTORY_MODE_LABEL = 'History mode';

export const HISTORY_MODE_DETAIL =
  'clio-core is not installed on this server, so conversations are kept in memory only ' +
  'and are lost on restart. Context editing and compaction are off.';

/** True when a health response says the service runs in History mode. */
export function isHistoryMode(health: { context_mode?: string } | undefined): boolean {
  return health?.context_mode === 'history';
}
