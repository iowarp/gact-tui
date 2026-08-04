import { useEffect, useState } from 'react';
import type { Client, MetricsSnapshot } from '@clio/core';
import { ErrorNote, LoadingNote, PageHeader } from './common';
import { KvGrid, type KvRow } from '../../kit';

/**
 * Metrics — the prototype's rows (context %, tool calls, child tasks,
 * artifacts) are per-ACTIVE-SESSION observability numbers this overlay does
 * not itself track; `contextPercent` / `artifactCount` come through from the
 * composer pill state SessionView already computes (real, not refetched).
 * Tool-call / child-task counts have no equivalent at this layer, so the
 * backend's own global metrics (GET /v1/metrics) render instead of a
 * fabricated pair of numbers.
 */
export function MetricsPage({
  client,
  contextPercent,
  artifactCount,
  onOpenObservability,
}: {
  client: Client;
  contextPercent?: number;
  artifactCount?: number;
  onOpenObservability?: () => void;
}) {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .metrics()
      .then((m) => {
        if (!cancelled) setMetrics(m);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const header = (
    <PageHeader title="Metrics" subtitle="This session, computed from the event stream." />
  );

  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!metrics) return (<>{header}<LoadingNote /></>);

  const rows: KvRow[] = [];
  if (contextPercent !== undefined) {
    rows.push({ key: 'CONTEXT', value: `${contextPercent}%` });
  }
  if (artifactCount !== undefined) {
    rows.push({ key: 'ARTIFACTS', value: String(artifactCount), trailing: 'this turn' });
  }
  if (metrics.sessions) {
    rows.push({
      key: 'SESSIONS',
      value: String(metrics.sessions.active),
      trailing: `${metrics.sessions.total} total`,
    });
  }
  if (metrics.messages) {
    rows.push({ key: 'MESSAGES', value: String(metrics.messages.total), trailing: 'all sessions' });
  }
  if (metrics.tokens) {
    rows.push({
      key: 'TOKENS',
      value: `${metrics.tokens.input_total} in / ${metrics.tokens.output_total} out`,
    });
  }

  return (
    <>
      {header}
      <KvGrid label="Metrics" rows={rows} />
      {onOpenObservability ? (
        <button type="button" className="settings__btn" onClick={onOpenObservability}>
          Open observability
        </button>
      ) : null}
    </>
  );
}
