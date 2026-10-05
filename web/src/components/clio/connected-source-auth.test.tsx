import type { ConnectedSourceState } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';

const mocks = vi.hoisted(() => ({
  startSourceSignIn: vi.fn(),
  completeSourceSignIn: vi.fn(),
  startStorageAccountSignIn: vi.fn(),
  completeStorageAccountSignIn: vi.fn(),
  prepare: vi.fn(),
  open: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => mocks }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => false }));
vi.mock('@/tauri/external-url', () => ({ prepareExternalUrl: mocks.prepare }));

import { ConnectedAccountSignIn, ConnectedSourceAuth } from './connected-source-auth';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prepare.mockReturnValue({ open: mocks.open, cancel: mocks.cancel });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderSignIn() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <ConnectedSourceAuth
        workspaceId="workspace1"
        source={{ id: 'source1', provider: 'globus' } as ConnectedSourceState}
        onComplete={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('browser storage sign-in', () => {
  it('reserves a tab before the request and retains a direct link for popup restrictions', async () => {
    let resolveFlow!: (flow: { flow_id: string; authorization_url: string }) => void;
    mocks.startSourceSignIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFlow = resolve;
        }),
    );
    renderSignIn();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startSourceSignIn.mock.invocationCallOrder[0],
    );
    expect(mocks.open).not.toHaveBeenCalled();
    resolveFlow({ flow_id: 'flow1', authorization_url: 'https://auth.globus.org/example' });
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith('https://auth.globus.org/example'));
    expect(screen.getByRole('link', { name: 'Open sign-in page' })).toHaveAttribute(
      'href',
      'https://auth.globus.org/example',
    );
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it('closes the reserved tab and reports a failed authorization request', async () => {
    mocks.startSourceSignIn.mockRejectedValue(new Error('CLIO is disconnected'));
    renderSignIn();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CLIO is disconnected');
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.open).not.toHaveBeenCalled();
  });
});

describe.each(['source', 'account'])('automatic Google %s sign-in', (kind) => {
  const onComplete = vi.fn();
  function renderGoogle() {
    return render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        {kind === 'account' ? (
          <ConnectedAccountSignIn provider="google_drive" onComplete={onComplete} />
        ) : (
          <ConnectedSourceAuth
            workspaceId="workspace1"
            source={{ id: 'source1', provider: 'google_drive' } as ConnectedSourceState}
            onComplete={onComplete}
          />
        )}
      </QueryClientProvider>,
    );
  }
  beforeEach(() => {
    vi.useFakeTimers();
    const flow = {
      flow_id: 'google-flow',
      authorization_url: 'https://accounts.google.com/example',
      automatic_callback: true,
    };
    mocks.startSourceSignIn.mockResolvedValue(flow);
    mocks.startStorageAccountSignIn.mockResolvedValue(flow);
    mocks.completeSourceSignIn.mockResolvedValue({ authenticated: false });
    mocks.completeStorageAccountSignIn.mockResolvedValue({ authenticated: false });
  });
  async function startGoogle() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
      await vi.advanceTimersByTimeAsync(1);
    });
  }
  it('completes from the receiver without asking the user to copy a callback', async () => {
    renderGoogle();
    await startGoogle();
    expect(screen.getByRole('status')).toHaveTextContent(
      `${vocab.agent} will connect automatically`,
    );
    expect(screen.queryByLabelText('Return URL after authorization')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onComplete).not.toHaveBeenCalled();
    if (kind === 'account') {
      expect(mocks.completeStorageAccountSignIn).toHaveBeenCalledWith(
        'google_drive',
        'google-flow',
        '',
      );
    } else {
      expect(mocks.completeSourceSignIn).toHaveBeenCalledWith(
        'workspace1',
        'source1',
        'google-flow',
        '',
      );
    }
    mocks.completeSourceSignIn.mockResolvedValue({ authenticated: true });
    mocks.completeStorageAccountSignIn.mockResolvedValue({ authenticated: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('reports a failed completion and stops polling when the dialog closes', async () => {
    const view = renderGoogle();
    await startGoogle();
    mocks.completeSourceSignIn.mockRejectedValue(new Error('Sign-in expired; start again'));
    mocks.completeStorageAccountSignIn.mockRejectedValue(new Error('Sign-in expired; start again'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in expired');
    expect(onComplete).not.toHaveBeenCalled();
    await startGoogle();
    view.unmount();
    const calls =
      mocks.completeSourceSignIn.mock.calls.length +
      mocks.completeStorageAccountSignIn.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(
      mocks.completeSourceSignIn.mock.calls.length +
        mocks.completeStorageAccountSignIn.mock.calls.length,
    ).toBe(calls);
  });
});
