import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/App', () => ({ default: () => <div>App content</div> }));
vi.mock('@/components/ai-elements/prompt-input', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ai-elements/prompt-input')>();
  return {
    ...actual,
    useProviderAttachments: () => {
      throw new Error('composer draft state exploded');
    },
  };
});

import { RouteErrorBoundary } from './route-error-boundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RouteErrorBoundary', () => {
  it('catches a throw from inside the composer providers instead of leaving it unhandled', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <MemoryRouter initialEntries={['/workspaces/ws_1/sessions/sess_1']}>
        <RouteErrorBoundary />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByText(/could not display this workspace/iu)).toBeVisible();
    consoleError.mockRestore();
  });
});
