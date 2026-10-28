import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { attentionProfileSchema } from '@clio/core/v3';
import { AttentionPromptMap } from './attention-prompt-map';

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
const line = (index: number, text: string, levels: number[], domain: string) => ({
  index,
  text,
  token_lo: index,
  token_hi: index + 1,
  section: 0,
  domain,
  values: levels.map((level) => level / 9),
  levels,
});
const items = {
  schema: 'clio.attention.items.v1',
  available: true,
  message_id: 'm',
  request_id: 'r',
  tokenizer: 'ibm-granite/granite-4.2-30b',
  profile,
  profile_revision: 'x',
  prompt_tokens: 4,
  top_pct: 10,
  ramp: ' .:-=+*#%@',
  items: [
    {
      index: 0,
      text: 'NIL 373',
      message_id: 'm',
      part_id: 'p',
      field: 'text',
      start: 8,
      end: 15,
      decode_steps: [2, 3, 4],
      column_max: 1,
      score_max: 1,
    },
    {
      index: 1,
      text: 'DIVERGES',
      message_id: 'm',
      part_id: 'p',
      field: 'text',
      start: 17,
      end: 25,
      decode_steps: [6, 7],
      column_max: 1,
      score_max: 1,
    },
  ],
  lines: [
    line(0, 'SYSTEM', [0, 0], 'system'),
    line(1, '>>> transition_scan()', [9, 2], 'user'),
    line(2, 'nothing here', [0, 0], 'user'),
    line(3, '>>> analogue_lookup()', [1, 9], 'user'),
  ],
};
const selection = {
  kind: 'agent-answer-text' as const,
  text: 'NIL 373; DIVERGES',
  sessionId: 's',
  messageId: 'm',
  partId: 'p',
};

function open() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AttentionPromptMap selection={selection} profile={profile} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Prompt heat map/ }));
}

it('draws one ramp column per item over the heated prompt lines', async () => {
  mocks.items.mockResolvedValue(items);
  open();
  const table = await screen.findByRole('table', { name: 'Prompt heat map' });
  expect(mocks.items).toHaveBeenCalledWith(
    's',
    'm',
    { items: [{ text: 'NIL 373; DIVERGES', part_id: 'p' }], split: ';', profile },
    expect.anything(),
  );
  expect(screen.getByText('NIL 373')).toBeInTheDocument();
  expect(screen.getByText('steps 2–4')).toBeInTheDocument();
  expect(within(table).getByText('>>> transition_scan()')).toBeInTheDocument();
  expect(within(table).queryByText('nothing here')).not.toBeInTheDocument();
  expect(within(table).getAllByText('1 line without heat')).toHaveLength(2);
  expect(within(table).getByTitle('Item 1: level 9 of 9 (score 1)')).toHaveTextContent('@');
  fireEvent.click(screen.getByRole('switch'));
  expect(within(table).getByText('nothing here')).toBeInTheDocument();
});

it('re-reads with a new delimiter and downloads the reference CSV', async () => {
  mocks.items.mockResolvedValue(items);
  mocks.exportItems.mockResolvedValue({
    available: true,
    filename: 'attn.csv',
    columns: [],
    rows: 2,
    csv: 'a,b\n',
  });
  open();
  await screen.findByRole('table', { name: 'Prompt heat map' });
  fireEvent.change(screen.getByLabelText('Split items at'), { target: { value: '' } });
  await waitFor(() =>
    expect(mocks.items).toHaveBeenLastCalledWith(
      's',
      'm',
      expect.objectContaining({ split: '' }),
      expect.anything(),
    ),
  );
  await screen.findByRole('table', { name: 'Prompt heat map' });
  fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
  await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'attn.csv'));
});

it('shows the service reason verbatim when the items are unavailable', async () => {
  mocks.items.mockResolvedValue({
    available: false,
    message: 'the items were produced by different model calls',
  });
  open();
  expect(
    await screen.findByText('the items were produced by different model calls'),
  ).toBeInTheDocument();
});
