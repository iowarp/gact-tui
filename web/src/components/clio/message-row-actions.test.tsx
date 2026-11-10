import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeferredMessageActions } from './message-row-actions';

function mockMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.spyOn(window, 'matchMedia').mockImplementation(() => media as unknown as MediaQueryList);
  return {
    change(next: boolean) {
      media.matches = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

function renderActions() {
  return render(
    <div data-message-id="m1">
      <DeferredMessageActions>
        <button type="button">Copy message</button>
      </DeferredMessageActions>
    </div>,
  );
}

describe('DeferredMessageActions', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows actions at once below sm, where they are always visible', () => {
    mockMedia(false);
    renderActions();
    expect(window.matchMedia).toHaveBeenCalledWith('(hover: hover) and (min-width: 40rem)');
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
  });

  it('waits for hover on wide hover devices and mounts when the window narrows', () => {
    const media = mockMedia(true);
    renderActions();
    expect(screen.queryByRole('button', { name: 'Copy message' })).not.toBeInTheDocument();
    media.change(false);
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
  });
});
