import { describe, expect, it } from 'vitest';
import {
  addBackend,
  currentBackend,
  EMPTY_REGISTRY,
  InMemoryPersistence,
  LocalStoragePersistence,
  removeBackend,
  setCurrent,
  updateBackend,
  type BackendEntry,
} from '../src/store/backends.js';

const a: BackendEntry = {
  id: 'a',
  label: 'local sidecar',
  url: 'http://127.0.0.1:17800',
  bearerToken: 'tok-a',
  kind: 'local-sidecar',
};

const b: BackendEntry = {
  id: 'b',
  label: 'remote alcf',
  url: 'http://alcf.example.com:8100',
  bearerToken: 'tok-b',
  kind: 'http',
};

describe('backend registry reducers', () => {
  it('addBackend appends and auto-selects when none was current', () => {
    const next = addBackend(EMPTY_REGISTRY, a);
    expect(next.backends).toEqual([a]);
    expect(next.currentId).toBe('a');
  });

  it('addBackend preserves currentId when one is already set', () => {
    const one = addBackend(EMPTY_REGISTRY, a);
    const two = addBackend(one, b);
    expect(two.backends.map((x) => x.id)).toEqual(['a', 'b']);
    expect(two.currentId).toBe('a');
  });

  it('addBackend dedupes by url+kind', () => {
    const dupe: BackendEntry = { ...a, id: 'a2' };
    const next = addBackend(addBackend(EMPTY_REGISTRY, a), dupe);
    expect(next.backends).toHaveLength(1);
    expect(next.backends[0]!.id).toBe('a2');
  });

  it('removeBackend drops the entry and reassigns current if needed', () => {
    const both = addBackend(addBackend(EMPTY_REGISTRY, a), b);
    const next = removeBackend(both, 'a');
    expect(next.backends.map((x) => x.id)).toEqual(['b']);
    expect(next.currentId).toBe('b');
  });

  it('setCurrent only accepts known ids', () => {
    const one = addBackend(EMPTY_REGISTRY, a);
    expect(setCurrent(one, 'ghost')).toEqual(one);
    expect(setCurrent(one, 'a').currentId).toBe('a');
  });

  it('updateBackend patches the named entry', () => {
    const one = addBackend(EMPTY_REGISTRY, a);
    const patched = updateBackend(one, 'a', { label: 'renamed', lastError: 'boom' });
    expect(patched.backends[0]!.label).toBe('renamed');
    expect(patched.backends[0]!.lastError).toBe('boom');
  });

  it('currentBackend falls back to first when no currentId', () => {
    const state = { backends: [a, b], currentId: null };
    expect(currentBackend(state)?.id).toBe('a');
  });
});

describe('persistence', () => {
  it('InMemoryPersistence round-trips state', async () => {
    const p = new InMemoryPersistence();
    const start = addBackend(EMPTY_REGISTRY, a);
    await p.save(start);
    expect(await p.load()).toEqual(start);
  });

  it('LocalStoragePersistence round-trips via a Storage shim', async () => {
    const m = new Map<string, string>();
    const shim: Storage = {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k) => m.get(k) ?? null,
      key: (i) => Array.from(m.keys())[i] ?? null,
      removeItem: (k) => {
        m.delete(k);
      },
      setItem: (k, v) => {
        m.set(k, v);
      },
    };
    const p = new LocalStoragePersistence(shim);
    const start = addBackend(EMPTY_REGISTRY, a);
    await p.save(start);
    expect(await p.load()).toEqual(start);
    expect(m.has('clio.backends.v1')).toBe(true);
  });

  it('LocalStoragePersistence returns empty on malformed JSON', async () => {
    const m = new Map<string, string>([['clio.backends.v1', '{not json']]);
    const shim: Storage = {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k) => m.get(k) ?? null,
      key: (i) => Array.from(m.keys())[i] ?? null,
      removeItem: (k) => {
        m.delete(k);
      },
      setItem: (k, v) => {
        m.set(k, v);
      },
    };
    const p = new LocalStoragePersistence(shim);
    expect(await p.load()).toEqual(EMPTY_REGISTRY);
  });
});
