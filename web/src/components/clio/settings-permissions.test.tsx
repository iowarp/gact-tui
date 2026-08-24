import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  policies: vi.fn(),
  workspaces: vi.fn(),
  updatePolicies: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { PermissionPoliciesPanel } from './settings-permissions';

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
];

function renderPanel(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('permission policy settings', () => {
  it('explains precedence and names workspace/domain rules without color-only state', async () => {
    renderPanel(<PermissionPoliciesPanel />);

    expect(screen.getByText(/Higher priority wins/)).toBeVisible();
    expect(await screen.findByText('Science campaign')).toBeVisible();
    expect(screen.getByText('Internet domain')).toBeVisible();
    expect(screen.getByText('*.untrusted.test')).toBeVisible();
    expect(screen.getByText('Blocked')).toBeVisible();
  });

  it('adds a scoped rule by atomically replacing the complete policy set', async () => {
    const user = userEvent.setup();
    renderPanel(<PermissionPoliciesPanel initialWorkspaceId="ws_science" />);

    await user.click(screen.getByRole('button', { name: 'New rule' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Rule decision' }));
    fireEvent.click(screen.getByRole('option', { name: 'Allow' }));
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Allow' })).not.toBeInTheDocument(),
    );
    await user.clear(within(dialog).getByLabelText('Tool name pattern'));
    await user.type(within(dialog).getByLabelText('Tool name pattern'), 'fs_read_file');
    expect(within(dialog).getByRole('combobox', { name: 'Rule workspace' })).toHaveTextContent(
      'Science campaign',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save rule set' }));

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

  it('requires confirmation before removing a protection rule and preserves audit evidence copy', async () => {
    const user = userEvent.setup();
    renderPanel(<PermissionPoliciesPanel />);

    await user.click(await screen.findByRole('button', { name: 'Remove rule 1' }));
    const confirmation = screen.getByRole('alertdialog');
    expect(within(confirmation).getByText(/audit evidence is not deleted/i)).toBeVisible();
    await user.click(within(confirmation).getByRole('button', { name: 'Remove rule' }));

    await waitFor(() => expect(repository.updatePolicies).toHaveBeenCalled());
    expect(repository.updatePolicies).toHaveBeenCalledWith([policies[1]]);
  });
});
