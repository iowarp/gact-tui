import { brand } from '@brand';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { NavigationHeader } from './navigation-header';

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
          recentConnections={[
            { endpoint: 'http://127.0.0.1:8788', label: 'Contained' },
            { endpoint: 'http://127.0.0.1:9999', label: 'Offline lab' },
          ]}
        />
      </SidebarProvider>
    </MemoryRouter>,
  );

  await user.click(screen.getByText('Contained'));

  expect(screen.getAllByText('http://127.0.0.1:8788').length).toBeGreaterThan(0);
  expect(screen.getByText('http://127.0.0.1:9999')).toBeVisible();
  const offline = screen.getByRole('menuitem', { name: /Offline lab/u });
  expect(offline).toHaveAttribute('data-disabled');
  await user.click(offline);
  expect(onConnect).not.toHaveBeenCalled();
});

it('explains the active service status when its indicator is hovered', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
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
          recentConnections={[{ endpoint: 'http://127.0.0.1:8788', label: 'This device' }]}
        />
      </SidebarProvider>
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
          recentConnections={[
            {
              endpoint: 'http://127.0.0.1:17800',
              label: `Homelab ${brand.agentName}`,
              location: 'Homelab',
            },
          ]}
        />
      </SidebarProvider>
    </MemoryRouter>,
  );

  await user.click(screen.getByText('Local'));

  expect(screen.getByText('Connected agent')).toBeVisible();
  expect(screen.getAllByText('Local')).toHaveLength(2);
  expect(screen.getByText('Other agents')).toBeVisible();
  expect(screen.getByText('Homelab')).toBeVisible();
  expect(screen.getAllByText(brand.agentName).length).toBeGreaterThanOrEqual(3);
  expect(screen.getByText('http://127.0.0.1:49433')).toBeVisible();
});

it('uses a user-defined agent name instead of forcing the branded fallback', () => {
  render(
    <MemoryRouter>
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
          recentConnections={[]}
        />
      </SidebarProvider>
    </MemoryRouter>,
  );

  expect(screen.getByText('Ares')).toBeVisible();
  expect(screen.getByText('Research')).toBeVisible();
});
