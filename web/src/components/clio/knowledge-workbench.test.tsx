import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioWorkbench, type ClioWorkbenchHandle } from './workbench';
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('@/providers/appearance-provider', () => ({
  useAppearancePreferences: () => ({ hideDotFiles: false }),
}));
vi.mock('./knowledge-source-view', () => ({
  KnowledgeSourceView: () => <article>Note connections</article>,
}));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
describe('knowledge canvas tabs', () => {
  it('names a knowledge tab after its source and upgrades restored tab labels', async () => {
    window.localStorage.setItem(
      'clio.workbench-tabs.v1:workspace_1',
      JSON.stringify({
        tabs: [
          {
            id: 'knowledge:source_old',
            kind: 'knowledge',
            sourceId: 'source_old',
            label: 'Field study · Knowledge',
          },
        ],
        activeTabId: 'knowledge:source_old',
      }),
    );
    const handle = createRef<ClioWorkbenchHandle>();
    render(
      <ClioWorkbench
        ref={handle}
        artifacts={[]}
        diffs={[]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        sessionId=""
        sessionView={<p>Session</p>}
        workspaceId="workspace_1"
      />,
    );
    expect(screen.getByRole('tab', { name: 'Field study' })).toBeVisible();
    await act(async () =>
      handle.current?.open({ kind: 'knowledge', sourceId: 'source_new', label: 'Research notes' }),
    );
    expect(screen.getByRole('tab', { name: 'Research notes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('tab', { name: / · Knowledge/ })).not.toBeInTheDocument();
  });
});
