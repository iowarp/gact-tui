import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Split out of `a2ui-data-table-source.test.tsx` (the file-size ratchet,
 * `check_frontend_file_size.mjs`): G0's download affordances for
 * `clio.data-table.v1`, both the `dataUri` (server `table-export`) and
 * inline-rows (client-side CSV/JSON) paths. Schema, filtering, sorting and
 * selection/linking tests stay in the source file.
 */

const repository = vi.hoisted(() => ({
  artifactTableExport: vi.fn(),
  artifactTableQuery: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';
import { ClioSelectableDataTable } from './a2ui-data-table';
import { ClioComposerAnnotations } from './composer-annotations';
import { SelectionActionsProvider } from './selection-actions';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Opens the shared `SurfaceToolbar` overflow and the nested Download submenu. */
async function openDownloadMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(screen.getByRole('menuitem', { name: /Download/ }));
}

/**
 * Radix submenu/menu items track "current" via real pointer-move events,
 * which jsdom's synthetic `userEvent.click` does not generate — fire the
 * pointer sequence directly so `onSelect` actually runs.
 */
function selectMenuItem(item: HTMLElement) {
  fireEvent.pointerMove(item);
  fireEvent.click(item);
}

/** A composer stand-in, inside the provider, so "Reference this" has somewhere real to attach to. */
function ComposerAndChildren({ children }: { children: ReactNode }) {
  const [annotations, setAnnotations] = useState<readonly ComposerAnnotation[]>([]);
  useReferenceThisSelectionAction({ annotations, onAnnotationsChange: setAnnotations }, () => {});
  return (
    <>
      {children}
      <ClioComposerAnnotations
        annotations={annotations}
        onRemove={(gone) => setAnnotations(annotations.filter((item) => item !== gone))}
      />
    </>
  );
}

function WithComposer({ children }: { children: ReactNode }) {
  return (
    <SelectionActionsProvider>
      <ComposerAndChildren>{children}</ComposerAndChildren>
    </SelectionActionsProvider>
  );
}

const TEST_CATALOG_ID = 'test://a2ui-data-table-export';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);

function buildSurface(components: Record<string, unknown>[]) {
  const surfaceId = 'table-surface';
  const processor = new MessageProcessor([testCatalog], async () => undefined, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId: TEST_CATALOG_ID } },
    { version: 'v0.9.1', updateComponents: { surfaceId, components } },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('clio.data-table.v1 download (G0)', () => {
  function downloadSurface() {
    return buildSurface([
      { id: 'root', component: 'Column', children: ['table'] },
      {
        id: 'table',
        component: 'clio.data-table.v1',
        accessibility: { label: 'Earthquake table' },
        dataUri: 'artifact://artifact_events01',
        dataQuery: {
          columns: ['station', 'magnitude'],
          filter: [{ column: 'magnitude', op: 'range', value: [2, null] }],
          sort: [{ column: 'magnitude', desc: true }],
        },
      },
    ]);
  }

  it('offers CSV, JSON, and Parquet for both the current view and the full dataset', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { station: ['MTA1'], magnitude: [6.1] },
      totalRows: 1,
      matchedRows: 1,
      returnedRows: 1,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={downloadSurface()} />));
    await screen.findByRole('table');

    await openDownloadMenu(user);
    for (const label of [
      'CSV (current view)',
      'CSV (full dataset)',
      'JSON (current view)',
      'JSON (full dataset)',
      'Parquet (current view)',
      'Parquet (full dataset)',
    ]) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('exports the current view through the table-export route, with the live filter/sort — never the page limit/offset', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { station: ['MTA1'], magnitude: [6.1] },
      totalRows: 1,
      matchedRows: 1,
      returnedRows: 1,
      truncated: false,
      downsample: { mode: 'none' },
    });
    repository.artifactTableExport.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={downloadSurface()} />));
    await screen.findByRole('table');

    await openDownloadMenu(user);
    selectMenuItem(await screen.findByRole('menuitem', { name: 'CSV (current view)' }));

    await waitFor(() =>
      expect(repository.artifactTableExport).toHaveBeenCalledWith('artifact_events01', {
        aggregate: undefined,
        columns: ['station', 'magnitude'],
        downsample: undefined,
        filter: [{ column: 'magnitude', op: 'range', value: [2, null] }],
        sort: [{ column: 'magnitude', desc: true }],
        format: 'csv',
        scope: 'current',
      }),
    );
  });

  it('exports the full dataset ignoring the current filter/sort entirely', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { station: ['MTA1'], magnitude: [6.1] },
      totalRows: 1,
      matchedRows: 1,
      returnedRows: 1,
      truncated: false,
      downsample: { mode: 'none' },
    });
    repository.artifactTableExport.mockResolvedValue(new Uint8Array([4, 5, 6]));
    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={downloadSurface()} />));
    await screen.findByRole('table');

    await openDownloadMenu(user);
    selectMenuItem(await screen.findByRole('menuitem', { name: 'Parquet (full dataset)' }));

    await waitFor(() =>
      expect(repository.artifactTableExport).toHaveBeenCalledWith('artifact_events01', {
        format: 'parquet',
        scope: 'full',
      }),
    );
  });

  it('full-screens the table body while the header toolbar (with the toggle itself) stays in place', async () => {
    repository.artifactTableQuery.mockResolvedValue({
      schema: [],
      columns: { station: ['MTA1'], magnitude: [6.1] },
      totalRows: 1,
      matchedRows: 1,
      returnedRows: 1,
      truncated: false,
      downsample: { mode: 'none' },
    });
    const user = userEvent.setup();
    render(wrap(<A2uiSurface surface={downloadSurface()} />));
    await screen.findByRole('table');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('MTA1')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Exit full screen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('MTA1')).toBeInTheDocument();
  });
});

describe('clio.data-table.v1 inline rows (G0)', () => {
  const ROWS = [
    { station: 'MTA1', magnitude: 3.1 },
    { station: 'PBO2', magnitude: 4.2 },
  ];

  it('offers a client-side CSV/JSON download; never Parquet (no client-side encoder for inline rows)', async () => {
    const user = userEvent.setup();
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    render(
      <ClioSelectableDataTable
        columns={['station', 'magnitude']}
        componentId="table"
        rows={ROWS}
      />,
    );

    await openDownloadMenu(user);
    expect(await screen.findByRole('menuitem', { name: 'CSV data' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'JSON data' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /parquet/iu })).not.toBeInTheDocument();

    selectMenuItem(screen.getByRole('menuitem', { name: 'CSV data' }));
    expect(createUrl).toHaveBeenCalled();
    expect((createUrl.mock.calls.at(-1)![0] as Blob).type).toBe('text/csv');
  });

  it('shows the row count but no download or reference action for an empty inline table', async () => {
    const user = userEvent.setup();
    render(<ClioSelectableDataTable columns={['station']} componentId="table" rows={[]} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitem', { name: '0 rows' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Download/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reference this' })).not.toBeInTheDocument();
  });

  it('"Reference this" attaches the whole inline table, with no dataUri to re-query', async () => {
    const user = userEvent.setup();
    render(
      <WithComposer>
        <ClioSelectableDataTable
          accessibility={{ label: 'Station table' }}
          columns={['station', 'magnitude']}
          componentId="table"
          rows={ROWS}
        />
      </WithComposer>,
    );

    await user.click(screen.getByRole('button', { name: 'Reference this' }));

    const attached = screen.getByRole('list', { name: 'Attached selections' });
    expect(attached).toHaveTextContent('Station table');
    expect(attached).toHaveTextContent('the whole table (2 rows)');

    await user.click(screen.getByRole('button', { name: /Show the full .* reference/u }));
    const popover = await screen.findByText('Sent with your next message, exactly as shown below.');
    const popoverBody = popover.closest('[data-slot="popover-content"]') as HTMLElement;
    expect(popoverBody).toHaveTextContent('inline data');
    expect(popoverBody).toHaveTextContent('MTA1');
  });

  it('full-screens an inline table too, since it owns the affordance regardless of data source', async () => {
    const user = userEvent.setup();
    render(<ClioSelectableDataTable columns={['station']} componentId="table" rows={ROWS} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('MTA1')).toBeInTheDocument();
  });
});
