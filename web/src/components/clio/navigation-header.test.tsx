import { brand } from '@brand';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import type { ConnectionSettings } from '@/lib/connection';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavigationHeader } from './navigation-header';

vi.mock('@/hooks/use-runtime-version', () => ({
  useRuntimeVersion: () => ({ version: '0.9.5', pending: false }),
}));
vi.mock('@/hooks/use-update-status', () => ({ useUpdateStatus: () => undefined }));

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

afterEach(cleanup);

it('shows saved service addresses and prevents selecting an unavailable service', async () => {
  const onConnect = vi.fn();
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <TooltipProvider>
        <SidebarProvider>
          <NavigationHeader
            activeLabel="Contained"
            connectionAvailabilities={{
              'http://127.0.0.1:8788': {
                state: 'healthy',
                label: 'Ready',
                detail: 'Service is available.',
              },
              'http://127.0.0.1:9999': {
                state: 'unavailable',
                label: 'Unavailable',
                detail: 'Connection refused',
              },
            }}
            currentPath="/workspaces/ws_default/sessions/sess_default"
            endpoint="http://127.0.0.1:8788"
            onConnect={onConnect}
            onImportSession={vi.fn()}
            onNewSession={vi.fn()}
            onNewWorkspace={vi.fn()}
            onOpenArchived={vi.fn()}
            connections={[
              { endpoint: 'http://127.0.0.1:8788', label: 'Contained' },
              { endpoint: 'http://127.0.0.1:9999', label: 'Offline lab' },
            ]}
          />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );

  await user.click(screen.getByText('Contained'));

  expect(screen.getAllByText('127.0.0.1:8788').length).toBeGreaterThan(0);
  expect(screen.getByText('127.0.0.1:9999')).toBeVisible();
  const offline = screen.getByRole('menuitem', { name: /Offline lab/u });
  expect(offline).toHaveAttribute('data-disabled');
  await user.click(offline);
  expect(onConnect).not.toHaveBeenCalled();
});

it('explains the active service status when its indicator is hovered', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <TooltipProvider>
        <SidebarProvider>
          <NavigationHeader
            activeLabel="This device"
            connectionAvailabilities={{
              'http://127.0.0.1:8788': {
                state: 'degraded',
                label: 'Limited',
                detail: 'No model is selected yet.',
              },
            }}
            currentPath="/"
            endpoint="http://127.0.0.1:8788"
            onConnect={vi.fn()}
            onImportSession={vi.fn()}
            onNewSession={vi.fn()}
            onNewWorkspace={vi.fn()}
            onOpenArchived={vi.fn()}
            connections={[{ endpoint: 'http://127.0.0.1:8788', label: 'This device' }]}
          />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );

  await user.hover(
    screen.getByRole('img', {
      name: 'Service status: Limited. No model is selected yet.',
    }),
  );

  expect(await screen.findByText('No model is selected yet.')).toBeVisible();
});

it('shows agent identity as location followed by the branded agent name', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <TooltipProvider>
        <SidebarProvider>
          <NavigationHeader
            connectionAvailabilities={{}}
            currentPath="/"
            endpoint="http://127.0.0.1:49433"
            onConnect={vi.fn()}
            onImportSession={vi.fn()}
            onNewSession={vi.fn()}
            onNewWorkspace={vi.fn()}
            onOpenArchived={vi.fn()}
            connections={[
              {
                endpoint: 'http://127.0.0.1:17800',
                label: `Homelab ${brand.agentName}`,
                location: 'Homelab',
              },
            ]}
          />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );

  await user.click(screen.getByText('Local'));

  expect(screen.getByText('Talking to')).toBeVisible();
  expect(screen.getByText(`${brand.agentName} local`)).toBeVisible();
  expect(screen.getByText('this computer')).toBeVisible();
  expect(screen.getByText('Switch to')).toBeVisible();
  expect(screen.getByRole('menuitem', { name: /Homelab/u })).toHaveTextContent('127.0.0.1:17800');
  expect(screen.getByText('v0.9.5')).toBeVisible();
  expect(screen.getByRole('menuitem', { name: /Infrastructure/u })).toHaveAttribute(
    'href',
    '/infrastructure',
  );
  expect(screen.getByText('127.0.0.1:49433')).toBeVisible();
});

it('uses a user-defined agent name instead of forcing the branded fallback', () => {
  render(
    <MemoryRouter>
      <TooltipProvider>
        <SidebarProvider>
          <NavigationHeader
            activeLabel="Ares Research"
            activeLocation="Ares"
            connectionAvailabilities={{}}
            currentPath="/"
            endpoint="http://127.0.0.1:41849"
            onConnect={vi.fn()}
            onImportSession={vi.fn()}
            onNewSession={vi.fn()}
            onNewWorkspace={vi.fn()}
            onOpenArchived={vi.fn()}
            connections={[]}
          />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );

  expect(screen.getByText('Ares')).toBeVisible();
  expect(screen.getByText('Research')).toBeVisible();
});

it.each(['local', 'aurora'] as const)(
  'can switch away from %s and back while retaining the local launch credential',
  async (initial) => {
    const local = {
      endpoint: 'http://127.0.0.1:53211',
      label: 'This computer',
      token: 'launch-token',
    };
    const aurora = { endpoint: 'http://127.0.0.1:51211', label: 'aurora' };
    const first = initial === 'local' ? local : aurora;
    const other = initial === 'local' ? aurora : local;
    const onConnect = vi.fn();
    function Switcher() {
      const [active, setActive] = useState<ConnectionSettings>(first);
      return (
        <NavigationHeader
          activeLabel={active.label}
          connectionAvailabilities={{}}
          connections={[local, aurora]}
          currentPath="/"
          endpoint={active.endpoint}
          onConnect={(connection) => {
            onConnect(connection);
            setActive(connection);
          }}
          onImportSession={vi.fn()}
          onNewSession={vi.fn()}
          onNewWorkspace={vi.fn()}
          onOpenArchived={vi.fn()}
        />
      );
    }
    render(
      <MemoryRouter>
        <TooltipProvider>
          <SidebarProvider>
            <Switcher />
          </SidebarProvider>
        </TooltipProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    for (const destination of [other, first]) {
      await user.click(screen.getByRole('button', { name: new RegExp(brand.wordmark, 'u') }));
      expect(screen.getByText('Switch to')).toBeVisible();
      const item = screen
        .getAllByRole('menuitem')
        .find((node) => node.textContent?.includes(new URL(destination.endpoint).host));
      expect(item).toBeDefined();
      await user.click(item!);
      expect(onConnect).toHaveBeenLastCalledWith(destination);
    }
  },
);
