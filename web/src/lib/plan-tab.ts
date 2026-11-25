/** Opens a conversation's plan and todos in a workbench tab. */
export const OPEN_PLAN_TAB_EVENT = 'clio:open-plan-tab';

export interface OpenPlanTabDetail {
  sessionId: string;
}

export function openPlanTab(sessionId: string): void {
  window.dispatchEvent(
    new CustomEvent<OpenPlanTabDetail>(OPEN_PLAN_TAB_EVENT, { detail: { sessionId } }),
  );
}

export function planTabId(sessionId: string): `plan:${string}` {
  return `plan:${sessionId}`;
}
