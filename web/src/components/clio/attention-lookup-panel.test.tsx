import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createSelectionActionRegistry, type SelectionTarget } from '@/lib/selection-actions';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { AttentionLookupPanel } from './attention-lookup-panel';

const mocks = vi.hoisted(() => ({ endpoint: 'http://clio-a', lookup: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ lookupAttention: mocks.lookup }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: mocks.endpoint } }),
}));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  mocks.lookup.mockReset();
  mocks.endpoint = 'http://clio-a';
});

it('retains the basket across navigation but re-reads captures on explicit inspection', async () => {
  const registry = createSelectionActionRegistry();
  const view = () => (
    <SelectionActionsContext.Provider value={registry}>
      <AttentionLookupPanel sessionId="s" />
    </SelectionActionsContext.Provider>
  );
  const first = render(view());
  act(() =>
    registry
      .actionsFor(target)
      .find((item) => item.id === 'attention-set')!
      .run(target),
  );
  first.unmount();
  render(view());
  expect(screen.getByText('Attention set · 1')).toBeVisible();
  expect(mocks.lookup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(sessionStorage.length).toBe(0);
});
const target: SelectionTarget = {
  kind: 'transcript-content',
  text: 'selected source',
  reference: {
    session_id: 's',
    message_id: 'm',
    part_id: 'p',
    field: 'text',
    content_revision: 'revision',
    selection: { kind: 'text', start: 3, end: 9 },
  },
};

it('deduplicates selections and sends the exact source reference and requested direction', async () => {
  mocks.lookup.mockResolvedValue({ available: false, message: 'No captured image patches.' });
  const registry = createSelectionActionRegistry();
  render(
    <SelectionActionsContext.Provider value={registry}>
      <AttentionLookupPanel sessionId="s" />
    </SelectionActionsContext.Provider>,
  );
  const add = () =>
    registry
      .actionsFor(target)
      .find((item) => item.id === 'attention-set')!
      .run(target);
  act(add);
  act(add);
  expect(screen.getByText('Attention set · 1')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Trace later use' }));
  await waitFor(() =>
    expect(mocks.lookup).toHaveBeenCalledWith(
      's',
      {
        selections: [target.reference],
        direction: 'source_to_generation',
        cursor: 0,
      },
      expect.any(AbortSignal),
    ),
  );
  expect(await screen.findByText('No captured image patches.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByRole('region', { name: 'Attention inspector' })).not.toBeInTheDocument();
});

it('aborts and clears the basket when the connected CLIO changes', async () => {
  mocks.lookup.mockImplementation(() => new Promise(() => {}));
  const registry = createSelectionActionRegistry();
  const view = () => (
    <SelectionActionsContext.Provider value={registry}>
      <AttentionLookupPanel sessionId="s" />
    </SelectionActionsContext.Provider>
  );
  const { rerender } = render(view());
  act(() =>
    registry
      .actionsFor(target)
      .find((item) => item.id === 'attention-later-use')!
      .run(target),
  );
  await waitFor(() => expect(mocks.lookup).toHaveBeenCalledOnce());
  const signal = mocks.lookup.mock.calls[0]![2] as AbortSignal;
  mocks.endpoint = 'http://clio-b';
  rerender(view());
  expect(signal.aborted).toBe(true);
  expect(screen.queryByRole('region', { name: 'Attention inspector' })).not.toBeInTheDocument();
});
