import { toolSettingsSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PluginToolSettings } from './plugin-tool-settings';

const repository = vi.hoisted(() => ({
  toolSettings: vi.fn(),
  updateToolSettings: vi.fn(),
  removeToolRule: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://test' } }),
}));

function setWidth(wide: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: wide,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

const outcomes = (direct: string, script: string) =>
  Object.fromEntries(['ask', 'auto-edits', 'bypass'].map((mode) => [mode, { direct, script }]));

const VIEW = toolSettingsSchema.parse({
  plugin: 'clio-builtin/home',
  approval_modes: ['ask', 'auto-edits', 'bypass'],
  covering_modes: ['auto-edits'],
  servers_not_loaded: ['calendar'],
  tools: [
    {
      name: 'home_light_list',
      kind: 'mcp',
      server: 'home',
      description: 'List the lights.',
      read_only: true,
      destructive: false,
      group: 'read',
      plugin_permission: 'allow',
      plugin_permission_source: 'annotations',
      rules: [],
      permission: '',
      plugin_callers: 'both',
      callers: 'both',
      outcomes: outcomes('runs', 'runs'),
    },
    {
      name: 'home_light_set',
      kind: 'mcp',
      server: 'home',
      description: 'Prefer scenes for several lights.',
      read_only: false,
      destructive: true,
      group: 'write',
      plugin_permission: 'ask',
      plugin_permission_source: 'plugin',
      rules: [
        {
          scope: 'session',
          scope_id: 'sess_1',
          where: 'session',
          action: 'allow_session',
          path_pattern: '',
        },
      ],
      permission: '',
      plugin_callers: 'code',
      configured_callers: '',
      callers: 'code',
      outcomes: outcomes('unavailable', 'asks'),
    },
  ],
});

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PluginToolSettings reference="clio-builtin/home" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  repository.toolSettings.mockResolvedValue(VIEW);
  repository.updateToolSettings.mockResolvedValue({ tools: [] });
  repository.removeToolRule.mockResolvedValue({ removed: 1 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('groups tools by their flags and states defaults and outcomes in words', async () => {
  setWidth(true);
  renderPage();
  const read = await screen.findByRole('region', { name: 'Read-only tools (1)' });
  const write = screen.getByRole('region', { name: 'Write and delete tools (1)' });
  expect(within(read).getByText('home_light_list')).toBeVisible();
  expect(
    within(read).getByText(
      'Without a rule, read-only tools run without asking in every approval mode.',
    ),
  ).toBeVisible();
  expect(
    within(write).getByText(
      /Destructive\. Plugin default: Needs approval \(declared by the plugin\); I\/O Code\./u,
    ),
  ).toBeVisible();
  expect(
    within(write).getByText('In Ask first: Not available. From a script: Asks you.'),
  ).toBeVisible();
  expect(within(write).getByText('Allowed in one conversation')).toBeVisible();
  expect(screen.getByText(/Tools of calendar appear here/u)).toBeVisible();
  expect(
    within(write).getByRole('combobox', { name: 'Permission: home_light_set' }),
  ).toHaveTextContent('Default: Needs approval');
  expect(within(write).getByRole('combobox', { name: 'I/O: home_light_set' })).toHaveTextContent(
    'Default: Code',
  );
});

it('saves a per-tool block, a group I/O choice and removes a saved rule', async () => {
  setWidth(true);
  const user = userEvent.setup();
  renderPage();
  const write = await screen.findByRole('region', { name: 'Write and delete tools (1)' });
  await user.click(within(write).getByRole('combobox', { name: 'Permission: home_light_set' }));
  await user.click(await screen.findByRole('option', { name: 'Blocked' }));
  expect(repository.updateToolSettings).toHaveBeenCalledWith({
    tools: ['home_light_set'],
    permission: 'deny',
  });
  await user.click(screen.getByRole('combobox', { name: 'I/O: All read-only tools' }));
  await user.click(await screen.findByRole('option', { name: 'Direct' }));
  expect(repository.updateToolSettings).toHaveBeenCalledWith({
    tools: ['home_light_list'],
    callers: 'direct',
  });
  await user.click(
    within(write).getByRole('button', { name: 'Remove rule: Allowed in one conversation' }),
  );
  expect(repository.removeToolRule).toHaveBeenCalledWith(
    'home_light_set',
    expect.objectContaining({ scope: 'session', scope_id: 'sess_1', action: 'allow_session' }),
  );
});

it('changes the outcome text with the approval mode', async () => {
  setWidth(true);
  const user = userEvent.setup();
  renderPage();
  await screen.findByRole('region', { name: 'Write and delete tools (1)' });
  expect(screen.getByText(/Without a rule, each write or command asks you\./u)).toBeVisible();
  await user.click(screen.getByRole('combobox', { name: 'Show what happens in' }));
  await user.click(await screen.findByRole('option', { name: 'Workspace edits' }));
  expect(
    screen.getByText(
      "Without a rule, file edits run and other writes ask you. In a run_code script, the script's approval covers its calls.",
    ),
  ).toBeVisible();
});

it('on a phone, lists tools and opens a detail screen with explained choices', async () => {
  setWidth(false);
  const user = userEvent.setup();
  renderPage();
  await user.click(
    await screen.findByRole('button', { name: 'home_light_set: Needs approval, Code' }),
  );
  expect(screen.getByRole('heading', { name: 'home_light_set' })).toBeVisible();
  const permission = screen.getByRole('radiogroup', { name: 'Permission' });
  expect(within(permission).getByRole('radio', { name: /Plugin default/u })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(
    within(permission).getByText(
      'The tool is hidden from the agent, and any call to it is refused.',
    ),
  ).toBeVisible();
  await user.click(within(permission).getByRole('radio', { name: /Always allow/u }));
  expect(repository.updateToolSettings).toHaveBeenCalledWith({
    tools: ['home_light_set'],
    permission: 'allow',
  });
  const io = screen.getByRole('radiogroup', { name: 'I/O' });
  await user.click(within(io).getByRole('radio', { name: /^Both/u }));
  expect(repository.updateToolSettings).toHaveBeenCalledWith({
    tools: ['home_light_set'],
    callers: 'both',
  });
  expect(screen.getByText('Prefer scenes for several lights.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Back to tools' }));
  expect(screen.getAllByRole('button', { name: /All tools/u })).toHaveLength(2);
});

it('says when the settings cannot be read', async () => {
  setWidth(true);
  repository.toolSettings.mockRejectedValue(new Error('Plugin is not installed'));
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Tool settings could not be loaded: Plugin is not installed',
  );
});
