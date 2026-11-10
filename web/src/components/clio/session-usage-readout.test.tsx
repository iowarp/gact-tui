import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionUsageReadout } from './session-usage-readout';

const { repository } = vi.hoisted(() => ({ repository: { fleet: vi.fn() } }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'test' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const spend = (tokens: number, cost_usd: number) => ({
  tokens_input: tokens,
  tokens_cached: 0,
  tokens_output: 0,
  tokens,
  cost_usd,
  turns_without_cost: 0,
  turns: 1,
});

function fleet(windows: Array<{ name: string; used_percent: number }>) {
  return {
    accounts: [
      {
        id: 'anthropic',
        label: 'Anthropic API',
        health: 'ready',
        usage: {
          account: 'anthropic',
          state: 'metered',
          observed_at: '2026-09-01T14:58:00Z',
          source: 'headers',
          windows: windows.map((window) => ({ ...window, resets_at: '' })),
          balance: null,
          status: '',
          read_failure: '',
        },
        usage_missing_reason: '',
      },
    ],
    session: {
      model: { provider_id: 'anthropic', model_id: 'claude-sonnet' },
      spend_by_model: {
        'anthropic/claude-sonnet': spend(40_000, 0.12),
        'openai/gpt-mini': spend(8_000, 0.004),
      },
    },
  };
}

function renderReadout() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route
            path="/"
            element={
              <SessionUsageReadout
                sessionId="s1"
                usage={{ session_id: 's1', input_tokens: 30_000, output_tokens: 10_000 }}
              />
            }
          />
          <Route path="/settings/usage" element={<h1>Usage settings page</h1>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

it('names a window at 80% in the rail and shows the account, windows and delegated spend on hover', async () => {
  repository.fleet.mockResolvedValue(
    fleet([
      { name: '5-hour', used_percent: 86 },
      { name: 'Weekly', used_percent: 41 },
    ]),
  );
  const user = renderReadout();
  const trigger = await screen.findByRole('button', {
    name: 'Account usage: 5-hour 86%, near limit',
  });
  await user.hover(trigger);
  const card = await screen.findByRole('group', {
    name: "Usage for this conversation's account",
  });
  expect(within(card).getByText('Anthropic API')).toBeVisible();
  expect(within(card).getByText('86% used, near limit')).toBeVisible();
  expect(within(card).getByText('41% used')).toBeVisible();
  expect(within(card).getByText('gpt-mini')).toBeVisible();
  expect(within(card).getByText('8k tokens, under $0.01')).toBeVisible();
});

it('opens from the keyboard, reaches Usage settings and closes on Escape', async () => {
  repository.fleet.mockResolvedValue(fleet([{ name: 'Weekly', used_percent: 41 }]));
  const user = renderReadout();
  const trigger = await screen.findByRole('button', { name: 'Account usage: 41% used' });
  trigger.focus();
  await user.keyboard('{ArrowDown}');
  const card = await screen.findByRole('group', {
    name: "Usage for this conversation's account",
  });
  const link = within(card).getByRole('link', { name: 'Usage settings' });
  await vi.waitFor(() => expect(link).toHaveFocus());
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  await vi.waitFor(() => expect(screen.queryByRole('group')).toBeNull());

  await user.click(trigger);
  await user.click(await screen.findByRole('link', { name: 'Usage settings' }));
  expect(await screen.findByRole('heading', { name: 'Usage settings page' })).toBeVisible();
});
