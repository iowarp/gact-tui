import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GitHubSourceAuth } from './github-source-auth';

const browser = vi.hoisted(() => ({ prepare: vi.fn(), open: vi.fn(), cancel: vi.fn() }));
vi.mock('@/tauri/external-url', () => ({ prepareExternalUrl: browser.prepare }));

const repository = { startSourceSignIn: vi.fn(), completeSourceSignIn: vi.fn() };
const onComplete = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  browser.prepare.mockReturnValue({ open: browser.open, cancel: browser.cancel });
  repository.startSourceSignIn.mockResolvedValue({
    flow_id: 'flow1',
    authorization_url: 'https://github.com/login/device',
    user_code: 'ABCD-EFGH',
    interval: 5,
  });
  repository.completeSourceSignIn.mockResolvedValue({ authenticated: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function signIn() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <GitHubSourceAuth
        repository={repository}
        workspaceId="remote-workspace"
        sourceId="source1"
        onComplete={onComplete}
      />
    </QueryClientProvider>,
  );
}

async function start() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));
    await vi.advanceTimersByTimeAsync(1);
  });
}

it('opens only after a click and polls pending grants until the user approves', async () => {
  signIn();
  expect(browser.prepare).not.toHaveBeenCalled();
  await start();
  expect(browser.prepare.mock.invocationCallOrder[0]).toBeLessThan(
    repository.startSourceSignIn.mock.invocationCallOrder[0],
  );
  expect(browser.open).toHaveBeenCalledWith('https://github.com/login/device');
  expect(screen.getByLabelText('GitHub sign-in code')).toHaveTextContent('ABCD-EFGH');
  expect(repository.completeSourceSignIn).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(repository.completeSourceSignIn).toHaveBeenCalledWith(
    'remote-workspace',
    'source1',
    'flow1',
    '',
  );
  expect(onComplete).not.toHaveBeenCalled();
  repository.completeSourceSignIn.mockResolvedValue({ authenticated: true });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(onComplete).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('GitHub sign-in code')).not.toBeInTheDocument();
});

it('stops polling when cancelled or closed', async () => {
  const view = signIn();
  await start();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(repository.completeSourceSignIn).not.toHaveBeenCalled();
  await start();
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(repository.completeSourceSignIn).not.toHaveBeenCalled();
});

it('reports denied authorization and allows another sign-in attempt', async () => {
  repository.completeSourceSignIn.mockRejectedValue(new Error('GitHub sign-in was cancelled'));
  signIn();
  await start();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(screen.getByRole('alert')).toHaveTextContent('GitHub sign-in was cancelled');
  expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
  expect(onComplete).not.toHaveBeenCalled();
});
