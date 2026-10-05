import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayersIcon } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSelectionActionRegistry } from '@/lib/selection-actions';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { TranscriptContentPicker } from './transcript-content-picker';

const mocks = vi.hoisted(() => ({ content: vi.fn(), token: 'one' }));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ attentionContent: mocks.content }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio', token: mocks.token } }),
}));
const row = {
  reference: {
    session_id: 's',
    message_id: 'm',
    part_id: 'result-1',
    field: 'result',
    call_id: 'call-1',
    content_revision: 'digest',
    selection: { kind: 'whole' },
  },
  kind: 'tool_result',
  label: 'Tool result',
  preview: 'Recorded evidence',
  characters: 17,
  coordinate_support: 'text',
};
beforeEach(() => {
  mocks.token = 'one';
  mocks.content.mockResolvedValue({ items: [row], next_cursor: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('uses server identities for collapsed tool fields and closes on authenticated connection change', async () => {
  const user = userEvent.setup();
  const registry = createSelectionActionRegistry();
  const run = vi.fn();
  registry.register({
    id: 'attention-set',
    label: 'Add to attention set',
    icon: LayersIcon,
    order: 1,
    kinds: ['transcript-content'],
    run,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <QueryClientProvider client={client}>
      <SelectionActionsContext.Provider value={registry}>
        <TranscriptContentPicker sessionId="s" messageId="m" />
      </SelectionActionsContext.Provider>
    </QueryClientProvider>
  );
  const mounted = render(view());
  await user.click(screen.getByRole('button', { name: 'Select content for attention' }));
  await user.click(await screen.findByRole('button', { name: /^Add$/ }));
  expect(run).toHaveBeenCalledWith({
    kind: 'transcript-content',
    reference: row.reference,
    text: 'Tool result: Recorded evidence',
  });
  expect(screen.getByRole('button', { name: 'Added' })).toBeDisabled();
  mocks.token = 'two';
  mounted.rerender(view());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('explains unavailable image coordinates and does not claim a rejected selection was added', async () => {
  const user = userEvent.setup();
  const registry = createSelectionActionRegistry();
  registry.register({
    id: 'attention-set',
    label: 'Add',
    icon: LayersIcon,
    order: 1,
    kinds: ['transcript-content'],
    run: () => false,
  });
  mocks.content.mockResolvedValue({
    items: [
      {
        ...row,
        kind: 'image',
        label: 'Image',
        explanation: 'No captured image patches.',
        coordinate_support: 'unavailable',
      },
    ],
    next_cursor: null,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SelectionActionsContext.Provider value={registry}>
        <TranscriptContentPicker sessionId="s" messageId="m" />
      </SelectionActionsContext.Provider>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Select content for attention' }));
  await user.click(await screen.findByRole('button', { name: 'Mapping availability for Image' }));
  await waitFor(() =>
    expect(screen.getByRole('tooltip')).toHaveTextContent('No captured image patches.'),
  );
  await user.click(screen.getByRole('button', { name: /^Add$/ }));
  expect(screen.queryByRole('button', { name: 'Added' })).not.toBeInTheDocument();
});
