import type { Query, QueryClient } from '@tanstack/react-query';

/** Retention is independent of freshness: cached reads still reconcile through REST/SSE. */
export interface SessionCachePolicy {
  idleMs: number;
  maxRecent: number;
  maxBytes: number;
}

const SESSION_READS = new Set([
  'transcript',
  'session-artifacts',
  'session-context',
  'session-observability',
  'execution-provenance',
  'session-agent',
  'variant-runs',
  'task-flow',
  'response-feedback',
]);

/** Read an engineering configuration override, rejecting invalid or negative values. */
function configured(value: unknown, fallback: number): number {
  const number = value === undefined || value === '' ? fallback : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export const SESSION_CACHE_POLICY: SessionCachePolicy = {
  idleMs: configured(import.meta.env.VITE_SESSION_CACHE_IDLE_MS, 5 * 60_000),
  maxRecent: Math.floor(configured(import.meta.env.VITE_SESSION_CACHE_MAX_RECENT, 2)),
  maxBytes: configured(import.meta.env.VITE_SESSION_CACHE_MAX_BYTES, 32 * 1024 * 1024),
};

/** Bound estimation work too: oversize/complex entries are discarded conservatively. */
export function sessionDataBytes(value: unknown, ceiling: number): number {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  let bytes = 0;
  let visits = 0;
  while (pending.length && bytes <= ceiling && visits++ < 100_000) {
    const item = pending.pop();
    if (typeof item === 'string') bytes += item.length * 2;
    else if (item && typeof item === 'object' && !seen.has(item)) {
      seen.add(item);
      bytes += 32;
      // Enumerate lazily too: materializing Object.entries on a huge array
      // would allocate the very unbounded temporary this budget avoids.
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue;
        bytes += key.length * 2 + 8;
        if (bytes > ceiling || pending.length + visits >= 100_000) return ceiling + 1;
        pending.push(Reflect.get(item, key));
      }
    } else bytes += 8;
  }
  return pending.length ? ceiling + 1 : bytes;
}

/** Own only the recent visited/read session set; never preload a conversation corpus. */
export class SessionCacheRetainer {
  private active = '';
  private recent = new Map<string, number>();
  private timer?: ReturnType<typeof setTimeout>;
  private sizes = new WeakMap<object, number>();
  private unsubscribe: () => void;

  constructor(
    private client: QueryClient,
    private scopes: readonly string[],
    private policy: SessionCachePolicy,
    private dropProjection: (id: string) => void,
    private now: () => number = Date.now,
  ) {
    this.unsubscribe = client.getQueryCache().subscribe((event) => {
      const id = this.sessionOf(event.query);
      if (!id || id === this.active) return;
      if (event.type === 'updated' && event.action.type === 'success') {
        if (!this.recent.has(id)) this.recent.set(id, this.now());
        this.schedule();
      } else if (event.type === 'observerRemoved') {
        this.recent.set(id, this.now());
        this.schedule();
      }
    });
  }

  /** Pin the conversation being used and retain its predecessor for a bounded return. */
  visit(id: string): void {
    if (this.active && this.active !== id) this.recent.set(this.active, this.now());
    this.active = id;
    this.recent.delete(id);
    this.schedule();
  }

  /** Start idle retention when the user leaves, including navigation to Settings. */
  leave(id: string): void {
    if (this.active !== id) return;
    this.active = '';
    this.recent.set(id, this.now());
    this.schedule();
  }

  /** Release timers and subscriptions when their QueryClient is retired. */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.unsubscribe();
  }

  private sessionOf(query: Query): string | undefined {
    const [namespace, scope, id] = query.queryKey;
    return SESSION_READS.has(String(namespace)) &&
      this.scopes.includes(String(scope)) &&
      typeof id === 'string'
      ? id
      : undefined;
  }

  /** Retire unused data by idle time, then LRU count and approximate byte budget. */
  prune(): void {
    const queries = this.client.getQueryCache().getAll();
    const candidates = [...this.recent].sort((a, b) => b[1] - a[1]);
    let count = 0;
    let bytes = 0;
    for (const [id, leftAt] of candidates) {
      if (id === this.active) continue;
      const owned = queries.filter((query) => this.sessionOf(query) === id);
      // An explicitly open child canvas is active too, even with another main session.
      if (
        owned.some(
          (query) =>
            query.isActive() &&
            ['transcript', 'task-flow', 'session-context', 'session-observability'].includes(
              String(query.queryKey[0]),
            ),
        )
      ) {
        this.recent.set(id, this.now());
        continue;
      }
      const unused = owned.filter((query) => !query.isActive());
      let size = 0;
      const supplementary: Array<{ query: Query; bytes: number }> = [];
      for (const query of unused) {
        const data = query.state.data;
        let queryBytes: number;
        if (data && typeof data === 'object') {
          let cached = this.sizes.get(data);
          if (cached === undefined) {
            cached = sessionDataBytes(data, this.policy.maxBytes);
            this.sizes.set(data, cached);
          }
          queryBytes = cached;
        } else queryBytes = sessionDataBytes(data, this.policy.maxBytes);
        size += queryBytes;
        if (query.meta?.sessionCache === 'supplementary') {
          supplementary.push({ query, bytes: queryBytes });
        }
      }
      // Keep the minimum functional conversation warm before optional heavy views.
      // These values live only in the query cache, not the normalized projection.
      if (this.now() - leftAt < this.policy.idleMs && count < this.policy.maxRecent) {
        for (const entry of supplementary.sort((a, b) => b.bytes - a.bytes)) {
          if (bytes + size <= this.policy.maxBytes) break;
          void this.client.cancelQueries({ queryKey: entry.query.queryKey, exact: true });
          this.client.removeQueries({ queryKey: entry.query.queryKey, exact: true });
          size -= entry.bytes;
        }
      }
      if (
        this.now() - leftAt >= this.policy.idleMs ||
        count >= this.policy.maxRecent ||
        bytes + size > this.policy.maxBytes
      ) {
        for (const query of unused) {
          void this.client.cancelQueries({ queryKey: query.queryKey, exact: true });
          this.client.removeQueries({ queryKey: query.queryKey, exact: true });
        }
        this.recent.delete(id);
        this.dropProjection(id);
      } else {
        count += 1;
        bytes += size;
      }
    }
    this.schedule(false);
  }

  private schedule(immediate = true): void {
    if (this.timer) clearTimeout(this.timer);
    if (!this.recent.size) return;
    const next = Math.min(...this.recent.values()) + this.policy.idleMs - this.now();
    // Visible child observers stay pinned; recheck them without a zero-delay loop.
    this.timer = setTimeout(
      () => this.prune(),
      immediate ? 0 : Math.min(2_147_483_647, Math.max(1000, next)),
    );
  }
}
