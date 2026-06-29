import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@clio/core';
import {
  createTranscriptScroll,
  transcriptDistanceFromBottom,
  transcriptIsAtBottom,
} from '../../src/routes/chatTranscriptScroll.js';

function message(id: string, text: string): Message {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text }],
  } as Message;
}

function makePane(): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientHeight', { value: 500, configurable: true });
  let scrollHeight = 1000;
  Object.defineProperty(el, 'scrollHeight', {
    get: () => scrollHeight,
    configurable: true,
  });
  Object.defineProperty(el, '__setScrollHeight', {
    value: (value: number) => {
      scrollHeight = value;
    },
  });
  el.scrollTo = ((opts: ScrollToOptions | number) => {
    el.scrollTop = typeof opts === 'object' ? (opts.top ?? 0) : opts;
    el.dispatchEvent(new Event('scroll'));
  }) as typeof el.scrollTo;
  document.body.appendChild(el);
  return el;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('chatTranscriptScroll', () => {
  it('computes bottom distance with tolerance', () => {
    const pane = makePane();
    pane.scrollTop = 500;
    expect(transcriptDistanceFromBottom(pane)).toBe(0);
    expect(transcriptIsAtBottom(pane)).toBe(true);

    pane.scrollTop = 0;
    expect(transcriptDistanceFromBottom(pane)).toBe(500);
    expect(transcriptIsAtBottom(pane)).toBe(false);
  });

  it('keeps streaming content pinned while the user is at the bottom', async () => {
    vi.useFakeTimers();
    await createRoot(async (dispose) => {
      const [messages, setMessages] = createSignal<Message[]>([message('m1', 'short')]);
      const pane = makePane();
      const controller = createTranscriptScroll({
        messages,
        activeId: () => 'sess_1',
        pendingPermission: () => null,
        pendingQuestion: () => null,
      });
      controller.setPaneRef(pane);
      pane.scrollTop = 500;
      controller.onPaneScroll();

      (pane as unknown as { __setScrollHeight: (value: number) => void }).__setScrollHeight(1500);
      setMessages([message('m1', 'short'), message('m2', 'streaming text')]);
      await flush();

      expect(pane.scrollTop).toBe(1500);
      expect(controller.scrolledUp()).toBe(false);
      expect(controller.newSinceScroll()).toBe(0);
      vi.runOnlyPendingTimers();
      dispose();
    });
    vi.useRealTimers();
  });

  it('pauses autoscroll after manual upward wheel and resumes via jump to bottom', async () => {
    vi.useFakeTimers();
    await createRoot(async (dispose) => {
      const [messages, setMessages] = createSignal<Message[]>([message('m1', 'short')]);
      const pane = makePane();
      const controller = createTranscriptScroll({
        messages,
        activeId: () => 'sess_1',
        pendingPermission: () => null,
        pendingQuestion: () => null,
      });
      controller.setPaneRef(pane);
      await flush();
      vi.runOnlyPendingTimers();
      pane.scrollTop = 100;
      controller.onPaneWheel(new WheelEvent('wheel', { deltaY: -120 }));

      (pane as unknown as { __setScrollHeight: (value: number) => void }).__setScrollHeight(1500);
      setMessages([message('m1', 'short'), message('m2', 'new while paused')]);
      await flush();

      expect(controller.scrolledUp()).toBe(true);
      expect(controller.newSinceScroll()).toBe(1);
      expect(pane.scrollTop).toBe(100);

      controller.scrollToBottom();
      expect(pane.scrollTop).toBe(1500);
      expect(controller.scrolledUp()).toBe(false);
      expect(controller.newSinceScroll()).toBe(0);
      vi.runOnlyPendingTimers();
      dispose();
    });
    vi.useRealTimers();
  });
});
