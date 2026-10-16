import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { RelaySettings } from './relay-settings';

const useRepository = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-repository', () => ({ useRepository }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('routes legacy remote-tool settings to MCP connections without calling the removed owner', () => {
  render(
    <MemoryRouter>
      <RelaySettings />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Open tool connections' })).toHaveAttribute(
    'href',
    '/infrastructure/tools',
  );
  expect(screen.getByText(/not converted automatically/u)).toBeVisible();
  expect(useRepository).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Access credential')).not.toBeInTheDocument();
});
