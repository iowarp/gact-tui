/**
 * Solid controller that syncs the URL hash to the selected transcript
 * message for deep-linking. Exports {@link createTranscriptHashNavigation}.
 */
import { createEffect, onMount, type Accessor } from 'solid-js';
import type { Message } from '@clio/core';

export interface TranscriptHashNavigationOptions {
  messages: Accessor<Message[]>;
  virtual: Accessor<boolean>;
  offsetOfIndex: (index: number) => number;
  scrollEl: Accessor<HTMLElement | undefined>;
}

export function createTranscriptHashNavigation(options: TranscriptHashNavigationOptions) {
  function jumpToHash() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const target = hash.startsWith('#msg-') ? hash.slice(1) : `msg-${hash.slice(1)}`;
    const el = document.getElementById(target);
    if (!el) {
      if (options.virtual()) {
        const id = target.replace(/^msg-/, '');
        const idx = options.messages().findIndex((m) => m.id === id);
        if (idx !== -1) {
          options.scrollEl()?.scrollTo({ top: options.offsetOfIndex(idx) });
          setTimeout(jumpToHash, 150);
        }
      }
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('trx-msg--flash');
    setTimeout(() => el.classList.remove('trx-msg--flash'), 1800);
  }

  onMount(() => {
    queueMicrotask(jumpToHash);
  });
  createEffect(() => {
    void options.messages().length;
    queueMicrotask(jumpToHash);
  });
}
