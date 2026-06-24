/**
 * Solid controller for transcript scroll behaviour (stick-to-bottom, jump
 * pill). Exports {@link createTranscriptScroll}.
 */
import { createEffect, createSignal, untrack, type Accessor } from 'solid-js';
import type { Message, PermissionRequest, UserQuestion } from '@clio/core';

const SCROLL_BOTTOM_TOLERANCE_PX = 220;

export interface TranscriptScrollController {
  scrolledUp: Accessor<boolean>;
  newSinceScroll: Accessor<number>;
  scrollEl: Accessor<HTMLElement | undefined>;
  setPaneRef: (el: HTMLDivElement) => void;
  onPaneScroll: () => void;
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

  function distanceFromBottom(el: HTMLElement): number {
    return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
  }

  function isAtBottom(el: HTMLElement): boolean {
    return distanceFromBottom(el) < SCROLL_BOTTOM_TOLERANCE_PX;
  }

  function scrollToBottom() {
    if (!paneEl) return;
    paneEl.scrollTo({ top: paneEl.scrollHeight, behavior: 'smooth' });
    setScrolledUp(false);
    setNewSinceScroll(0);
    queueMicrotask(() => {
      if (!paneEl || !isAtBottom(paneEl)) return;
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
    const atBottom = isAtBottom(paneEl);
    if (atBottom) {
      setScrolledUp(false);
      setNewSinceScroll(0);
    } else {
      setScrolledUp(true);
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
        if (paneEl) paneEl.scrollTop = paneEl.scrollHeight;
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
        paneEl.scrollTop = empty ? 0 : paneEl.scrollHeight;
        setScrolledUp(false);
        setNewSinceScroll(0);
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
        paneEl.scrollTop = paneEl.scrollHeight;
        setScrolledUp(false);
        setNewSinceScroll(0);
      });
    }
    hadPendingPermission = hasPending;
  });

  return {
    scrolledUp,
    newSinceScroll,
    scrollEl,
    setPaneRef: (el) => {
      paneEl = el;
      setScrollEl(el);
    },
    onPaneScroll,
    scrollToBottom,
  };
}
