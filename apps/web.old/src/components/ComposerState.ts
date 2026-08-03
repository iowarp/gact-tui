/**
 * State container for Composer.
 */
import { createEffect, untrack, type Accessor, type Setter } from 'solid-js';

const HISTORY_CAP = 100;

export interface ComposerHistory {
  push(text: string): void;
  previous(): string | null;
  next(): string | null;
  exit(): void;
}

export function createComposerHistory(options: {
  historyKey: Accessor<string>;
  currentText: Accessor<string>;
}): ComposerHistory {
  let cursor = -1;
  let draft = '';

  function read(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(options.historyKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  function push(text: string): void {
    if (!text.trim()) return;
    const history = read();
    if (history.length > 0 && history[history.length - 1] === text) return;
    history.push(text);
    while (history.length > HISTORY_CAP) history.shift();
    try {
      localStorage.setItem(options.historyKey(), JSON.stringify(history));
    } catch {
      // ignore quota
    }
  }

  function previous(): string | null {
    const history = read();
    if (history.length === 0) return null;
    if (cursor < 0) {
      draft = options.currentText();
      cursor = history.length;
    }
    if (cursor > 0) cursor--;
    if (cursor >= history.length) cursor = history.length - 1;
    return history[cursor] ?? null;
  }

  function next(): string | null {
    if (cursor < 0) return null;
    const history = read();
    cursor++;
    if (cursor >= history.length) {
      const out = draft;
      cursor = -1;
      draft = '';
      return out;
    }
    return history[cursor] ?? null;
  }

  function exit(): void {
    cursor = -1;
    draft = '';
  }

  return { push, previous, next, exit };
}

function draftStorageKey(key: string): string {
  return `clio.draft.${key}`;
}

export function createComposerDraftPersistence(options: {
  draftKey: Accessor<string | undefined>;
  draftReloadTick: Accessor<number | undefined>;
  text: Accessor<string>;
  setText: Setter<string>;
}): void {
  let lastKey: string | undefined;
  createEffect(() => {
    const key = options.draftKey();
    if (typeof window === 'undefined') return;
    untrack(() => {
      if (lastKey && lastKey !== key) {
        const outgoing = options.text();
        try {
          if (outgoing) localStorage.setItem(draftStorageKey(lastKey), outgoing);
          else localStorage.removeItem(draftStorageKey(lastKey));
        } catch {
          /* ignore */
        }
      }
      if (key) {
        try {
          const restored = localStorage.getItem(draftStorageKey(key)) ?? '';
          const current = options.text();
          if (!restored && current && lastKey === '__new') {
            try {
              localStorage.setItem(draftStorageKey(key), current);
            } catch {
              /* ignore */
            }
          } else if (restored !== current) {
            options.setText(restored);
          }
        } catch {
          options.setText('');
        }
      } else if (!lastKey) {
        // First mount without a key: leave the current draft intact.
      } else if (options.text() !== '') {
        options.setText('');
      }
      lastKey = key;
    });
  });

  let lastReloadTick: number | undefined;
  createEffect(() => {
    const tick = options.draftReloadTick();
    if (tick === undefined) return;
    if (lastReloadTick === undefined) {
      lastReloadTick = tick;
      return;
    }
    if (tick === lastReloadTick) return;
    lastReloadTick = tick;
    const key = options.draftKey();
    if (!key || typeof window === 'undefined') return;
    try {
      const restored = localStorage.getItem(draftStorageKey(key)) ?? '';
      options.setText(restored);
    } catch {
      /* ignore */
    }
  });

  createEffect(() => {
    const key = options.draftKey();
    const current = options.text();
    if (typeof window === 'undefined' || !key) return;
    try {
      if (current) localStorage.setItem(draftStorageKey(key), current);
      else localStorage.removeItem(draftStorageKey(key));
    } catch {
      /* ignore */
    }
  });
}
