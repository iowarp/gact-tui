import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EyeIcon, HistoryIcon, GitBranchIcon } from 'lucide-react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { FileViewerShell } from './file-viewer-shell';
import { DocumentViewControls } from './document-view-controls';
import { RefreshAction } from './refresh-button';

const repository = vi.hoisted(() => ({ workspaces: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://agent.test' } }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function DocumentControls({ refresh }: { refresh: () => Promise<void> }) {
  const [view, setView] = useState('preview');
  return (
    <Tabs value={view} onValueChange={setView}>
      <DocumentViewControls markdown value={view} onChange={setView} />
      <RefreshAction secondary label="Refresh document revision" onRefresh={refresh} />
      <TabsContent value="preview">Rendered file</TabsContent>
      <TabsContent value="raw">Exact source</TabsContent>
    </Tabs>
  );
}

function viewer(refresh = vi.fn(async () => {})) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FileViewerShell
        source={{
          kind: 'workspace',
          workspaceId: 'ws',
          path: 'notes.md',
          mediaType: 'text/markdown',
        }}
        hasDocumentActions
        tabs={[
          {
            value: 'preview',
            label: 'Preview',
            icon: EyeIcon,
            content: <DocumentControls refresh={refresh} />,
          },
          {
            value: 'versions',
            label: 'Versions',
            icon: HistoryIcon,
            secondary: true,
            content: <p>Recorded versions</p>,
          },
          {
            value: 'lineage',
            label: 'Lineage',
            icon: GitBranchIcon,
            content: <p>Recorded lineage</p>,
          },
        ]}
      />
    </QueryClientProvider>,
  );
}

it('keeps one place for secondary actions while retaining primary read/source controls', async () => {
  const user = userEvent.setup();
  viewer();
  for (const name of [
    'File information',
    'View file fullscreen',
    'Refresh document revision',
    'Document actions',
  ])
    expect(screen.queryByRole('button', { name })).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Versions' })).toBeNull();
  expect(screen.getByRole('tab', { name: 'Lineage' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Source' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'File actions' }));
  expect(screen.getAllByRole('menuitemcheckbox', { name: 'Versions' })).toHaveLength(1);
  expect(screen.queryByRole('menuitemcheckbox', { name: 'Lineage' })).toBeNull();
  for (const name of [
    'File information',
    'View file fullscreen',
    'Refresh document revision',
    'Copy to another workspace',
  ])
    expect(screen.getAllByRole('menuitem', { name })).toHaveLength(1);
});

it('opens secondary file views with accessible names and returns to the preview', async () => {
  const user = userEvent.setup();
  viewer();
  const more = screen.getByRole('button', { name: 'File actions' });
  more.focus();
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Versions' }));
  expect(screen.getByRole('tabpanel', { name: 'Versions' })).toHaveTextContent('Recorded versions');
  expect(more).toHaveFocus();
  await user.click(more);
  expect(screen.getByRole('menuitemcheckbox', { name: 'Versions' })).toBeChecked();
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('tab', { name: 'Lineage' }));
  expect(screen.getByRole('tabpanel', { name: 'Lineage' })).toHaveTextContent('Recorded lineage');
  await user.click(screen.getByRole('tab', { name: 'Read document' }));
  expect(screen.getByText('Rendered file')).toBeVisible();
});

it('keeps focus in the frame when ⇧V or ⇧L replaces the focused view', async () => {
  const user = userEvent.setup();
  // The mode keys answer only while the frame is laid out; jsdom lays out nothing.
  const original = Element.prototype.getClientRects;
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return this instanceof HTMLElement && this.dataset.slot === 'file-viewer'
      ? ([{ x: 0, y: 0, width: 800, height: 600 }] as unknown as DOMRectList)
      : original.call(this);
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FileViewerShell
        source={{
          kind: 'workspace',
          workspaceId: 'ws',
          path: 'notes.md',
          mediaType: 'text/markdown',
        }}
        tabs={[
          {
            value: 'preview',
            label: 'Preview',
            icon: EyeIcon,
            content: <DocumentControls refresh={vi.fn(async () => {})} />,
          },
        ]}
        lineage={<p>Recorded lineage</p>}
      />
    </QueryClientProvider>,
  );
  const panelWith = (text: string) => screen.getByText(text).closest('[role="tabpanel"]');
  // The renderer's own panel, around the document's Rendered/Source panels, is the file.
  const host = panelWith('Rendered file')?.parentElement?.closest('[role="tabpanel"]');
  expect(host).toHaveAccessibleName('notes.md');
  act(() => (panelWith('Rendered file') as HTMLElement).focus());
  await user.keyboard('{Control>}{Shift>}V{/Shift}{/Control}');
  expect(screen.getByText('Exact source')).toBeVisible();
  // Focus lands on the mode's own panel, so it is announced as Source, not "Preview".
  await waitFor(() => expect(document.activeElement).toBe(panelWith('Exact source')));
  expect(document.activeElement).toHaveAccessibleName('Source');
  await user.keyboard('{Control>}{Shift>}L{/Shift}{/Control}');
  await waitFor(() => expect(document.activeElement).toBe(panelWith('Recorded lineage')));
  await user.keyboard('{Control>}{Shift>}L{/Shift}{/Control}');
  await waitFor(() => expect(document.activeElement).toBe(panelWith('Exact source')));
  await user.keyboard('{Control>}{Shift>}V{/Shift}{/Control}');
  expect(screen.getByText('Rendered file')).toBeVisible();
  await waitFor(() => expect(document.activeElement).toBe(panelWith('Rendered file')));
  expect(document.activeElement).toHaveAccessibleName('Read document');
});

it('keeps refresh progress observable after moving it out of the toolbar', async () => {
  const user = userEvent.setup();
  let finish!: () => void;
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  viewer(refresh);
  const more = screen.getByRole('button', { name: 'File actions' });
  await user.click(more);
  await user.click(screen.getByRole('menuitem', { name: 'Refresh document revision' }));
  await waitFor(() => expect(more).toHaveAttribute('aria-busy', 'true'));
  expect(refresh).toHaveBeenCalledOnce();
  await act(async () => finish());
  await waitFor(() => expect(more).toHaveAttribute('aria-busy', 'false'));
  expect(screen.queryByRole('button', { name: 'Refresh document revision' })).toBeNull();
});
