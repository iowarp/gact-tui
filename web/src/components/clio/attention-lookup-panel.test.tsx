import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createSelectionActionRegistry, type SelectionTarget } from '@/lib/selection-actions';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { AttentionLookupPanel } from './attention-lookup-panel';
import { attentionProfileSchema } from '@clio/core/v3';
import { attentionEvidenceHash } from '@/lib/attention-evidence-navigation';
import { StrictMode } from 'react';

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
  window.history.replaceState({}, '', '/');
});

const profile = attentionProfileSchema.parse({});
const generated = {
  kind: 'generated',
  available: true,
  lm_call_id: 'call-1',
  capture_sha256: 'capture-1',
  request_id: 'request-1',
  profile_revision: 'profile-1',
  profile,
  message_id: 'm',
  selection: { part_id: 'p', field: 'text', text: 'selected' },
  selected_steps: [1, 2],
  blocks: [],
  selected_references: [],
};
const lookup = {
  available: true,
  profile,
  profile_revision: 'profile-1',
  views: [generated],
  unavailable: [],
  next_cursor: null,
};

it('shows the chosen capture heat and removes it when the selection is cleared', async () => {
  mocks.lookup.mockResolvedValue(lookup);
  const registry = createSelectionActionRegistry();
  const heat = vi.fn();
  render(
    <SelectionActionsContext.Provider value={registry}>
      <AttentionLookupPanel sessionId="s" onHeatChange={heat} />
    </SelectionActionsContext.Provider>,
  );
  act(() =>
    registry
      .actionsFor(target)
      .find((item) => item.id === 'attention-set')!
      .run(target),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Inspect sources' }));
  await screen.findByText('Generated selection · 2 captured tokens');
  fireEvent.click(screen.getByText('Generated selection · 2 captured tokens'));
  fireEvent.click(screen.getByRole('button', { name: 'Show transcript heat' }));
  expect(heat).toHaveBeenLastCalledWith(generated);
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(heat).toHaveBeenLastCalledWith(undefined);
});

it.each([true, false])(
  'restores the referenced capture and refuses a different result: match=%s',
  async (matches) => {
    const inspection = {
      schema_version: 1 as const,
      selections: [target.reference!],
      direction: 'generated_to_source' as const,
      profile,
      profile_revision: 'profile-1',
      lm_call_id: 'call-1',
      capture_sha256: matches ? 'capture-1' : 'unavailable-capture',
    };
    window.history.replaceState(
      {},
      '',
      attentionEvidenceHash(target.reference!, 'profile-1', inspection),
    );
    mocks.lookup.mockResolvedValue(lookup);
    const heat = vi.fn();
    render(
      <StrictMode>
        <SelectionActionsContext.Provider value={createSelectionActionRegistry()}>
          <AttentionLookupPanel sessionId="s" onHeatChange={heat} />
        </SelectionActionsContext.Provider>
      </StrictMode>,
    );
    await waitFor(() =>
      expect(mocks.lookup).toHaveBeenCalledWith(
        's',
        expect.objectContaining({
          lm_call_id: 'call-1',
          profile,
          selections: inspection.selections.map((reference) => expect.objectContaining(reference)),
        }),
        expect.any(AbortSignal),
      ),
    );
    if (matches) {
      await waitFor(() => expect(heat).toHaveBeenLastCalledWith(generated));
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(heat).toHaveBeenLastCalledWith(undefined);
      expect(window.location.hash).toBe('');
      window.history.replaceState(
        {},
        '',
        attentionEvidenceHash(target.reference!, 'profile-1', inspection),
      );
      act(() => window.dispatchEvent(new Event('clio:inspect-attention')));
      await waitFor(() => expect(heat).toHaveBeenLastCalledWith(generated));
    } else {
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'referenced capture or aggregation profile is unavailable',
      );
      expect(heat).not.toHaveBeenCalledWith(generated);
    }
  },
);

it('does not resurrect an old evidence link after clearing and remounting with new selections', async () => {
  const inspection = {
    schema_version: 1 as const,
    selections: [target.reference!],
    direction: 'generated_to_source' as const,
    profile,
    profile_revision: 'profile-1',
    lm_call_id: 'call-1',
    capture_sha256: 'capture-1',
  };
  window.history.replaceState(
    {},
    '',
    attentionEvidenceHash(target.reference!, 'profile-1', inspection),
  );
  mocks.lookup.mockResolvedValue(lookup);
  const registry = createSelectionActionRegistry();
  const content = (
    <SelectionActionsContext.Provider value={registry}>
      <AttentionLookupPanel sessionId="s" />
    </SelectionActionsContext.Provider>
  );
  const mounted = render(content);
  await screen.findByText('Generated selection · 2 captured tokens');
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  const next = {
    ...target,
    text: 'New source',
    reference: { ...target.reference!, part_id: 'new-part' },
  };
  act(() =>
    registry
      .actionsFor(next)
      .find((item) => item.id === 'attention-set')!
      .run(next),
  );
  mounted.unmount();
  mocks.lookup.mockClear();
  render(content);
  expect(screen.getByText('New source')).toBeInTheDocument();
  expect(screen.queryByText('Evidence · text')).toBeNull();
  expect(mocks.lookup).not.toHaveBeenCalled();
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
const target = {
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
} satisfies SelectionTarget;

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
