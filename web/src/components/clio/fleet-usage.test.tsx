import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { SpendSummary, UsageSummary } from './fleet-usage';
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

it('shows recorded spend separately from unavailable account limits', () => {
  render(
    <>
      <UsageSummary missingReason="not_supported" mode="used" snapshot={null} />
      <SpendSummary
        spend={{
          tokens_input: 40_000,
          tokens_cached: 0,
          tokens_output: 0,
          tokens: 40_000,
          cost_usd: 0.005,
          turns: 1,
          turns_without_cost: 0,
        }}
      />
    </>,
  );
  expect(screen.getByText('Account limits unavailable for this connection')).toBeVisible();
  expect(screen.queryByText(/first call/)).not.toBeInTheDocument();
  expect(screen.getByText('40k tokens')).toBeVisible();
  expect(screen.getByText('under $0.01')).toHaveClass('whitespace-nowrap');
});

it('opens usage settings directly from the conversation usage hover', async () => {
  repository.fleet.mockResolvedValue({
    accounts: [
      {
        id: 'anthropic',
        label: 'Anthropic API',
        usage: null,
        usage_missing_reason: 'not_supported',
      },
    ],
    session: { model: { provider_id: 'anthropic' }, spend_by_model: {} },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/" element={<SessionUsageReadout sessionId="s1" tokens={40_000} />} />
          <Route path="/settings/usage" element={<h1>Usage settings page</h1>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.hover(screen.getByRole('button', { name: /usage/i }));
  await user.click(await screen.findByRole('link', { name: 'Usage settings' }));
  expect(await screen.findByRole('heading', { name: 'Usage settings page' })).toBeVisible();
});
