import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
import { ClioObservabilityDock } from './observability-dock';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('toggles the conversation rail with the conversation-runs shortcut', async () => {
  const user = userEvent.setup();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ClioObservabilityDock
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        messages={[]}
        processes={[]}
        runs={[]}
        subagents={[]}
        tasks={[]}
        tools={[]}
      />
    </QueryClientProvider>,
  );

  expect(screen.queryByRole('region', { name: 'This conversation' })).not.toBeInTheDocument();
  await user.keyboard('{Control>}.{/Control}');
  expect(screen.getByRole('region', { name: 'This conversation' })).toBeVisible();
  await user.keyboard('{Control>}.{/Control}');
  expect(screen.queryByRole('region', { name: 'This conversation' })).not.toBeInTheDocument();
});
