import { describe, expect, it, vi } from 'vitest';
import type { SessionEventSink } from '../../src/live.js';
import { createChatLiveTranscriptEvents } from '../../src/routes/chatLiveTranscriptEvents.js';

function sessionEvents(): SessionEventSink {
  return {
    patch: vi.fn(),
    setRaw: vi.fn(),
    refetch: vi.fn(),
    onTitleChanged: vi.fn(),
  };
}

describe('createChatLiveTranscriptEvents', () => {
  it('preserves session event callbacks while adding inspector refresh hooks', () => {
    const base = sessionEvents();
    const refetchFrames = vi.fn();
    const refetchContextFiles = vi.fn();
    const refetchSessionDiffs = vi.fn();
    const handlers = createChatLiveTranscriptEvents({
      sessionEvents: base,
      refetchFrames,
      refetchContextFiles,
      refetchSessionDiffs,
      toastPush: vi.fn(),
    });

    expect(handlers.patch).toBe(base.patch);
    expect(handlers.setRaw).toBe(base.setRaw);
    expect(handlers.refetch).toBe(base.refetch);
    expect(handlers.onTitleChanged).toBe(base.onTitleChanged);

    handlers.onFrameChanged?.();
    handlers.onContextFilesChanged?.();
    handlers.onDiffChanged?.();

    expect(refetchFrames).toHaveBeenCalledOnce();
    expect(refetchContextFiles).toHaveBeenCalledOnce();
    expect(refetchSessionDiffs).toHaveBeenCalledOnce();
  });

  it('maps backend notifications to toast inputs', () => {
    const toastPush = vi.fn();
    const handlers = createChatLiveTranscriptEvents({
      sessionEvents: sessionEvents(),
      refetchFrames: vi.fn(),
      refetchContextFiles: vi.fn(),
      refetchSessionDiffs: vi.fn(),
      toastPush,
    });

    handlers.onNotification?.({
      level: 'warning',
      title: 'Retry requested',
      body: 'waiting',
    });

    expect(toastPush).toHaveBeenCalledWith({
      tone: 'warn',
      title: 'Retry requested',
      body: 'waiting',
      duration: 3500,
    });
  });
});
