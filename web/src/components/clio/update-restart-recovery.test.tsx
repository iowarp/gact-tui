import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useConnectionSettings: vi.fn(),
  toastSuccess: vi.fn(),
  verify: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
}));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: mocks.useConnectionSettings,
}));
vi.mock('@/tauri/clio-update-verification', () => ({ verifyClioUpdate: mocks.verify }));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), success: mocks.toastSuccess } }));

import {
  readPendingUpdateMarker,
  useUpdateFlowStore,
  writePendingUpdateMarker,
} from '@/store/update-flow-store';
import { UpdateRestartRecovery } from './update-restart-recovery';
import { vocab } from '@/lib/brand-vocabulary';

function setConnection(overrides: {
  credentialsReady: boolean;
  managedConnectionReady: boolean;
  credentialError?: string;
}) {
  mocks.useConnectionSettings.mockReturnValue(overrides);
}

beforeEach(() => {
  localStorage.clear();
  useUpdateFlowStore.getState().reset();
  mocks.toastSuccess.mockClear();
  mocks.verify.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('UpdateRestartRecovery', () => {
  it('resumes and verifies versions before finishing, rather than trusting reconnect', async () => {
    let complete!: () => void;
    mocks.verify.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    writePendingUpdateMarker({ action: 'agent', version: '0.9.5.0', startedAt: Date.now() });
    setConnection({ credentialsReady: false, managedConnectionReady: false });

    const { rerender } = render(<UpdateRestartRecovery />);
    expect(useUpdateFlowStore.getState().step).toBe('verifying');
    expect(useUpdateFlowStore.getState().version).toBe('0.9.5.0');

    setConnection({ credentialsReady: true, managedConnectionReady: true });
    rerender(<UpdateRestartRecovery />);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    complete();

    await waitFor(() => expect(useUpdateFlowStore.getState().step).toBe('done'));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(`${vocab.product} updated to v0.9.5.0`);
    expect(readPendingUpdateMarker()).toBeUndefined();
  });

  it('fails with the native supervisor reason when the local runtime cannot start', async () => {
    mocks.verify.mockRejectedValueOnce(new Error('The local runtime could not start.'));
    writePendingUpdateMarker({ action: 'agent', version: '0.9.5.0', startedAt: Date.now() });
    setConnection({ credentialsReady: false, managedConnectionReady: false });

    const { rerender } = render(<UpdateRestartRecovery />);

    setConnection({
      credentialsReady: true,
      managedConnectionReady: false,
      credentialError: 'The managed CLIO agent service did not become ready in time.',
    });
    rerender(<UpdateRestartRecovery />);

    await waitFor(() => expect(useUpdateFlowStore.getState().step).toBe('failed'));
    expect(useUpdateFlowStore.getState().reason).toBe('The local runtime could not start.');
    expect(readPendingUpdateMarker()).toMatchObject({ version: '0.9.5.0' });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('leaves the flow idle when a connection failure has nothing to do with an update', () => {
    setConnection({
      credentialsReady: true,
      managedConnectionReady: false,
      credentialError: 'Some ordinary connection error, unrelated to any update.',
    });

    render(<UpdateRestartRecovery />);

    expect(useUpdateFlowStore.getState().step).toBe('idle');
  });

  it('only settles once even if the connection state keeps changing after reconnect', async () => {
    writePendingUpdateMarker({ action: 'desktop', version: '0.9.5.0', startedAt: Date.now() });
    setConnection({ credentialsReady: false, managedConnectionReady: false });
    const { rerender } = render(<UpdateRestartRecovery />);

    setConnection({ credentialsReady: true, managedConnectionReady: true });
    rerender(<UpdateRestartRecovery />);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));

    setConnection({ credentialsReady: true, managedConnectionReady: false });
    rerender(<UpdateRestartRecovery />);
    setConnection({ credentialsReady: true, managedConnectionReady: true });
    rerender(<UpdateRestartRecovery />);

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    expect(mocks.verify).toHaveBeenCalledTimes(1);
  });
  it('completes a local update even when the selected remote connection is unavailable', async () => {
    writePendingUpdateMarker({ action: 'both', version: '0.9.5', startedAt: Date.now() });
    setConnection({
      credentialsReady: false,
      managedConnectionReady: false,
      credentialError: 'Remote SSH disconnected',
    });
    render(<UpdateRestartRecovery />);
    await waitFor(() => expect(useUpdateFlowStore.getState().step).toBe('done'));
    expect(mocks.verify).toHaveBeenCalledOnce();
  });
  it('retains the target and shows failure when a connected runtime is still old', async () => {
    mocks.verify.mockRejectedValueOnce(
      new Error('CLIO update is incomplete: runtime 0.9.4, expected 0.9.5.'),
    );
    writePendingUpdateMarker({ action: 'both', version: '0.9.5', startedAt: Date.now() });
    setConnection({ credentialsReady: true, managedConnectionReady: true });
    render(<UpdateRestartRecovery />);
    await waitFor(() => expect(useUpdateFlowStore.getState().step).toBe('failed'));
    expect(useUpdateFlowStore.getState().reason).toContain('runtime 0.9.4');
    expect(readPendingUpdateMarker()).toMatchObject({ version: '0.9.5' });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
