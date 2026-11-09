import type { WorkspaceReference } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createRef, type Ref } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useActiveOption } from './composer-reference-controller-active-option';
import { ClioComposerReferenceMenu, type ReferenceMenuHandle } from './composer-references';

const ENDPOINT = 'http://clio.test';
const files: WorkspaceReference[] = Array.from({ length: 40 }, (_, index) => ({
  kind: 'workspace_file',
  id: `data/file-${index}.csv`,
  label: `file-${index}.csv`,
  detail: `data/file-${index}.csv (10 bytes)`,
  media_type: 'text/csv',
  revision: '1',
  navigation: { path: `data/file-${index}.csv` },
}));

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    workspaceReferences: vi.fn(async (_id: string, options: { kinds?: readonly string[] }) =>
      options.kinds?.includes('workspace_file') ? files : [],
    ),
  }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: ENDPOINT } }),
}));

afterEach(cleanup);

/** Stands in for the composer: counts its renders and reads the published highlight. */
const onSelect = vi.fn();
const onDismiss = vi.fn();
const onRestoreFocus = vi.fn();

function Host({ handle, onRender }: { handle: Ref<ReferenceMenuHandle>; onRender: () => void }) {
  onRender();
  return (
    <>
      <ActiveOptionProbe />
      <ClioComposerReferenceMenu
        handleRef={handle}
        onDismiss={onDismiss}
        onRestoreFocus={onRestoreFocus}
        onSelect={onSelect}
        popoverId="refs"
        query=""
        searchInput={false}
        workspaceId="workspace_1"
      />
    </>
  );
}

function ActiveOptionProbe() {
  return <output data-testid="active-option">{useActiveOption('refs') ?? ''}</output>;
}

describe('composer reference menu cost', () => {
  it('mounts the visible rows first and moves its highlight without re-rendering the composer', async () => {
    const client = new QueryClient();
    // An `@` typed after the inventory was listed once: the files come from the cache.
    client.setQueryData(
      queryKeys.workspaceReferences(ENDPOINT, 'workspace_1', '', 'workspace_file'),
      files,
    );
    const handle = createRef<ReferenceMenuHandle>();
    const hostRendered = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <Host handle={handle} onRender={hostRendered} />
      </QueryClientProvider>,
    );

    // The opening frame builds only what the menu can show, not all 40 rows.
    expect(screen.getAllByRole('option')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Collapse Workspace files' })).toHaveTextContent(
      '40',
    );
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(40), { timeout: 3000 });

    const hostRenders = hostRendered.mock.calls.length;
    const first = screen.getByRole('option', { name: /^file-0\.csv/ });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('active-option')).toHaveTextContent(first.id);

    act(() => {
      expect(handle.current?.move(1)).toBe(true);
    });
    const second = screen.getByRole('option', { name: /^file-1\.csv/ });
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('active-option')).toHaveTextContent(second.id);
    expect(handle.current?.active()).toEqual(files[1]);
    expect(hostRendered).toHaveBeenCalledTimes(hostRenders);

    act(() => {
      handle.current?.move(-1);
      handle.current?.move(-1);
    });
    expect(handle.current?.active()).toEqual(files[39]);
    expect(hostRendered).toHaveBeenCalledTimes(hostRenders);
  });
});
