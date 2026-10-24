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
      choices: [],
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
      choices: [],
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

it('saves Unlimited explicitly and restores the last finite limit without a restart', async () => {
  const user = userEvent.setup();
  const limits: RuntimeSettings = {
    ...initial,
    settings: [
      {
        ...initial.settings[0]!,
        key: 'agent_tasks.max_concurrent',
        title: 'Concurrent subagents',
        description: 'Tasks at each nesting level.',
        group: 'Subagents',
        kind: 'integer',
        value: 3,
        default_value: 3,
        unit: null,
        unlimited_value: 0,
        effect: 'Applies immediately. Running tasks finish; queued tasks use the new limit.',
      },
    ],
  };
  repository.runtimeSettings.mockResolvedValue(limits);
  repository.updateRuntimeSettings.mockImplementation(async (request) => ({
    ...limits,
    revision: 'saved',
    settings: limits.settings.map((row) => ({
      ...row,
      value: request.changes[row.key],
    })),
  }));
  showSettings();
  const input = await screen.findByRole('spinbutton', { name: 'Concurrent subagents' });
  await user.clear(input);
  await user.type(input, '6');
  await user.click(screen.getByRole('switch', { name: 'Unlimited concurrent subagents' }));
  expect(input).toBeDisabled();
  expect(input).toHaveAttribute('placeholder', 'Unlimited');
  await user.click(screen.getByRole('button', { name: 'Save defaults' }));
  await waitFor(() =>
    expect(repository.updateRuntimeSettings).toHaveBeenCalledWith({
      revision: 'first',
      changes: { 'agent_tasks.max_concurrent': 0 },
    }),
  );
  await user.click(screen.getByRole('switch', { name: 'Unlimited concurrent subagents' }));
  expect(input).toBeEnabled();
  expect(input).toHaveValue(6);
  await user.click(screen.getByRole('button', { name: 'Save defaults' }));
  await waitFor(() =>
    expect(repository.updateRuntimeSettings).toHaveBeenLastCalledWith({
      revision: 'saved',
      changes: { 'agent_tasks.max_concurrent': 6 },
    }),
  );
});

it('keeps inherited limit controls locked and distinguishes reset from Unlimited', async () => {
  const user = userEvent.setup();
  repository.runtimeSettings.mockResolvedValue({
    ...initial,
    settings: [
      {
        ...initial.settings[0]!,
        key: 'agent_tasks.max_depth',
        title: 'Maximum nesting depth',
        value: 8,
        default_value: 8,
        kind: 'integer',
        unlimited_value: 0,
        unit: null,
      },
    ],
  });
  showSettings();
  const input = await screen.findByRole('spinbutton', { name: 'Maximum nesting depth' });
  await user.click(screen.getByRole('button', { name: 'Use inherited maximum nesting depth' }));
  expect(input).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Unlimited maximum nesting depth' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Unlimited maximum nesting depth' })).not.toBeChecked();
});

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
