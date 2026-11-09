import type { A2UISurface } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AttentionAvailabilityContext,
  hasAttentionCaptures,
  type SessionAttentionCapability,
} from '@/lib/attention-availability';
import { SurfaceAttentionContext, SurfaceAttentionProvider } from '@/lib/a2ui/attention-selection';
import { createSelectionActionRegistry } from '@/lib/selection-actions';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { AttentionLookupPanel } from './attention-lookup-panel';
import { TranscriptContentPicker } from './transcript-content-picker';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), content: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ lookupAttention: mocks.lookup, attentionContent: mocks.content }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://local-clio' } }),
}));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

const target = {
  kind: 'transcript-content' as const,
  text: 'Recorded answer',
  reference: {
    session_id: 's',
    message_id: 'm',
    part_id: 'p',
    content_revision: 'digest',
    selection: { kind: 'whole' as const },
  },
};
const surface: A2UISurface = {
  id: 'surface',
  session_id: 's',
  part_id: 'p',
  catalog_id: 'catalog',
  protocol_version: '0.9.1',
  revision: 1,
  state: 'ready',
  messages: [],
};
function SurfaceCapability() {
  const attention = useContext(SurfaceAttentionContext);
  return <output>{attention ? 'Surface attention available' : 'Surface attention hidden'}</output>;
}
function setup(capability?: SessionAttentionCapability) {
  const registry = createSelectionActionRegistry();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (value = capability) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <AttentionAvailabilityContext.Provider value={value}>
          <SelectionActionsContext.Provider value={registry}>
            <AttentionLookupPanel sessionId="s" />
            <TranscriptContentPicker sessionId="s" messageId="m" />
            <SurfaceAttentionProvider surface={surface}>
              <SurfaceCapability />
            </SurfaceAttentionProvider>
          </SelectionActionsContext.Provider>
        </AttentionAvailabilityContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
  return { registry, view, ...render(view()) };
}

it.each([
  undefined,
  { sessionId: 's', available: false },
  { sessionId: 'other-session', available: true },
])('hides transcript and surface attention controls without a matching capability: %j', (value) => {
  const { registry } = setup(value);
  expect(registry.actionsFor(target)).toEqual([]);
  expect(
    screen.queryByRole('button', { name: 'Select content for attention' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Surface attention hidden')).toBeVisible();
  expect(mocks.lookup).not.toHaveBeenCalled();
  expect(mocks.content).not.toHaveBeenCalled();
});

it('removes actions and aborts an active lookup when capture availability disappears', async () => {
  mocks.lookup.mockImplementation(() => new Promise(() => undefined));
  const { registry, view, rerender } = setup({ sessionId: 's', available: true });
  expect(screen.getByRole('button', { name: 'Select content for attention' })).toBeVisible();
  expect(screen.getByText('Surface attention available')).toBeVisible();
  expect(registry.actionsFor(target).map((action) => action.id)).toEqual([
    'attention-set',
    'attention-later-use',
  ]);
  act(() => registry.actionsFor(target)[0]!.run(target));
  await waitFor(() => expect(mocks.lookup).toHaveBeenCalledOnce());
  const signal = mocks.lookup.mock.calls[0]![2] as AbortSignal;
  rerender(view({ sessionId: 's', available: false }));
  expect(signal.aborted).toBe(true);
  expect(registry.actionsFor(target)).toEqual([]);
  expect(screen.queryByRole('region', { name: 'Attention inspector' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Select content for attention' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Surface attention hidden')).toBeVisible();
});

it('requires a real captured answer even when capture configuration is enabled', () => {
  expect(hasAttentionCaptures()).toBe(false);
  expect(hasAttentionCaptures({ enabled: false, messages: { m: true } })).toBe(false);
  expect(hasAttentionCaptures({ enabled: true, messages: {} })).toBe(false);
  expect(hasAttentionCaptures({ enabled: true, messages: { m: false } })).toBe(false);
  expect(hasAttentionCaptures({ enabled: true, messages: { m: true, other: false } })).toBe(true);
});
