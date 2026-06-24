/**
 * localStorage-backed Solid signal factory (`createPersistedSignal`) so UI
 * preferences survive reloads.
 */
import {
  createSignal,
  type Accessor,
  type Setter,
} from 'solid-js';

/**
 * Tiny localStorage-backed signal helper. Hydrates from storage on
 * creation (synchronously, before render), then writes back on every
 * setter call. Falls through to the default value when storage is
 * unavailable (private mode / SSR / Tauri pre-load).
 */
export function createPersistedSignal<T>(
  key: string,
  defaultValue: T,
  serializer: {
    parse: (raw: string) => T;
    stringify: (v: T) => string;
  } = JSON_SERIALIZER as never,
): [Accessor<T>, Setter<T>] {
  const initial = readFromStorage(key, defaultValue, serializer.parse);
  const [value, setValue] = createSignal<T>(initial);
  const set: Setter<T> = ((next: unknown) => {
    const out =
      typeof next === 'function'
        ? (next as (prev: T) => T)(value())
        : (next as T);
    try {
      window.localStorage.setItem(key, serializer.stringify(out));
    } catch {
      // tolerated — storage full / unavailable
    }
    return setValue(out as T extends Function ? never : T);
  }) as Setter<T>;
  return [value, set];
}

const JSON_SERIALIZER = {
  parse: <T,>(s: string) => JSON.parse(s) as T,
  stringify: <T,>(v: T) => JSON.stringify(v),
} as const;

function readFromStorage<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T,
): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return parse(raw);
  } catch {
    return fallback;
  }
}

/** Convenience: persisted string signal. */
export function createPersistedString(
  key: string,
  defaultValue: string,
): [Accessor<string>, Setter<string>] {
  return createPersistedSignal<string>(key, defaultValue, {
    parse: (s) => s,
    stringify: (v) => v,
  });
}

/** Convenience: persisted boolean signal. */
export function createPersistedBoolean(
  key: string,
  defaultValue: boolean,
): [Accessor<boolean>, Setter<boolean>] {
  return createPersistedSignal<boolean>(key, defaultValue, {
    parse: (s) => s === 'true',
    stringify: (v) => (v ? 'true' : 'false'),
  });
}
