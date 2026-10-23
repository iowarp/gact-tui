import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { LoadingFeedback, LoadingFailure } from './loading-feedback';
import { useTableQueryRows } from './table-query-rows';

const repository = vi.hoisted(() => ({ artifactTableQuery: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('announces busy states and uses determinate progress only when supplied', () => {
  const view = render(<LoadingFeedback label="Loading observations…" variant="skeleton" />);
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  view.rerender(<LoadingFeedback label="Uploading observations: 40%" progress={40} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
});

it('offers an actionable failure rather than an empty state', async () => {
  const retry = vi.fn();
  render(
    <LoadingFailure title="Table unavailable" detail="Connection interrupted" onRetry={retry} />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Connection interrupted');
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
});

it('retains cached rows during refresh, reports settled empty results, and can retry a failed request', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const page = (values: number[]) => ({
    schema: [],
    downsample: { mode: 'none' },
    columns: { value: values },
    returnedRows: values.length,
    totalRows: values.length,
    truncated: false,
  });
  repository.artifactTableQuery.mockResolvedValueOnce(page([3]));
  const { result } = renderHook(
    () =>
      useTableQueryRows({
        dataUri: 'artifact://artifact_values',
        columns: ['value'],
        data: undefined,
        dataQuery: undefined,
      }),
    { wrapper: Wrapper },
  );
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.rows).toEqual([{ value: 3 }]));
  let finish!: (value: ReturnType<typeof page>) => void;
  repository.artifactTableQuery.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  act(() => result.current.retry?.());
  await waitFor(() => expect(result.current.refreshing).toBe(true));
  expect(result.current.rows).toEqual([{ value: 3 }]);
  expect(result.current.loading).toBe(false);
  act(() => finish(page([])));
  await waitFor(() => expect(result.current.rows).toEqual([]));
  expect(result.current.loading).toBe(false);
  expect(result.current.refreshing).toBe(false);
  expect(result.current.error).toBe('');
  repository.artifactTableQuery.mockRejectedValue(new Error('Disconnected'));
  act(() => result.current.retry?.());
  await waitFor(() => expect(result.current.error).toBe('Disconnected'), { timeout: 5000 });
  repository.artifactTableQuery.mockResolvedValue(page([4]));
  act(() => result.current.retry?.());
  await waitFor(() => expect(result.current.rows).toEqual([{ value: 4 }]));
  client.clear();
});
