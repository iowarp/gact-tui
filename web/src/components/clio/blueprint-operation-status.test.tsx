import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BlueprintOperationStatus } from './blueprint-operation-status';
import { useBlueprintOperation } from '@/hooks/use-blueprint-operation';

const state = vi.hoisted(() => ({
  settings: { endpoint: 'http://clio.test', token: 'first' },
  blueprintOperations: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => state }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: state.settings }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.settings = { endpoint: 'http://clio.test', token: 'first' };
});
afterEach(cleanup);

function Status({ workspaceId = 'ws_a' }: { workspaceId?: string }) {
  const { operation, pending } = useBlueprintOperation({
    blueprintId: 'workspace::src_a::demo',
    workspaceId,
  });
  return (
    <>
      <button disabled={pending}>Reload</button>
      <BlueprintOperationStatus operation={operation} />
    </>
  );
}
function row(status: string) {
  return {
    id: 'reload-1',
    label: 'Reload marketplace',
    status,
    target: { source_id: 'src_a', scope: 'workspace', workspace_id: 'ws_a' },
    installed: [
      {
        id: 'demo',
        identity: 'workspace::src_a::demo',
        version: '2',
        checksum: 'abc123',
        runtime_checks: [{ namespace: 'demo', status: 'ready', tool_count: 2 }],
      },
    ],
    skipped: [],
  };
}
function view(client: QueryClient, workspaceId?: string) {
  return (
    <QueryClientProvider client={client}>
      <Status workspaceId={workspaceId} />
    </QueryClientProvider>
  );
}
it('recovers a pending Reload after remount and exposes its completed checks', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.blueprintOperations.mockResolvedValue([row('preparing')]);
  const rendered = render(view(client));
  await screen.findByText('Validating the revision and preparing its MCP services');
  expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled();
  rendered.unmount();
  state.blueprintOperations.mockResolvedValue([row('applied')]);
  render(view(client));
  await screen.findByText('Revision applied');
  expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled();
  await userEvent.click(screen.getByText('Inspect Reload receipt'));
  expect(screen.getByText('abc123')).toBeVisible();
  expect(screen.getByText('demo: 2 tools verified')).toBeVisible();
});
it('does not display another workspace or credential owner’s operation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.blueprintOperations.mockResolvedValue([row('preparing')]);
  const rendered = render(view(client));
  await screen.findByText('Validating the revision and preparing its MCP services');
  rendered.rerender(view(client, 'ws_b'));
  expect(
    screen.queryByText('Validating the revision and preparing its MCP services'),
  ).not.toBeInTheDocument();
  state.settings = { ...state.settings, token: 'second' };
  state.blueprintOperations.mockResolvedValue([]);
  rendered.rerender(view(client));
  expect(
    screen.queryByText('Validating the revision and preparing its MCP services'),
  ).not.toBeInTheDocument();
});
it('shows an interrupted outcome as unresolved', () => {
  render(
    <BlueprintOperationStatus
      operation={{
        ...row('interrupted'),
        error: 'Inspect the installed revision before retrying.',
      }}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Reload outcome needs inspection');
  expect(screen.queryByText('Revision applied')).not.toBeInTheDocument();
});
