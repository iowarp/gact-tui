import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioToolInvocation } from './tool-invocation';

const repository = { sendScriptsToBackground: vi.fn(async () => 1) };
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

afterEach(cleanup);
beforeEach(() => {
  repository.sendScriptsToBackground.mockClear();
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
});

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

const script = 'import asyncio\nfor tile in tiles:\n    await read_window(tile)';

describe('Send a running script to the background', () => {
  it('moves a running foreground script and then says it moved', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <ClioToolInvocation
          tool={{
            id: 'run',
            session_id: 'sess_tahoe',
            name: 'run_code',
            state: 'running',
            input: { code: script },
          }}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Send to background' }));
    expect(repository.sendScriptsToBackground).toHaveBeenCalledWith('sess_tahoe');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Moved to the background' })).toBeDisabled(),
    );
  });

  it('is not offered for a background launch or a finished script', () => {
    render(
      wrap(
        <>
          <ClioToolInvocation
            tool={{
              id: 'bg',
              session_id: 's',
              name: 'run_code',
              state: 'running',
              input: { code: script, background: true },
            }}
          />
          <ClioToolInvocation
            tool={{
              id: 'done',
              session_id: 's',
              name: 'run_code',
              state: 'succeeded',
              input: { code: script },
            }}
          />
        </>,
      ),
    );
    expect(screen.queryByRole('button', { name: 'Send to background' })).toBeNull();
  });
});
