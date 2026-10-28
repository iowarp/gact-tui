import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { attentionProfileSchema } from '@clio/core/v3';
import { AttentionItemChips } from './attention-item-chips';

const mocks = vi.hoisted(() => ({ items: vi.fn(), exportItems: vi.fn(), download: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    getAttentionItems: mocks.items,
    exportAttentionItems: mocks.exportItems,
  }),
}));
vi.mock('./surface-export', () => ({ downloadBlob: mocks.download }));
afterEach(() => {
  cleanup();
  mocks.items.mockReset();
  mocks.exportItems.mockReset();
  mocks.download.mockReset();
});

const profile = attentionProfileSchema.parse({});
const item = (index: number, text: string, start: number, steps: number[]) => ({
  index,
  text,
  message_id: 'm',
  part_id: 'p',
  field: 'text',
  start,
  end: start + text.length,
  decode_steps: steps,
  column_max: 1,
  score_max: 1,
});
const items = {
  schema: 'clio.attention.items.v1',
  available: true,
  message_id: 'm',
  request_id: 'r',
  tokenizer: 'ibm-granite/granite-4.2-8b',
  profile,
  profile_revision: 'x',
  prompt_tokens: 4,
  top_pct: 10,
  ramp: ' .:-=+*#%@',
  items: [item(0, 'ANSWER: 73', 0, [2, 3, 4]), item(1, 'MATCHES', 12, [6, 7])],
  lines: [],
};
const selection = {
  kind: 'agent-answer-text' as const,
  text: 'ANSWER: 73; MATCHES',
  sessionId: 's',
  messageId: 'm',
  partId: 'p',
};

function show(onFocus = vi.fn(), focus?: Parameters<typeof AttentionItemChips>[0]['focus']) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AttentionItemChips selection={selection} profile={profile} focus={focus} onFocus={onFocus} />
    </QueryClientProvider>,
  );
  return onFocus;
}

it('offers each answer item and focuses the transcript heat on the one chosen', async () => {
  mocks.items.mockResolvedValue(items);
  const onFocus = show();
  const second = await screen.findByRole('button', { name: /MATCHES/ });
  expect(mocks.items).toHaveBeenCalledWith(
    's',
    'm',
    { items: [{ text: 'ANSWER: 73; MATCHES', part_id: 'p' }], split: ';' },
    expect.anything(),
  );
  expect(screen.getByRole('button', { name: 'Whole selection' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(second);
  expect(onFocus).toHaveBeenCalledWith({
    index: 1,
    span: { text: 'MATCHES', part_id: 'p', field: 'text', start: 12, end: 19 },
  });
});

it('marks the focused item and returns to the whole selection', async () => {
  mocks.items.mockResolvedValue(items);
  const onFocus = show(vi.fn(), { index: 0, span: { text: 'ANSWER: 73' } });
  expect(await screen.findByRole('button', { name: /ANSWER: 73/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Whole selection' }));
  expect(onFocus).toHaveBeenCalledWith(undefined);
});

it('downloads the reference CSV with the applied profile', async () => {
  mocks.items.mockResolvedValue(items);
  mocks.exportItems.mockResolvedValue({
    available: true,
    filename: 'attn.csv',
    columns: [],
    rows: 2,
    csv: 'a,b\n',
  });
  show();
  await screen.findByRole('button', { name: /MATCHES/ });
  fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
  await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'attn.csv'));
  expect(mocks.exportItems).toHaveBeenCalledWith(
    's',
    'm',
    expect.objectContaining({ split: ';', profile }),
  );
});

it('shows the service reason when the items are unavailable', async () => {
  mocks.items.mockResolvedValue({
    available: false,
    message: 'the items were produced by different model calls',
  });
  show();
  expect(
    await screen.findByText('the items were produced by different model calls'),
  ).toBeInTheDocument();
});
