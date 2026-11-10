import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { UpdateStatus } from '@/hooks/use-update-status';
import type { ConnectionSettings } from '@/lib/connection';

const mocks = vi.hoisted(() => ({
  runtime: '0.9.5' as string | undefined,
  update: undefined as UpdateStatus | undefined,
  copyText: vi.fn(async (_text: string) => {}),
}));

vi.mock('@/hooks/use-runtime-version', () => ({
  useRuntimeVersion: () => ({ version: mocks.runtime, pending: false }),
}));
vi.mock('@/hooks/use-update-status', () => ({ useUpdateStatus: () => mocks.update }));
vi.mock('@/lib/clipboard', () => ({ copyText: mocks.copyText }));

import { ClioMenuContent } from './clio-menu';

beforeEach(() => {
  mocks.runtime = '0.9.5';
  mocks.update = undefined;
  mocks.copyText.mockClear();
});
afterEach(cleanup);

function renderMenu(connections: readonly ConnectionSettings[] = []) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>CLIO</DropdownMenuTrigger>
          <ClioMenuContent
            connectionAvailabilities={{}}
            connections={connections}
            currentPath="/"
            endpoint="http://127.0.0.1:8788"
            onConnect={vi.fn()}
          />
        </DropdownMenu>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

it('checks again in place, leaving the menu open for the answer', async () => {
  const check = vi.fn();
  mocks.update = { state: 'current', check };
  const user = userEvent.setup();
  renderMenu();

  await user.click(screen.getByRole('menuitem', { name: 'Up to date. Check again' }));

  expect(check).toHaveBeenCalledOnce();
  expect(screen.getByRole('menu')).toBeVisible();
});

it('installs a found update where this interface can install it', async () => {
  const check = vi.fn();
  const install = vi.fn();
  mocks.update = { state: 'available', targetVersion: '0.9.6', check, install };
  const user = userEvent.setup();
  renderMenu();

  await user.click(screen.getByRole('menuitem', { name: 'v0.9.6 ready. Install' }));

  expect(install).toHaveBeenCalledOnce();
  expect(check).not.toHaveBeenCalled();
});

it('leaves out the update and runtime rows when nothing reports them', () => {
  mocks.runtime = undefined;
  renderMenu();

  expect(screen.queryByText(/Up to date|Check again|Not checked/u)).toBeNull();
  expect(screen.queryByText('Runtime version')).toBeNull();
  expect(screen.queryByText('Unknown')).toBeNull();
  expect(screen.getByRole('menuitem', { name: /Connection settings/u })).toBeVisible();
});

it('opens the ways to add an agent on click', async () => {
  const user = userEvent.setup();
  renderMenu();

  await user.click(screen.getByRole('menuitem', { name: /Add an agent/u }));

  expect(await screen.findByRole('menuitem', { name: /Connect by address/u })).toBeVisible();
});

it('opens the ways to add an agent with the right arrow key', async () => {
  const user = userEvent.setup();
  renderMenu();

  screen.getByRole('menuitem', { name: /Add an agent/u }).focus();
  await user.keyboard('{ArrowRight}');

  expect(await screen.findByRole('menuitem', { name: /Connect by address/u })).toBeVisible();
});

it('shows the runtime version with a v prefix', () => {
  renderMenu();

  expect(screen.getByText('Runtime version')).toBeVisible();
  expect(screen.getByText('v0.9.5')).toBeVisible();
});

it('opens the ways to add an agent in place on a phone, with Back', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: query === '(max-width: 599px)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList,
  );
  const user = userEvent.setup();
  renderMenu();

  await user.click(screen.getByRole('menuitem', { name: /Add an agent/u }));
  expect(screen.getByRole('menuitem', { name: /Connect by address/u })).toBeVisible();
  expect(screen.queryByText('Talking to')).toBeNull();
  expect(screen.getByRole('menuitem', { name: /^Add an agent$/u })).toHaveFocus();

  await user.keyboard('{ArrowLeft}');
  expect(screen.getByText('Talking to')).toBeVisible();
  expect(screen.getByRole('menuitem', { name: /Add an agent/u })).toHaveFocus();

  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('menuitem', { name: /^Add an agent$/u })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('Talking to')).toBeVisible();
  vi.restoreAllMocks();
});

it('copies the agent address and keeps the menu open', async () => {
  const user = userEvent.setup();
  renderMenu();

  await user.click(screen.getByRole('menuitem', { name: 'Address 127.0.0.1:8788. Copy' }));

  expect(mocks.copyText).toHaveBeenCalledWith('127.0.0.1:8788');
  expect(
    await screen.findByRole('menuitem', { name: 'Address 127.0.0.1:8788. Copied' }),
  ).toBeVisible();
});

it('opens with agent search, Talking to and the key footer', async () => {
  renderMenu([
    { endpoint: 'https://ares.iit.edu:8100', label: 'ares-genesis' },
    { endpoint: 'http://10.0.4.12:8100', label: 'lab-shared' },
  ]);

  expect(screen.getByText('Talking to')).toBeVisible();
  expect(screen.getByRole('searchbox', { name: 'Search agents' })).toBeVisible();
  expect(screen.getByText('move')).toBeVisible();
  expect(screen.getByText('switch')).toBeVisible();
  expect(screen.getByRole('menuitem', { name: /^Infrastructure/u })).toHaveAttribute(
    'href',
    '/infrastructure',
  );
});

it('filters saved agents as you type anywhere in the menu', async () => {
  const user = userEvent.setup();
  renderMenu([
    { endpoint: 'https://ares.iit.edu:8100', label: 'ares-genesis' },
    { endpoint: 'http://10.0.4.12:8100', label: 'lab-shared' },
  ]);

  screen.getByRole('menuitem', { name: /Connection settings/u }).focus();
  await user.keyboard('ares');

  expect(screen.getByRole('searchbox', { name: 'Search agents' })).toHaveValue('ares');
  expect(screen.getByRole('menuitem', { name: /ares-genesis/u })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: /lab-shared/u })).toBeNull();

  await user.clear(screen.getByRole('searchbox', { name: 'Search agents' }));
  await user.keyboard('nothing');
  expect(screen.getByText('No saved agent matches')).toBeVisible();
});
