import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useConnectionSettings: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: mocks.useConnectionSettings,
}));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }));

import {
  readPendingUpdateMarker,
  useUpdateFlowStore,
  writePendingUpdateMarker,
} from '@/store/update-flow-store';
import { UpdateRestartRecovery } from './update-restart-recovery';

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
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('UpdateRestartRecovery', () => {
  it('resumes into reconnecting from a persisted marker, then finishes on reconnect', () => {
    writePendingUpdateMarker({ action: 'agent', version: '0.9.5.0', startedAt: Date.now() });
    setConnection({ credentialsReady: false, managedConnectionReady: false });

    const { rerender } = render(<UpdateRestartRecovery />);
    expect(useUpdateFlowStore.getState().step).toBe('reconnecting');
    expect(useUpdateFlowStore.getState().version).toBe('0.9.5.0');

    setConnection({ credentialsReady: true, managedConnectionReady: true });
    rerender(<UpdateRestartRecovery />);

    expect(useUpdateFlowStore.getState().step).toBe('done');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Updated to v0.9.5.0');
    expect(readPendingUpdateMarker()).toBeUndefined();
  });

  it('fails with the real connection reason when reconnecting never succeeds', () => {
    writePendingUpdateMarker({ action: 'agent', version: '0.9.5.0', startedAt: Date.now() });
    setConnection({ credentialsReady: false, managedConnectionReady: false });

    const { rerender } = render(<UpdateRestartRecovery />);

    setConnection({
      credentialsReady: true,
      managedConnectionReady: false,
      credentialError: 'The managed CLIO agent service did not become ready in time.',
    });
    rerender(<UpdateRestartRecovery />);

    expect(useUpdateFlowStore.getState().step).toBe('failed');
    expect(useUpdateFlowStore.getState().reason).toBe(
      'The managed CLIO agent service did not become ready in time.',
    );
    expect(readPendingUpdateMarker()).toBeUndefined();
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

  it('only settles once even if the connection state keeps changing after reconnect', () => {
    writePendingUpdateMarker({ action: 'desktop', startedAt: Date.now() });
    setConnection({ credentialsReady: false, managedConnectionReady: false });
    const { rerender } = render(<UpdateRestartRecovery />);

    setConnection({ credentialsReady: true, managedConnectionReady: true });
    rerender(<UpdateRestartRecovery />);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);

    setConnection({ credentialsReady: true, managedConnectionReady: false });
    rerender(<UpdateRestartRecovery />);
    setConnection({ credentialsReady: true, managedConnectionReady: true });
    rerender(<UpdateRestartRecovery />);

    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });
});
