import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@clio/core';
import { ServerSearchPanel } from '../../src/components/ServerSearchPanel.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ServerSearchPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('debounces backend transcript search and renders hits', async () => {
    const searchSessionMessages = vi.fn(async () => ({
      matches: [
        {
          message_id: 'msg-1',
          role: 'assistant',
          snippet: 'Nearest station is P475.',
          score: 0.91,
        },
      ],
    }));
    const client = { searchSessionMessages } as unknown as Client;
    const onClose = vi.fn();

    render(() => (
      <ServerSearchPanel
        open
        client={client}
        sessionId="session-1"
        onJump={() => undefined}
        onClose={onClose}
      />
    ));

    fireEvent.input(screen.getByTestId('server-search-input'), {
      target: { value: 'San Diego' },
    });
    expect(searchSessionMessages).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);

    await waitFor(() =>
      expect(searchSessionMessages).toHaveBeenCalledWith('session-1', 'San Diego'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('server-search-hit-msg-1').textContent).toContain(
        'Nearest station is P475.',
      ),
    );
  });
});
