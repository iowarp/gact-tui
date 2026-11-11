import {
  render as renderComponent,
  type RenderResult,
  screen,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren, type ReactElement } from 'react';
import { vi } from 'vitest';
import { ClioWorkbench } from './workbench';
import { listTab, saveWorkbenchState } from './workbench-tab-storage';

/** Give standalone canvas tests the query context used by the real workspace. */
export function render(ui: ReactElement): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderComponent(ui, {
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
}

export function renderWorkbench() {
  return render(
    createElement(ClioWorkbench, {
      artifacts: [],
      diffs: [],
      files: [],
      onOpenSubagent: vi.fn(),
      onUndoDiff: vi.fn(),
      sessionId: 'session_parent',
      sessionView: createElement('p', null, 'Session intelligence'),
      workspaceId: 'workspace_1',
    }),
  );
}

/** The strip of list and tab openers on the panel's outer edge. */
export function strip() {
  return within(screen.getByRole('toolbar', { name: 'Workbench lists' }));
}

/** A returning conversation: the pocket restores the Activity tab it showed last time. */
export function restorePocket() {
  const activity = listTab('activity');
  saveWorkbenchState('workspace_1', { tabs: [activity], activeTabId: activity.id, pinnedIds: [] });
}

/** Tab names in strip order. */
export const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

export const REPORT = {
  id: 'report_1',
  session_id: 'session_parent',
  workspace_id: 'workspace_1',
  name: 'report.md',
  media_type: 'text/markdown',
  size: 8,
  uri: 'artifact://workspace_1/report.md@v1',
  session_relation: 'produced' as const,
};
