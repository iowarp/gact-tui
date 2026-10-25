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
afterEach(cleanup);

function DocumentControls({ refresh }: { refresh: () => Promise<void> }) {
  const [view, setView] = useState('preview');
  return (
    <Tabs value={view} onValueChange={setView}>
      <DocumentViewControls markdown reviewCount={2} value={view} onChange={setView} />
      <RefreshAction secondary label="Refresh document revision" onRefresh={refresh} />
      <TabsContent value="preview">Rendered file</TabsContent>
      <TabsContent value="raw">Exact source</TabsContent>
      <TabsContent value="reviews">Recorded reviews</TabsContent>
      <TabsContent value="policy">Safety details</TabsContent>
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
  for (const name of ['Versions', 'Reviews, 2', 'Document safety'])
    expect(screen.queryByRole('tab', { name })).toBeNull();
  expect(screen.getByRole('tab', { name: 'Lineage' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Source' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'File actions' }));
  for (const name of ['Versions', 'Reviews, 2', 'Document safety'])
    expect(screen.getAllByRole('menuitemcheckbox', { name })).toHaveLength(1);
  expect(screen.queryByRole('menuitemcheckbox', { name: 'Lineage' })).toBeNull();
  for (const name of [
    'File information',
    'View file fullscreen',
    'Refresh document revision',
    'Copy to another workspace',
  ])
    expect(screen.getAllByRole('menuitem', { name })).toHaveLength(1);
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Reviews, 2' }));
  expect(screen.getByText('Recorded reviews')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'File actions' }));
  expect(screen.getByRole('menuitemcheckbox', { name: 'Reviews, 2' })).toBeChecked();
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
  await user.click(screen.getByRole('tab', { name: 'Preview' }));
  expect(screen.getByText('Rendered file')).toBeVisible();
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
