import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ConnectionSettings } from '@/lib/connection';
import type { ResourceActions } from './resource-dialogs';

const mocks = vi.hoisted(() => ({
  settings: { endpoint: 'http://127.0.0.1:51211', label: 'aurora' } as ConnectionSettings,
  switchConnection: vi.fn().mockResolvedValue(undefined),
  connections: [
    {
      endpoint: 'http://127.0.0.1:51211',
      label: 'aurora',
      source: 'recent',
      availability: { state: 'degraded', label: 'Limited', detail: 'Available with limitations.' },
    },
    {
      endpoint: 'http://127.0.0.1:53211',
      label: 'CLIO',
      source: 'managed',
      token: 'launch-token',
      availability: { state: 'healthy', label: 'Ready', detail: 'Running on this computer.' },
    },
  ],
}));

vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: mocks.settings, recents: [mocks.connections[0]] }),
}));
vi.mock('@/hooks/use-known-connections', () => ({ useKnownConnections: () => mocks.connections }));
vi.mock('@/hooks/use-connection-availability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-connection-availability')>()),
  useConnectionAvailabilities: () => ({}),
}));
vi.mock('@/hooks/use-switch-connection', () => ({
  useSwitchConnection: () => mocks.switchConnection,
}));
vi.mock('@/tauri/menu-actions', () => ({ useMenuAction: vi.fn() }));
vi.mock('./navigation-infrastructure', () => ({ NavigationInfrastructure: () => null }));
vi.mock('./attention-center', () => ({
  ClioAttentionCenter: () => null,
  ClioAttentionNotifier: () => null,
}));
vi.mock('./resource-dialogs', () => ({ ClioResourceDialogs: () => null }));
vi.mock('./archived-sessions-dialog', () => ({ ClioArchivedSessionsDialog: () => null }));

import { ClioNavigation } from './navigation';

afterEach(cleanup);

it('offers the managed local service from Aurora even though only Aurora is remembered', async () => {
  const user = userEvent.setup();
  const view = () => (
    <MemoryRouter>
      <TooltipProvider>
        <SidebarProvider>
          <ClioNavigation
            endpoint={mocks.settings.endpoint}
            workspaces={[]}
            sessions={[]}
            activeWorkspaceId=""
            activeSessionId=""
            actions={{} as ResourceActions}
            agents={[]}
            attentions={{}}
          />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>
  );
  const { rerender } = render(view());
  for (const destination of [mocks.connections[1]!, mocks.connections[0]!]) {
    await user.click(screen.getByRole('button', { name: /Local/u }));
    const item = screen
      .getAllByRole('menuitem')
      .find((node) => node.textContent?.includes(destination.endpoint));
    expect(item).toBeDefined();
    await user.click(item!);
    await waitFor(() => expect(mocks.switchConnection).toHaveBeenLastCalledWith(destination));
    mocks.settings = destination;
    rerender(view());
  }
});
