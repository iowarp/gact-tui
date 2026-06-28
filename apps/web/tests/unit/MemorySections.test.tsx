import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@clio/core';
import {
  humanWhen,
  memoryEventTypeTone,
  MemoryEventsSection,
  MemorySearchSection,
} from '../../src/routes/discovery/MemorySections.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MemorySections', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T12:00:00Z'));
  });

  it('debounces memory search and renders hits', async () => {
    const memorySearch = vi.fn(async () => ({
      query: 'San Diego',
      hits: [
        {
          session_id: 'session-abcdef',
          message_id: 'msg-1',
          role: 'assistant',
          text: 'Nearest station is P475.',
          score: 0.91,
        },
      ],
    }));
    const client = { memorySearch } as unknown as Client;

    render(() => <MemorySearchSection client={client} />);

    fireEvent.input(screen.getByTestId('memory-search-input'), {
      target: { value: 'San Diego' },
    });
    expect(memorySearch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);

    await waitFor(() => expect(memorySearch).toHaveBeenCalledWith('San Diego', { limit: 50 }));
    await waitFor(() =>
      expect(screen.getByTestId('memory-search-hit-msg-1').textContent).toContain(
        'Nearest station is P475.',
      ),
    );
  });

  it('renders session memory events and relative timestamps', () => {
    render(() => (
      <MemoryEventsSection
        activeSessionId="session-1"
        events={[
          {
            id: 'event-1',
            type: 'memory.search.completed',
            scope: 'session',
            message: 'Recall completed',
            created_at: '2026-06-20T11:45:00Z',
          },
        ]}
      />
    ));

    expect(screen.getByTestId('memory-events-toggle').textContent).toContain('(1)');
    expect(screen.getByTestId('memory-event-event-1').textContent).toContain(
      'Recall completed',
    );
    expect(screen.getByTestId('memory-event-event-1').textContent).toContain('15m');
  });

  it('keeps invalid timestamps readable', () => {
    expect(humanWhen('not-a-date')).toBe('not-a-date');
  });

  it('formats relative timestamps and event type tones deterministically', () => {
    const now = new Date('2026-06-20T12:00:00Z').getTime();
    expect(humanWhen('2026-06-20T11:59:45Z', now)).toBe('just now');
    expect(humanWhen('2026-06-20T11:45:00Z', now)).toBe('15m');
    expect(humanWhen('2026-06-20T09:00:00Z', now)).toBe('3h');
    expect(humanWhen('2026-06-18T12:00:00Z', now)).toBe('2d');

    expect(memoryEventTypeTone('memory.search.completed')).toBe('memory');
    expect(memoryEventTypeTone()).toBe('event');
  });
});
