/**
 * Solid controller for transcript scroll behaviour (stick-to-bottom, jump
 * pill). Exports {@link createTranscriptScroll}.
 */
import { createEffect, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';
import type { Message, PermissionRequest, UserQuestion } from '@clio/core';

export const SCROLL_BOTTOM_TOLERANCE_PX = 220;

export function transcriptDistanceFromBottom(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
}

export function transcriptIsAtBottom(el: HTMLElement): boolean {
  return transcriptDistanceFromBottom(el) < SCROLL_BOTTOM_TOLERANCE_PX;
}

export interface TranscriptScrollController {
  scrolledUp: Accessor<boolean>;
  newSinceScroll: Accessor<number>;
  scrollEl: Accessor<HTMLElement | undefined>;
  setPaneRef: (el: HTMLDivElement) => void;
  onPaneScroll: () => void;
  onPaneWheel: (event: WheelEvent) => void;
  scrollToBottom: () => void;
}

export interface TranscriptScrollOptions {
  messages: Accessor<Message[]>;
  activeId: Accessor<string>;
  pendingPermission: Accessor<PermissionRequest | null>;
  pendingQuestion: Accessor<UserQuestion | null | undefined>;
}

export function createTranscriptScroll(
  options: TranscriptScrollOptions,
): TranscriptScrollController {
  const [scrolledUp, setScrolledUp] = createSignal(false);
  const [newSinceScroll, setNewSinceScroll] = createSignal(0);
  const [scrollEl, setScrollEl] = createSignal<HTMLElement>();

  let paneEl: HTMLDivElement | undefined;
  let lastMessageCount = 0;
  let lastTranscriptActivity = '';
  let hadPendingPermission = false;
  let programmaticScroll = false;
  let resizeObserver: ResizeObserver | undefined;
  let pendingAutoPinFrame = 0;

  function endProgrammaticScrollSoon() {
    window.setTimeout(() => {
      programmaticScroll = false;
      if (!paneEl || !transcriptIsAtBottom(paneEl)) return;
      setScrolledUp(false);
      setNewSinceScroll(0);
    }, 180);
  }

  function pinToBottom(behavior: ScrollBehavior = 'auto') {
    if (!paneEl) return;
    programmaticScroll = true;
    paneEl.scrollTo({ top: paneEl.scrollHeight, behavior });
    setScrolledUp(false);
    setNewSinceScroll(0);
    endProgrammaticScrollSoon();
  }

  function scheduleAutoPin() {
    if (!paneEl || scrolledUp()) return;
    if (pendingAutoPinFrame) window.cancelAnimationFrame(pendingAutoPinFrame);
    pendingAutoPinFrame = window.requestAnimationFrame(() => {
      pendingAutoPinFrame = 0;
      if (!paneEl || scrolledUp()) return;
      pinToBottom('auto');
    });
  }

  function scrollToBottom() {
    pinToBottom('smooth');
    queueMicrotask(() => {
      if (!paneEl || !transcriptIsAtBottom(paneEl)) return;
      setScrolledUp(false);
      setNewSinceScroll(0);
    });
  }

  function transcriptActivityKey(): string {
    return options
      .messages()
      .map((message) => {
        const partKey = message.parts
          .map((part) => {
            if (part.type === 'text') return part.text?.length ?? 0;
            if (part.type === 'thinking') return (part.text ?? part.thinking ?? '').length;
            return part.type;
          })
          .join(',');
        return `${message.id}:${message.stop_reason ?? ''}:${partKey}`;
      })
      .join('|');
  }

  function onPaneScroll() {
    if (!paneEl) return;
    const atBottom = transcriptIsAtBottom(paneEl);
    if (atBottom) {
      setScrolledUp(false);
      setNewSinceScroll(0);
    } else if (!programmaticScroll) {
      setScrolledUp(true);
    }
  }

  function onPaneWheel(event: WheelEvent) {
    if (!paneEl) return;
    programmaticScroll = false;
    if (event.deltaY < 0 && !transcriptIsAtBottom(paneEl)) {
      setScrolledUp(true);
      return;
    }
    if (event.deltaY > 0 && transcriptIsAtBottom(paneEl)) {
      setScrolledUp(false);
      setNewSinceScroll(0);
    } else {
      onPaneScroll();
    }
  }

  createEffect(() => {
    const count = options.messages().length;
    const activity = transcriptActivityKey();
    const changed = activity !== lastTranscriptActivity;
    if (scrolledUp() && count > lastMessageCount) {
      setNewSinceScroll((n) => n + (count - lastMessageCount));
    } else if (!scrolledUp() && changed && paneEl) {
      queueMicrotask(() => {
        pinToBottom('auto');
      });
    }
    lastMessageCount = count;
    lastTranscriptActivity = activity;
  });

  createEffect(() => {
    void options.activeId();
    queueMicrotask(() => {
      if (paneEl && !options.pendingPermission()) {
        const empty = untrack(() => options.messages().length === 0 && !options.pendingQuestion());
        programmaticScroll = true;
        paneEl.scrollTop = empty ? 0 : paneEl.scrollHeight;
        setScrolledUp(false);
        setNewSinceScroll(0);
        endProgrammaticScrollSoon();
      }
      const input = document.querySelector(
        '[data-testid="composer-input"]',
      ) as HTMLTextAreaElement | null;
      const active = document.activeElement;
      const focusable =
        active == null ||
        active === document.body ||
        (active as HTMLElement).dataset?.testid === 'composer-input';
      if (input && focusable) input.focus();
    });
  });

  createEffect(() => {
    if (!options.pendingPermission()) return;
    queueMicrotask(() => {
      const card = paneEl?.querySelector('[data-testid="permission-card"]') as HTMLElement | null;
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  createEffect(() => {
    const hasPending = !!options.pendingPermission();
    if (hadPendingPermission && !hasPending) {
      queueMicrotask(() => {
        if (!paneEl) return;
        pinToBottom('auto');
        setScrolledUp(false);
        setNewSinceScroll(0);
      });
    }
    hadPendingPermission = hasPending;
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    if (pendingAutoPinFrame) window.cancelAnimationFrame(pendingAutoPinFrame);
  });

  return {
    scrolledUp,
    newSinceScroll,
    scrollEl,
    setPaneRef: (el) => {
      paneEl = el;
      setScrollEl(el);
      resizeObserver?.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => scheduleAutoPin());
        resizeObserver.observe(el);
        const inner = el.firstElementChild;
        if (inner instanceof HTMLElement) resizeObserver.observe(inner);
      }
    },
    onPaneScroll,
    onPaneWheel,
    scrollToBottom,
  };
}
