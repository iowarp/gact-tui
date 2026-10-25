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
  await user.click(screen.getByRole('button', { name: 'About Model request timeout' }));
  expect(
    screen.getByText((_, node) => node?.textContent === 'Source: Environment default'),
  ).toBeVisible();
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

it('keeps setting descriptions visible and places provenance and effect in the info tip', async () => {
  const user = userEvent.setup();
  const defaults = {
    ...initial.settings[0]!,
    key: 'limits.default_call_s',
    title: 'Default request timeout',
    description: 'A separate model request timeout explanation.',
    source: 'default' as const,
    has_user_value: false,
  };
  repository.runtimeSettings.mockResolvedValue({
    ...initial,
    settings: [
      {
        ...initial.settings[0]!,
        has_user_value: true,
        effect: 'Applies to subsequent model requests.',
      },
      defaults,
    ],
  });
  showSettings();

  expect(await screen.findByText('Maximum time for a request.')).toBeVisible();
  expect(screen.queryByText('Applies to subsequent model requests.')).not.toBeInTheDocument();
  expect(screen.queryByText(/ default$/iu)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'About Model request timeout' }));
  expect(
    await screen.findByText(
      (_, node) => node?.textContent === 'Effect: Applies to subsequent model requests.',
    ),
  ).toBeVisible();
  expect(
    screen.getByText((_, node) => node?.textContent === 'Source: Saved in your configuration'),
  ).toBeVisible();
  expect(
    screen.getByText(
      (_, node) =>
        node?.tagName === 'P' && /Reset:.*inherited value/iu.test(node.textContent ?? ''),
    ),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Use inherited model request timeout' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'About Default request timeout' }));
  expect(
    await screen.findByText(
      (_, node) => node?.tagName === 'P' && /Source:.*default/iu.test(node.textContent ?? ''),
    ),
  ).toBeVisible();
});

it('saves named duration presets and custom numeric values through the same runtime patch', async () => {
  const user = userEvent.setup();
  const expirySetting = {
    ...initial.settings[0]!,
    key: 'memory.expiry_days',
    title: 'Expire unused memories after',
    description: 'Propose retiring a document nobody read for this long.',
    group: 'Memory',
    value: 60,
    default_value: 60,
    kind: 'integer' as const,
    minimum: 0,
    unit: 'days',
    source: 'default' as const,
    has_user_value: false,
    effect: 'Applies at the next background pass.',
    unlimited_value: 0 as const,
    presets: [
      { value: 0, label: 'Never' },
      { value: 30, label: '30 days' },
      { value: 60, label: '60 days' },
      { value: 90, label: '90 days' },
      { value: 180, label: '180 days' },
      { value: 365, label: '1 year' },
    ],
  };
  const idleSetting = {
    ...expirySetting,
    key: 'memory.idle_minutes',
    title: 'Idle minutes before processing',
    description: 'How long a conversation stays idle before background memory reads it.',
    value: 30,
    default_value: 30,
    unit: 'minutes',
    effect: 'Applies at the next idle check.',
    presets: [
      { value: 0, label: 'After each completed turn' },
      { value: 5, label: '5 minutes' },
      { value: 15, label: '15 minutes' },
      { value: 30, label: '30 minutes' },
      { value: 60, label: '1 hour' },
    ],
  };
  const autoAcceptSetting = {
    ...initial.settings[0]!,
    key: 'memory.auto_accept',
    title: 'Apply background changes without review',
    description: 'Choose which background proposals can be applied automatically.',
    group: 'Memory',
    value: 'user_stated',
    default_value: 'user_stated',
    kind: 'choice' as const,
    minimum: null,
    maximum: null,
    unit: null,
    source: 'default' as const,
    has_user_value: false,
    effect: 'Applies to proposals made after the change.',
    choices: [
      { value: 'user_stated', label: 'Facts you stated yourself' },
      { value: 'none', label: 'None' },
      { value: 'all', label: 'All eligible changes' },
    ],
  };
  const duration: RuntimeSettings = {
    ...initial,
    settings: [expirySetting, idleSetting, autoAcceptSetting],
  };
  repository.runtimeSettings.mockResolvedValue(duration);
  repository.updateRuntimeSettings.mockImplementation(async (request) => ({
    ...duration,
    revision: 'saved',
    settings: duration.settings.map((setting) => ({
      ...setting,
      value: request.changes[setting.key] ?? setting.value,
    })),
  }));
  showSettings();

  const preset = await screen.findByRole('combobox', {
    name: 'Choose expire unused memories after preset',
  });
  expect(preset).toHaveTextContent('60 days');
  await user.click(preset);
  await user.click(await screen.findByRole('option', { name: 'Never' }));
  expect(preset).toHaveTextContent('Never');

  const idlePreset = screen.getByRole('combobox', {
    name: 'Choose idle minutes before processing preset',
  });
  expect(idlePreset).toHaveTextContent('30 minutes');
  await user.click(idlePreset);
  await user.click(await screen.findByRole('option', { name: 'After each completed turn' }));
  expect(idlePreset).toHaveTextContent('After each completed turn');

  await user.click(screen.getByRole('button', { name: 'Save defaults' }));
  await waitFor(() =>
    expect(repository.updateRuntimeSettings).toHaveBeenLastCalledWith({
      revision: 'first',
      changes: { 'memory.expiry_days': 0, 'memory.idle_minutes': 0 },
    }),
  );

  await user.click(preset);
  await user.click(await screen.findByRole('option', { name: 'Custom…' }));
  const input = screen.getByRole('spinbutton', { name: 'Expire unused memories after' });
  await user.clear(input);
  await user.type(input, '45');
  await user.click(screen.getByRole('button', { name: 'Save defaults' }));
  await waitFor(() =>
    expect(repository.updateRuntimeSettings).toHaveBeenLastCalledWith({
      revision: 'saved',
      changes: { 'memory.expiry_days': 45 },
    }),
  );

  const acceptance = screen.getByRole('combobox', {
    name: 'Apply background changes without review',
  });
  await user.click(acceptance);
  await user.click(await screen.findByRole('option', { name: 'All eligible changes' }));
  await user.click(screen.getByRole('button', { name: 'Save defaults' }));
  await waitFor(() =>
    expect(repository.updateRuntimeSettings).toHaveBeenLastCalledWith({
      revision: 'saved',
      changes: { 'memory.auto_accept': 'all' },
    }),
  );
});

it('makes the full configuration path available on hover and removes one-entry copy guidance', async () => {
  const user = userEvent.setup();
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  try {
    repository.runtimeSettings.mockResolvedValue(initial);
    showSettings();

    const copyPath = await screen.findByRole('button', { name: 'Copy configuration path' });
    expect(copyPath).toHaveAttribute('title', '/test/config.yaml');
    expect(screen.queryByText('Edits save only these preferences.')).not.toBeInTheDocument();
    await user.click(copyPath);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('/test/config.yaml'));
  } finally {
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});
