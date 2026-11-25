/** Opens the Runs workbench tab, showing one run's record when `run` is given. */
export const OPEN_RUNS_TAB_EVENT = 'clio:open-runs-tab';

export interface OpenRunsTabDetail {
  run?: string;
  /** The conversation that owns the run, so a run past the loaded pages still reads. */
  sessionId?: string;
}

export function openRunsTab(detail: OpenRunsTabDetail = {}): void {
  window.dispatchEvent(new CustomEvent<OpenRunsTabDetail>(OPEN_RUNS_TAB_EVENT, { detail }));
}
