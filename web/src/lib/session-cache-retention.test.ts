import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionCacheRetainer, sessionDataBytes } from './session-cache-retention';

const clients: QueryClient[] = [];
const owners: SessionCacheRetainer[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});
function setup(maxRecent = 2, maxBytes = 1_000_000) {
  let now = 0;
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const drop = vi.fn();
  const owner = new SessionCacheRetainer(
    client,
    ['service'],
    { idleMs: 300_000, maxRecent, maxBytes },
    drop,
    () => now,
  );
  clients.push(client);
  owners.push(owner);
  const key = (id: string) => ['transcript', 'service', id];
  const visit = (id: string) => {
    owner.visit(id);
    if (!client.getQueryData(key(id))) client.setQueryData(key(id), { message: id });
  };
  return {
    client,
    owner,
    drop,
    key,
    visit,
    at: (value: number) => {
      now = value;
    },
  };
}

it('keeps a warm return, expires from departure, and preserves active data and navigation metadata', () => {
  const t = setup();
  t.visit('a');
  const original = t.client.getQueryData(t.key('a'));
  t.client.setQueryData(['sessions', 'service', 'all'], ['a', 'b']);
  t.at(1000);
  t.visit('b');
  t.at(299_000);
  t.owner.prune();
  expect(t.client.getQueryData(t.key('a'))).toBe(original);
  t.at(300_999);
  t.owner.prune();
  expect(t.drop).not.toHaveBeenCalled();
  t.at(301_000);
  t.owner.prune();
  expect(t.client.getQueryData(t.key('a'))).toBeUndefined();
  expect(t.client.getQueryData(t.key('b'))).toEqual({ message: 'b' });
  expect(t.client.getQueryData(['sessions', 'service', 'all'])).toEqual(['a', 'b']);
  expect(t.drop).toHaveBeenCalledWith('a');
});

it('caps rapid navigation by LRU count even before the TTL', () => {
  const t = setup();
  for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
    t.at(i * 10);
    t.visit(id);
  }
  t.owner.prune();
  expect(t.client.getQueryData(t.key('a'))).toBeUndefined();
  for (const id of ['b', 'c', 'd']) expect(t.client.getQueryData(t.key(id))).toBeDefined();
});

it('enforces the inactive byte budget without discarding the current session', () => {
  const t = setup(2, 128);
  t.visit('a');
  t.client.setQueryData(t.key('a'), { text: 'x'.repeat(1000) });
  t.visit('b');
  t.owner.prune();
  expect(t.drop).toHaveBeenCalledWith('a');
  expect(t.client.getQueryData(t.key('b'))).toBeDefined();
});

it('discards a bulky optional graph before the minimum functional conversation cache', () => {
  const t = setup(2, 512);
  t.visit('a');
  const graphKey = ['execution-provenance', 'service', 'a', 'native'];
  t.client.setQueryDefaults(graphKey, { meta: { sessionCache: 'supplementary' } });
  t.client.setQueryData(graphKey, { graph: 'x'.repeat(5000) });
  t.visit('b');
  t.owner.prune();
  expect(t.client.getQueryData(graphKey)).toBeUndefined();
  expect(t.client.getQueryData(t.key('a'))).toEqual({ message: 'a' });
  expect(t.drop).not.toHaveBeenCalled();
});

it('pins an explicitly observed child and gives it a full idle interval on closing', () => {
  const t = setup();
  t.visit('parent');
  t.client.setQueryData(t.key('child'), { message: 'child' });
  const observer = new QueryObserver(t.client, {
    queryKey: t.key('child'),
    queryFn: async () => ({ message: 'child' }),
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  t.at(500_000);
  t.owner.prune();
  expect(t.client.getQueryData(t.key('child'))).toBeDefined();
  unsubscribe();
  t.at(799_999);
  t.owner.prune();
  expect(t.client.getQueryData(t.key('child'))).toBeDefined();
  t.at(800_000);
  t.owner.prune();
  expect(t.client.getQueryData(t.key('child'))).toBeUndefined();
});

it('does not retain arbitrary corpus indexes, and bounds cyclic/oversized size estimation', () => {
  const t = setup(0);
  t.client.setQueryData(['all-corpus', 'service', 'x'], { permanent: true });
  t.visit('a');
  t.owner.leave('a');
  t.owner.prune();
  expect(t.client.getQueryData(['all-corpus', 'service', 'x'])).toEqual({ permanent: true });
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  expect(sessionDataBytes(cycle, 1000)).toBeLessThan(1000);
  expect(sessionDataBytes('x'.repeat(1000), 100)).toBeGreaterThan(100);
});
