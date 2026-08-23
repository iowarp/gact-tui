import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  hooks: vi.fn().mockResolvedValue({
    backend: 'declarative',
    enabled: true,
    hooks: [],
    recent_invocations: [],
  }),
  memoryStatistics: vi.fn().mockResolvedValue({
    cache: { hits: 3, misses: 1, hit_rate: 0.75, capacity: 1000 },
    global: { conversations_total: 8, invocations_total: 21 },
    metadata: {},
  }),
  runtimeMetrics: vi.fn().mockResolvedValue({
    uptime_s: 90,
    sessions: { total: 4, active: 1, by_status: {} },
    messages: { total: 42, by_role: {} },
    tokens: { input_total: 100, output_total: 20, cache_read_total: 0, cache_write_total: 0 },
    cost: { total_usd: 0, by_provider: {} },
    latencies: {},
  }),
  serviceHealth: vi.fn().mockResolvedValue({
    healthy: false,
    uptime_s: 90,
    overall_status: 'degraded',
    integrations: [
      {
        name: 'cte_cold_tier_disk',
        status: 'degraded',
        summary: 'Stored memory is nearing its configured capacity.',
        next_action: 'Archive older workspace data.',
      },
    ],
    tool_hooks_installed: true,
  }),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { SystemSettings } from './settings-operations';

afterEach(cleanup);

function renderQuery(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

describe('administration settings', () => {
  it('turns reported health and metrics into task-oriented labels', async () => {
    const user = userEvent.setup();
    renderQuery(<SystemSettings />);

    expect(await screen.findByText('Stored memory capacity')).toBeInTheDocument();
    expect(screen.getByText('degraded')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(await screen.findByText('42')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Memory' }));
    expect(await screen.findByText('75%')).toBeInTheDocument();
  });
});
