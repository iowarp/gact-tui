import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ProvenanceConnection } from '@clio/core/v3';
import { ProvenanceConnections } from './provenance-connections';
import { vocab } from '@/lib/brand-vocabulary';

const repository = vi.hoisted(() => ({
  provenanceConnections: vi.fn(),
  connectProvenance: vi.fn(),
  verifyProvenanceConnection: vi.fn(),
  useProvenanceConnection: vi.fn(),
  disconnectProvenanceConnection: vi.fn(),
  forgetProvenanceConnection: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://node:8787', label: 'Delta CLIO' },
  }),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const row: ProvenanceConnection = {
  id: 'cmf-1',
  service_id: 'cmf',
  label: 'Lab CMF',
  url: 'http://cmf:8380',
  configuration: {},
  verification: {},
  managed: false,
  verified: false,
  active: false,
  selected: false,
};
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

it('requires verification before activation and keeps the restart requirement explicit', async () => {
  repository.provenanceConnections.mockResolvedValue([row]);
  repository.verifyProvenanceConnection.mockImplementation(async () => {
    repository.provenanceConnections.mockResolvedValue([{ ...row, verified: true }]);
    return { ...row, verified: true };
  });
  repository.useProvenanceConnection.mockImplementation(async () => {
    repository.provenanceConnections.mockResolvedValue([
      { ...row, verified: true, selected: true },
    ]);
  });
  render(<ProvenanceConnections onClose={vi.fn()} />, { wrapper });
  expect(await screen.findByRole('button', { name: 'Use for provenance' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Verify connection' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Use for provenance' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use for provenance' }));
  expect(
    await screen.findByText(`Saved. Restart the connected ${vocab.agent} to apply this choice.`),
  ).toBeVisible();
  expect(repository.useProvenanceConnection).toHaveBeenCalledWith('cmf-1');
  expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
});

it('connects CMF without Flowcept configuration and names the owning CLIO', async () => {
  repository.provenanceConnections.mockResolvedValue([]);
  const onClose = vi.fn();
  render(
    <ProvenanceConnections
      connect={{ service_id: 'cmf', label: 'CMF', url: '' }}
      onClose={onClose}
    />,
    { wrapper },
  );
  expect(screen.getByText('Connection and paths belong to Delta CLIO.')).toBeVisible();
  expect(screen.queryByLabelText(/Settings file/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(`Service URL from this ${vocab.agent}`), {
    target: { value: 'http://cmf:8380' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() =>
    expect(repository.connectProvenance).toHaveBeenCalledWith({
      service_id: 'cmf',
      label: 'CMF',
      url: 'http://cmf:8380',
    }),
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it('revokes readiness after a failed recheck and exposes a retry', async () => {
  repository.provenanceConnections.mockResolvedValue([{ ...row, verified: true }]);
  repository.verifyProvenanceConnection.mockImplementation(async () => {
    repository.provenanceConnections.mockResolvedValue([row]);
    throw new Error('Provenance write/readback failed');
  });
  render(<ProvenanceConnections onClose={vi.fn()} />, { wrapper });
  fireEvent.click(await screen.findByRole('button', { name: 'Verify connection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Provenance write/readback failed');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Use for provenance' })).toBeDisabled(),
  );
  expect(screen.getByRole('button', { name: 'Verify connection' })).toBeEnabled();
});

it('keeps an active service attached while disconnect is pending a restart', async () => {
  repository.provenanceConnections.mockResolvedValue([
    { ...row, verified: true, active: true, selected: true },
  ]);
  repository.disconnectProvenanceConnection.mockImplementation(async () => {
    repository.provenanceConnections.mockResolvedValue([
      { ...row, verified: true, active: true, selected: false },
    ]);
  });
  render(<ProvenanceConnections onClose={vi.fn()} />, { wrapper });
  fireEvent.click(await screen.findByRole('button', { name: 'Disconnect on restart' }));
  expect(await screen.findByText('Disconnect after restart')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Forget connection' })).not.toBeInTheDocument();
  expect(repository.disconnectProvenanceConnection).toHaveBeenCalledWith(row.id);
});

it('does not close a newer setup surface when an old connection finishes', async () => {
  repository.provenanceConnections.mockResolvedValue([]);
  let finish: (() => void) | undefined;
  repository.connectProvenance.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const onClose = vi.fn();
  const view = render(
    <ProvenanceConnections
      connect={{ service_id: 'cmf', label: 'CMF', url: 'http://cmf:8380' }}
      onClose={onClose}
    />,
    { wrapper },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(repository.connectProvenance).toHaveBeenCalledOnce());
  view.unmount();
  finish?.();
  await waitFor(() => expect(onClose).not.toHaveBeenCalled());
});
