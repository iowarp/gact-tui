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
