/**
 * Windowed virtualisation for the transcript list: computes the visible message
 * range and spacer heights from scroll position.
 */
import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { Message } from '@clio/core';

// ---- Virtual windowing (1.0 item 6) ----
// Past this many messages only the on-screen slice (+ buffer) renders;
// spacer divs preserve the scroll geometry so the scrollbar, autoscroll
// and jump-to-bottom keep working. Below the threshold behavior is
// byte-identical to the original full render.
const VIRTUAL_THRESHOLD = 150;
const VIRTUAL_BUFFER = 10;
const EST_HEIGHT = 132;
/** Flex gap between .trx children — included in per-message height. */
const TRX_GAP = 24;

export interface TranscriptVirtualWindow {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
}

export interface TranscriptVirtualization {
  virtual: Accessor<boolean>;
  vwindow: Accessor<TranscriptVirtualWindow>;
  visible: Accessor<Message[]>;
  offsetOfIndex: (idx: number) => number;
}

export function createTranscriptVirtualization(options: {
  messages: Accessor<Message[]>;
  scrollEl: Accessor<HTMLElement | undefined>;
  currentMatchKey: Accessor<string | undefined>;
}): TranscriptVirtualization {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewH, setViewH] = createSignal(900);
  const [measureTick, setMeasureTick] = createSignal(0);
  const measured = new Map<string, number>();

  const virtual = () => options.messages().length > VIRTUAL_THRESHOLD && !!options.scrollEl();

  createEffect(() => {
    const el = options.scrollEl();
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    onScroll();
    setViewH(el.clientHeight || 900);
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => setViewH(el.clientHeight || 900));
      ro.observe(el);
    }
    onCleanup(() => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    });
  });

  const heightOf = (id: string) => measured.get(id) ?? EST_HEIGHT;

  const vwindow = createMemo<TranscriptVirtualWindow>(() => {
    const msgs = options.messages();
    if (!virtual()) {
      return { start: 0, end: msgs.length, padTop: 0, padBottom: 0 };
    }
    void measureTick();
    const top = scrollTop();
    const vh = viewH();
    let acc = 0;
    let start = 0;
    while (start < msgs.length && acc + heightOf(msgs[start]!.id) < top) {
      acc += heightOf(msgs[start]!.id);
      start++;
    }

    let end = start;
    let fill = 0;
    while (end < msgs.length && fill < vh + 400) {
      fill += heightOf(msgs[end]!.id);
      end++;
    }

    const bStart = Math.max(0, start - VIRTUAL_BUFFER);
    const bEnd = Math.min(msgs.length, end + VIRTUAL_BUFFER);
    let padTop = 0;
    for (let i = 0; i < bStart; i++) padTop += heightOf(msgs[i]!.id);
    let padBottom = 0;
    for (let i = bEnd; i < msgs.length; i++) padBottom += heightOf(msgs[i]!.id);
    return { start: bStart, end: bEnd, padTop, padBottom };
  });

  const visible = createMemo(() => {
    const w = vwindow();
    const msgs = options.messages();
    return virtual() ? msgs.slice(w.start, w.end) : msgs;
  });

  createEffect(() => {
    if (!virtual()) return;
    const slice = visible();
    requestAnimationFrame(() => {
      let changed = false;
      for (const m of slice) {
        const el = document.getElementById(`msg-${m.id}`);
        if (!el) continue;
        const h = el.offsetHeight + TRX_GAP;
        if (h > TRX_GAP && Math.abs((measured.get(m.id) ?? 0) - h) > 1) {
          measured.set(m.id, h);
          changed = true;
        }
      }
      if (changed) setMeasureTick((n) => n + 1);
    });
  });

  function offsetOfIndex(idx: number): number {
    let sum = 0;
    const msgs = options.messages();
    for (let i = 0; i < idx && i < msgs.length; i++) {
      sum += heightOf(msgs[i]!.id);
    }
    return sum;
  }

  createEffect(() => {
    const key = options.currentMatchKey();
    if (!key || !virtual()) return;
    const msgId = key.slice(0, key.lastIndexOf(':'));
    const idx = options.messages().findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const w = vwindow();
    if (idx >= w.start && idx < w.end) return;
    options.scrollEl()?.scrollTo({ top: offsetOfIndex(idx), behavior: 'auto' });
  });

  return { virtual, vwindow, visible, offsetOfIndex };
}
