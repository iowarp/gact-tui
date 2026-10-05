import type { A2UISurface, ContentSelection } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, useState } from 'react';
import { LayersIcon } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { createSelectionActionRegistry } from '@/lib/selection-actions';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { SurfaceAttentionContext, SurfaceAttentionProvider } from './attention-selection';

const mocks = vi.hoisted(() => ({ endpoint: 'http://clio-a', token: 'one', bind: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ attentionSurfaceSelection: mocks.bind }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: mocks }),
}));
afterEach(() => {
  cleanup();
  mocks.bind.mockReset();
  mocks.token = 'one';
});

const surface: A2UISurface = {
  id: 'surface',
  session_id: 's',
  part_id: 'p',
  catalog_id: 'catalog',
  protocol_version: '0.9.1',
  revision: 4,
  state: 'ready',
  messages: [],
};
const ref: ContentSelection = {
  session_id: 's',
  message_id: 'authoritative-message',
  part_id: 'p',
  field: 'content',
  content_revision: 'part-digest',
  surface: { surface_id: 'surface', component_id: 'table', revision: 4, sha256: 'a'.repeat(64) },
  selection: {
    kind: 'structured',
    surface_id: 'surface',
    component_id: 'table',
    source_ref: 'a2ui://surface/table',
    keys: ['["id","a"]'],
  },
};

function SelectRow() {
  const attention = useContext(SurfaceAttentionContext);
  const [error, setError] = useState('');
  return (
    <>
      <button
        onClick={() =>
          void attention
            ?.structured('table', { selection: { field: 'id', values: ['a'] } }, 'A')
            .catch((cause: Error) => setError(cause.message))
        }
      >
        Select row
      </button>
      <output>{error}</output>
    </>
  );
}

function setup() {
  const registry = createSelectionActionRegistry();
  const run = vi.fn();
  registry.register({
    id: 'attention-set',
    label: 'Attention',
    icon: LayersIcon,
    order: 31,
    kinds: ['transcript-content'],
    run,
  });
  const view = () => (
    <SelectionActionsContext.Provider value={registry}>
      <SurfaceAttentionProvider surface={surface}>
        <SelectRow />
      </SurfaceAttentionProvider>
    </SelectionActionsContext.Provider>
  );
  return { run, view, ...render(view()) };
}

it('uses the authoritative message identity and retains the exact view revision', async () => {
  mocks.bind.mockResolvedValue(ref);
  const { run } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
  await waitFor(() =>
    expect(run).toHaveBeenCalledWith({ kind: 'transcript-content', reference: ref, text: 'A' }),
  );
  expect(mocks.bind).toHaveBeenCalledWith(
    's',
    'surface',
    expect.objectContaining({ revision: 4, component_id: 'table' }),
    expect.any(AbortSignal),
  );
});

it('rejects a reference for a different revision or part', async () => {
  mocks.bind.mockResolvedValue({ ...ref, part_id: 'another-part' });
  const { run } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
  await screen.findByText('The returned reference belongs to another transcript part.');
  expect(run).not.toHaveBeenCalled();
});

it('discards a response after an authenticated account switch', async () => {
  let resolve: (value: ContentSelection) => void = () => undefined;
  mocks.bind.mockImplementation(
    () =>
      new Promise<ContentSelection>((done) => {
        resolve = done;
      }),
  );
  const { run, rerender, view } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Select row' }));
  const signal = mocks.bind.mock.calls[0]![3] as AbortSignal;
  mocks.token = 'two';
  rerender(view());
  expect(signal.aborted).toBe(true);
  resolve(ref);
  await screen.findByText('The connection or surface changed. Select its current view again.');
  expect(run).not.toHaveBeenCalled();
});
