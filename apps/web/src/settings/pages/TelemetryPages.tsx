import { useEffect, useState } from 'react';
import type { Client, HookRow, MemoryStats } from '@clio/core';
import { EmptyState, ErrorNote, LoadingNote, PageHeader } from './common';

/** Hooks — scripts run on session lifecycle events (client.hooks()). */
export function HooksPage({ client }: { client: Client }) {
  const [hooks, setHooks] = useState<HookRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .hooks()
      .then(({ hooks: list }) => {
        if (!cancelled) setHooks(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const header = <PageHeader title="Hooks" subtitle="Scripts run on session lifecycle events." />;
  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!hooks) return (<>{header}<LoadingNote /></>);
  if (hooks.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No hooks configured"
          body="Add hooks in the backend config to run scripts on turn start, tool calls, or completion."
        />
      </>
    );
  }
  return (
    <>
      {header}
      <div className="settings__list" style={{ maxWidth: 640 }}>
        {hooks.map((h) => (
          <div className="settings__row" key={h.id}>
            <div className="settings__rowbody">
              <span className="settings__rowname">{h.event}</span>
              <span className="settings__rowsub">{h.command || h.url}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Memory — persistent memory stores available to sessions. The wire has no
 * "list of stores" concept (memoryStats() reports cache hit/miss counters,
 * not named stores), so the prototype's literal "no memory capability" empty
 * state would misreport a working cache as absent. Real cache numbers render
 * instead; the empty state is reserved for a genuine fetch failure.
 */
export function MemoryPage({ client }: { client: Client }) {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .memoryStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const header = (
    <PageHeader title="Memory" subtitle="Persistent memory stores available to sessions." />
  );

  if (error) {
    return (
      <>
        {header}
        <EmptyState
          title="No memory stores"
          body="The connected backend reports no memory capability."
        />
      </>
    );
  }
  if (!stats) return (<>{header}<LoadingNote /></>);

  return (
    <>
      {header}
      <div className="settings__list" data-gap="tight" style={{ maxWidth: 640 }}>
        <div className="settings__row">
          <div className="settings__rowbody">
            <span className="settings__rowname">ARC cache</span>
            <span className="settings__rowsub">
              {(stats.cache.hit_rate * 100).toFixed(0)}% hit rate · {stats.cache.hits} hits ·{' '}
              {stats.cache.misses} misses · capacity {stats.cache.capacity}
            </span>
          </div>
        </div>
        {stats.global ? (
          <div className="settings__row">
            <div className="settings__rowbody">
              <span className="settings__rowname">global</span>
              <span className="settings__rowsub">
                {stats.global.conversations_total} conversations ·{' '}
                {stats.global.invocations_total} invocations
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
