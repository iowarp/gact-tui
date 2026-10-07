import type { RuntimeSettings } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ runtimeSettings: vi.fn(), updateRuntimeSettings: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
import { RuntimeSettingsPanel } from './settings-runtime';

const initial: RuntimeSettings = {
  revision: 'first',
  config_path: '/test/config.yaml',
  settings: [
    {
      key: 'limits.lm_call_s',
      title: 'Model request timeout',
      description: 'Maximum time for a request.',
      group: 'Execution',
      value: 1800,
      default_value: 1800,
      kind: 'number',
      minimum: 0,
      maximum: null,
      unit: 'seconds',
      effect: 'Applies to subsequent requests.',
      source: 'user',
      has_user_value: true,
      editable: true,
      reason: null,
    },
    {
      key: 'runtime.capture_reasoning',
      title: 'Save model reasoning',
      description: 'Save provider reasoning.',
      group: 'Memory & history',
      value: true,
      default_value: true,
      kind: 'boolean',
      minimum: null,
      maximum: null,
      unit: null,
      effect: 'Applies to subsequent responses.',
      source: 'workspace',
      has_user_value: false,
      editable: false,
      reason: 'Set by workspace configuration.',
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function showSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RuntimeSettingsPanel />
    </QueryClientProvider>,
  );
}

it('preserves an edited draft after a conflict and sends only owned changes', async () => {
  const user = userEvent.setup();
  repository.runtimeSettings.mockResolvedValue(initial);
  repository.updateRuntimeSettings.mockRejectedValueOnce(
    new Error('Configuration changed. Reload before saving.'),
  );
  showSettings();
  const input = await screen.findByRole('spinbutton', { name: 'Model request timeout' });
  expect(screen.getByRole('switch', { name: 'Save model reasoning' })).toBeDisabled();
  await user.clear(input);
  await user.type(input, '75');
  await user.click(screen.getByRole('button', { name: 'Save defaults' }));
  await screen.findByText(/Your edits are still here/);
  expect(input).toHaveValue(75);
  expect(repository.updateRuntimeSettings).toHaveBeenCalledWith({
    revision: 'first',
    changes: { 'limits.lm_call_s': 75 },
  });
  expect(repository.runtimeSettings).toHaveBeenCalledTimes(1);
  const fresh = {
    ...initial,
    revision: 'second',
    settings: initial.settings.map((setting) => ({
      ...setting,
      value: setting.key === 'limits.lm_call_s' ? 90 : setting.value,
    })),
  };
  repository.runtimeSettings.mockResolvedValue(fresh);
  await user.click(screen.getByRole('button', { name: 'Reload current settings' }));
  await waitFor(() => expect(input).toHaveValue(90));
  expect(screen.getByRole('button', { name: 'Save defaults' })).toBeDisabled();
});

it('removes only the selected override and displays the returned inherited value', async () => {
  const user = userEvent.setup();
  repository.runtimeSettings.mockResolvedValue(initial);
  repository.updateRuntimeSettings.mockResolvedValue({
    ...initial,
    revision: 'second',
    settings: initial.settings.map((setting) =>
      setting.key === 'limits.lm_call_s'
        ? { ...setting, value: 50, source: 'environment', has_user_value: false }
        : setting,
    ),
  });
  showSettings();
  const input = await screen.findByRole('spinbutton', { name: 'Model request timeout' });
  await user.click(screen.getByRole('button', { name: 'Use inherited model request timeout' }));
  expect(input).toBeDisabled();
  expect(screen.getByText('Will inherit after saving')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Save defaults' }));
  await waitFor(() => expect(input).toHaveValue(50));
  expect(input).toBeEnabled();
  expect(screen.getByText('Environment default')).toBeVisible();
  expect(repository.updateRuntimeSettings).toHaveBeenCalledWith({
    revision: 'first',
    changes: { 'limits.lm_call_s': null },
  });
});

it('shows a load failure and retries instead of remaining on a loading message', async () => {
  const user = userEvent.setup();
  repository.runtimeSettings.mockRejectedValueOnce(new Error('Service unavailable'));
  showSettings();
  await screen.findByText('Service unavailable');
  expect(screen.queryByText('Loading configuration…')).not.toBeInTheDocument();
  repository.runtimeSettings.mockResolvedValue(initial);
  await user.click(screen.getByRole('button', { name: 'Retry loading settings' }));
  await screen.findByRole('spinbutton', { name: 'Model request timeout' });
});
