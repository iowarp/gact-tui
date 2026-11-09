import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const repository = vi.hoisted(() => ({
  policies: vi.fn(),
  workspaces: vi.fn(),
  updatePolicies: vi.fn(),
  permissions: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { PermissionPoliciesPanel, PermissionsSettings } from './settings-permissions';

const policies = [
  {
    scope: 'workspace',
    scope_id: 'ws_science',
    action: 'deny',
    priority: 90,
    kind: 'domain',
    host_pattern: '*.untrusted.test',
    metadata: {},
  },
  {
    scope: 'workspace',
    action: 'ask',
    priority: 40,
    kind: 'tool',
    tool_name_pattern: 'shell_*',
    path_pattern: 'D:/science/**',
    metadata: {},
  },
  {
    scope: 'workspace',
    action: 'allow',
    priority: 1,
    kind: 'tool',
    tool_name_pattern: '*',
    path_pattern: '*',
    metadata: {},
  },
];

function renderPanel(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>,
  );
}

function rows() {
  return within(screen.getByRole('group', { name: 'Access rules' }));
}

beforeEach(() => {
  repository.policies.mockResolvedValue(policies);
  repository.workspaces.mockResolvedValue([
    {
      id: 'ws_science',
      name: 'science',
      display_name: 'Science campaign',
      path: 'D:/science',
      connection_id: 'local',
    },
  ]);
  repository.updatePolicies.mockImplementation(async (next: unknown) => next);
  repository.permissions.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('access rules', { timeout: 15_000 }, () => {
  it('lists each rule as its target, kind, scope, priority and a status word', async () => {
    renderPanel(<PermissionPoliciesPanel />);

    expect(await rows().findByText('*.untrusted.test')).toBeVisible();
    expect(await rows().findByText('Science campaign')).toBeVisible();
    expect(rows().getByText('Internet domain')).toBeVisible();
    expect(rows().getByText('Priority 90')).toBeVisible();
    expect(rows().getByText('Blocked')).toBeVisible();
    expect(rows().getByText('Ask every time')).toBeVisible();
    expect(rows().getByText('Allowed')).toBeVisible();
    expect(rows().getByText('shell_*')).toBeVisible();
    expect(rows().getByText('in D:/science/**')).toBeVisible();
    expect(screen.getByRole('button', { name: 'About access rules' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'New access rule' })).toBeVisible();
  });

  it('keeps an unregistered workspace identifier out of the primary rule label', async () => {
    repository.policies.mockResolvedValue([
      { ...policies[0], scope_id: 'ws_removed', host_pattern: '*.example.test' },
    ]);
    renderPanel(<PermissionPoliciesPanel />);

    expect(await screen.findByText('Unregistered workspace')).toBeVisible();
    expect(screen.queryByText('ws_removed')).not.toBeInTheDocument();
    expect(screen.getByText('Unregistered workspace')).toHaveAccessibleName(
      'Unregistered workspace. Identifier ws_removed',
    );
  });

  it('stages a new rule, then saves the complete set together', async () => {
    const user = userEvent.setup();
    renderPanel(<PermissionPoliciesPanel initialWorkspaceId="ws_science" />);
    await rows().findByText('shell_*');

    await user.click(screen.getByRole('button', { name: 'New access rule' }));
    const dialog = screen.getByRole('dialog', { name: 'New access rule' });
    expect(within(dialog).getByRole('button', { name: /Save rule/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Decision' }));
    fireEvent.click(screen.getByRole('option', { name: 'Allow' }));
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Allow' })).not.toBeInTheDocument(),
    );
    fireEvent.change(within(dialog).getByLabelText('Tool name'), {
      target: { value: 'fs_read_file' },
    });
    expect(within(dialog).getByRole('combobox', { name: 'Workspace' })).toHaveTextContent(
      'Science campaign',
    );
    await user.click(within(dialog).getByRole('button', { name: /Save rule/ }));

    expect(repository.updatePolicies).not.toHaveBeenCalled();
    expect(rows().getByText('fs_read_file')).toBeVisible();
    const bar = screen.getByRole('region', { name: 'Unsaved changes' });
    expect(bar).toHaveTextContent('1 rule added');
    expect(bar).toHaveTextContent('rules save together');
    await user.click(within(bar).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(repository.updatePolicies).toHaveBeenCalled());
    expect(repository.updatePolicies).toHaveBeenCalledWith([
      ...policies,
      expect.objectContaining({
        kind: 'tool',
        scope: 'workspace',
        scope_id: 'ws_science',
        action: 'allow',
        tool_name_pattern: 'fs_read_file',
      }),
    ]);
  });

  it('explains a missing tool name inline once the field is left', async () => {
    const user = userEvent.setup();
    renderPanel(<PermissionPoliciesPanel />);

    await user.click(screen.getByRole('button', { name: 'New access rule' }));
    const dialog = screen.getByRole('dialog', { name: 'New access rule' });
    expect(within(dialog).queryByText('Enter a tool name or pattern.')).toBeNull();
    await user.click(within(dialog).getByLabelText('Tool name'));
    await user.tab();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a tool name or pattern.');
    fireEvent.change(within(dialog).getByLabelText('Priority'), { target: { value: 'high' } });
    expect(within(dialog).getByText('Use a whole number.')).toBeVisible();
  });

  it('edits a rule in the same dialog and marks the change in the save bar', async () => {
    const user = userEvent.setup();
    renderPanel(<PermissionPoliciesPanel />);

    await user.click(await screen.findByRole('button', { name: 'Edit rule 2' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit access rule' });
    const name = within(dialog).getByLabelText('Tool name');
    expect(name).toHaveValue('shell_*');
    fireEvent.change(name, { target: { value: 'shell.run' } });
    await user.click(within(dialog).getByRole('button', { name: /Save rule/ }));

    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toHaveTextContent(
      '1 rule changed',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(repository.updatePolicies).toHaveBeenCalledWith([
        policies[0],
        expect.objectContaining({ tool_name_pattern: 'shell.run', priority: 40 }),
        policies[2],
      ]),
    );
  });

  it('confirms removal on the row, and Discard restores the saved set', async () => {
    const user = userEvent.setup();
    renderPanel(<PermissionPoliciesPanel />);

    await user.click(await screen.findByRole('button', { name: 'Remove rule 1' }));
    const confirm = screen.getByRole('group', { name: 'Remove this rule?' });
    await user.click(within(confirm).getByRole('button', { name: 'Keep' }));
    expect(rows().getByText('*.untrusted.test')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Remove rule 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(rows().queryByText('*.untrusted.test')).toBeNull();
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toHaveTextContent(
      '1 rule removed',
    );
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(rows().getByText('*.untrusted.test')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Remove rule 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(repository.updatePolicies).toHaveBeenCalledWith([policies[1], policies[2]]),
    );
    expect(repository.updatePolicies).toHaveBeenCalledTimes(1);
  });

  it('keeps the staged set when saving fails and says so in plain language', async () => {
    const user = userEvent.setup();
    repository.updatePolicies.mockRejectedValue(
      new Error('Request failed with 422 Unprocessable Entity'),
    );
    renderPanel(<PermissionPoliciesPanel />);

    await user.click(await screen.findByRole('button', { name: 'Remove rule 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('The service did not accept these rules. Nothing changed.'),
    ).toBeVisible();
    expect(screen.queryByText(/422/)).toBeNull();
    expect(rows().queryByText('*.untrusted.test')).toBeNull();
  });

  it('shows an empty line under the label with the add button still available', async () => {
    repository.policies.mockResolvedValue([]);
    renderPanel(<PermissionPoliciesPanel />);

    expect(
      await screen.findByText('No access rules. Protected actions follow the service defaults.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'New access rule' })).toBeEnabled();
  });

  it('shows a plain-language load failure with an inline retry and no empty line', async () => {
    const user = userEvent.setup();
    repository.policies.mockRejectedValueOnce(new Error('Request failed with 404 Not Found'));
    renderPanel(<PermissionPoliciesPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the access rules.');
    expect(screen.queryByText(/404/)).toBeNull();
    expect(screen.queryByText(/No access rules/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await rows().findByText('shell_*')).toBeVisible();
  });
});

describe('rules the person made in the shared browser', () => {
  it('lists a trusted certificate and a site, removable but not editable', async () => {
    repository.policies.mockResolvedValue([
      {
        scope: 'session',
        scope_id: 'sess_printer',
        action: 'allow',
        kind: 'browser_certificate',
        host_pattern: 'octopi.lan',
        fingerprint: 'LyHcpzcUfoOk=',
        metadata: {},
      },
      {
        scope: 'session',
        scope_id: 'sess_printer',
        action: 'allow',
        kind: 'browser_host',
        host_pattern: 'octopi.lan',
        metadata: {},
      },
    ]);
    renderPanel(<PermissionPoliciesPanel />);
    expect(await screen.findByText('key sha256/LyHcpzcUfoOk=')).toBeTruthy();
    expect(screen.getByText('Trusted certificate')).toBeTruthy();
    expect(screen.getByText('Website in the shared browser')).toBeTruthy();
    expect(screen.getAllByText('One conversation')).toHaveLength(2);
    expect(screen.getAllByText('octopi.lan')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Edit rule/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove rule 1' })).toBeTruthy();
  });
});

describe('permission requests', () => {
  it('names a request by its action and keeps the tool id in technical details', async () => {
    repository.permissions.mockResolvedValue([
      {
        id: 'perm_1',
        session_id: 'sess_1',
        tool_name: 'workspace.read',
        summary: 'Read the station evidence table',
        reason: 'The agent needs the selected evidence source.',
        risk: 'low',
        created_at: '2026-01-01T00:00:00Z',
        status: 'pending',
      },
    ]);
    renderPanel(<PermissionsSettings />);

    expect(screen.getByRole('heading', { level: 1, name: 'Permissions' })).toBeVisible();
    const requests = within(await screen.findByRole('group', { name: 'Requests' }));
    expect(await requests.findByText('Read the station evidence table')).toBeVisible();
    expect(requests.getByText('The agent needs the selected evidence source.')).toBeVisible();
    expect(requests.getByText('Needs you')).toBeVisible();
    expect(requests.queryByText('workspace.read')).toBeNull();
    expect(requests.getByRole('button', { name: 'Technical details for request 1' })).toBeTruthy();
  });

  it('says when there are no requests', async () => {
    renderPanel(<PermissionsSettings />);
    expect(
      await screen.findByText('No pending or recorded requests on this connection.'),
    ).toBeVisible();
  });
});
