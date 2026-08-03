/**
 * Multi-connection contract (gact-tui#338).
 *
 * D1: the client holds N first-class connections; sessions are homed on one
 * backend and union views are assembled client-side. There is no hub.
 *
 * The declared top risk for this slice (#322) is hidden cross-connection state
 * leaks — theme, toasts and persistence were app-global in the legacy app. The
 * leak cases below are the point of this file, not an afterthought.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ConnectionPool,
  type ConnectionProbe,
} from '../../src/connections/ConnectionPool';

const caps = (contract: string, name = 'clio-agent-gact') => ({
  contract_version: contract,
  backend: { name, version: '0.10.0', vendor: 'iowarp' },
  capabilities: { sessions: true, mcp: true },
  transports: { sse: true },
  auth: { schemes: ['trust_socket'] },
  extensions: [],
});

/** A probe that answers per-URL, so connections cannot be confused for one another. */
function probeFor(table: Record<string, unknown>): ConnectionProbe {
  return async (url) => {
    const entry = table[url];
    if (!entry) throw new Error(`unreachable: ${url}`);
    if (entry instanceof Error) throw entry;
    return entry as never;
  };
}

describe('ConnectionPool', () => {
  it('holds several connections at once, each with its own identity', async () => {
    const pool = new ConnectionPool(
      probeFor({
        'http://a.test': caps('0.2', 'backend-a'),
        'http://b.test': caps('0.2', 'backend-b'),
      }),
    );
    await pool.connect({ id: 'a', label: 'A', url: 'http://a.test' });
    await pool.connect({ id: 'b', label: 'B', url: 'http://b.test' });

    expect(pool.list()).toHaveLength(2);
    expect(pool.get('a')?.capabilities?.backend.name).toBe('backend-a');
    expect(pool.get('b')?.capabilities?.backend.name).toBe('backend-b');
  });

  it('refuses an unsupported contract LOUDLY and keeps the connection listed', async () => {
    const pool = new ConnectionPool(probeFor({ 'http://old.test': caps('0.1') }));
    const result = await pool.connect({ id: 'old', label: 'Old', url: 'http://old.test' });

    expect(result.status).toBe('refused');
    expect(result.reason).toBe('unsupported_contract');
    expect(result.detail).toContain('0.1');
    // Listed, not dropped: a refused backend the user added must stay visible
    // with its reason, or the refusal is indistinguishable from a lost entry.
    expect(pool.get('old')?.status).toBe('refused');
    expect(pool.get('old')?.detail).toContain('0.1');
  });

  it('records an unreachable backend without discarding it', async () => {
    const pool = new ConnectionPool(probeFor({}));
    const result = await pool.connect({ id: 'x', label: 'X', url: 'http://gone.test' });
    expect(result.status).toBe('error');
    expect(pool.get('x')?.status).toBe('error');
    expect(pool.get('x')?.detail).toContain('unreachable');
  });

  // ---- cross-connection leak audit (the #322 top risk) ----

  it('a second connection does not overwrite the first', async () => {
    const pool = new ConnectionPool(
      probeFor({
        'http://a.test': caps('0.2', 'backend-a'),
        'http://b.test': caps('0.2', 'backend-b'),
      }),
    );
    await pool.connect({ id: 'a', label: 'A', url: 'http://a.test' });
    await pool.connect({ id: 'b', label: 'B', url: 'http://b.test' });
    expect(pool.get('a')?.capabilities?.backend.name).toBe('backend-a');
  });

  it('a refusal on one connection does not disable another', async () => {
    const pool = new ConnectionPool(
      probeFor({ 'http://a.test': caps('0.2', 'backend-a'), 'http://old.test': caps('0.1') }),
    );
    await pool.connect({ id: 'a', label: 'A', url: 'http://a.test' });
    await pool.connect({ id: 'old', label: 'Old', url: 'http://old.test' });

    expect(pool.get('a')?.status).toBe('ready');
    expect(pool.get('old')?.status).toBe('refused');
  });

  it('each connection gets its OWN client instance', async () => {
    const pool = new ConnectionPool(
      probeFor({ 'http://a.test': caps('0.2'), 'http://b.test': caps('0.2') }),
    );
    await pool.connect({ id: 'a', label: 'A', url: 'http://a.test' });
    await pool.connect({ id: 'b', label: 'B', url: 'http://b.test' });
    const a = pool.get('a')?.client;
    const b = pool.get('b')?.client;
    expect(a).toBeDefined();
    expect(a).not.toBe(b);
    expect(a?.baseUrl).toBe('http://a.test');
    expect(b?.baseUrl).toBe('http://b.test');
  });

  it('disconnecting one connection leaves the others intact', async () => {
    const pool = new ConnectionPool(
      probeFor({ 'http://a.test': caps('0.2'), 'http://b.test': caps('0.2') }),
    );
    await pool.connect({ id: 'a', label: 'A', url: 'http://a.test' });
    await pool.connect({ id: 'b', label: 'B', url: 'http://b.test' });
    pool.disconnect('a');
    expect(pool.get('a')).toBeUndefined();
    expect(pool.get('b')?.status).toBe('ready');
  });

  // ---- union views ----

  it('attributes every union row to the connection it came from', async () => {
    const pool = new ConnectionPool(
      probeFor({ 'http://a.test': caps('0.2'), 'http://b.test': caps('0.2') }),
    );
    await pool.connect({ id: 'a', label: 'A', url: 'http://a.test' });
    await pool.connect({ id: 'b', label: 'B', url: 'http://b.test' });

    const rows = pool.unionBy((conn) =>
      conn.id === 'a' ? [{ id: 's1' }, { id: 's2' }] : [{ id: 's3' }],
    );
    expect(rows).toHaveLength(3);
    // Without attribution a union view is unusable: two backends can serve the
    // same session id and the user could not tell which one they are acting on.
    expect(rows.map((r) => r.connectionId).sort()).toEqual(['a', 'a', 'b']);
    expect(rows.find((r) => r.item.id === 's3')?.connectionLabel).toBe('B');
  });

  it('a union view skips connections that are not ready', async () => {
    const pool = new ConnectionPool(
      probeFor({ 'http://a.test': caps('0.2'), 'http://old.test': caps('0.1') }),
    );
    await pool.connect({ id: 'a', label: 'A', url: 'http://a.test' });
    await pool.connect({ id: 'old', label: 'Old', url: 'http://old.test' });

    const seen = vi.fn(() => [{ id: 's1' }]);
    const rows = pool.unionBy(seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(rows.every((r) => r.connectionId === 'a')).toBe(true);
  });
});
