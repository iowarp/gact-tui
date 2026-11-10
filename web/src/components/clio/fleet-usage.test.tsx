import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SpendSummary, UsageSummary } from './fleet-usage';

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
