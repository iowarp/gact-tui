import { useEffect, useState } from 'react';
import type { Capabilities, Client, HealthSnapshot } from '@clio/core';
import { ErrorNote, LoadingNote, PageHeader } from './common';

const STATUS_MARK: Record<string, { mark: string; color: string }> = {
  ready: { mark: '✓', color: 'var(--t-ok)' },
  degraded: { mark: '!', color: 'var(--t-wa)' },
  unavailable: { mark: '✗', color: 'var(--t-er)' },
  skipped: { mark: '–', color: 'var(--t-mu)' },
};

/** Doctor — connectivity and environment checks (health() + capabilities()). */
export function DoctorPage({ client }: { client: Client }) {
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([client.health(), client.capabilities()]).then(([h, c]) => {
      if (cancelled) return;
      if (h.status === 'fulfilled') setHealth(h.value);
      else setError(h.reason instanceof Error ? h.reason.message : String(h.reason));
      if (c.status === 'fulfilled') setCaps(c.value);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const header = (
    <PageHeader title="Doctor" subtitle="Connectivity and environment checks." />
  );

  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!health) return (<>{header}<LoadingNote /></>);

  const rows: Array<{ mark: string; color: string; name: string; detail: string }> = [
    {
      mark: health.healthy ? '✓' : '✗',
      color: health.healthy ? 'var(--t-ok)' : 'var(--t-er)',
      name: 'Backend reachable',
      detail: caps ? `${caps.backend.name} · ${caps.backend.version}` : `uptime ${Math.round(health.uptime_s)}s`,
    },
  ];
  if (caps) {
    rows.push({ mark: '✓', color: 'var(--t-ok)', name: 'Contract version', detail: `GACT v${caps.contract_version}` });
  }
  for (const integration of health.integrations ?? []) {
    const status = STATUS_MARK[integration.status] ?? { mark: '?', color: 'var(--t-mu)' };
    rows.push({
      mark: status.mark,
      color: status.color,
      name: integration.name,
      detail: integration.detail ?? integration.status,
    });
  }

  return (
    <>
      {header}
      <div className="settings__list" data-gap="tight" style={{ maxWidth: 640 }}>
        {rows.map((row, i) => (
          <div className="settings__row" key={i} style={{ alignItems: 'baseline' }}>
            <span style={{ color: row.color, width: 18, flexShrink: 0 }}>{row.mark}</span>
            <span style={{ flex: 1, color: 'var(--t-hd)', fontFamily: 'var(--f-prose)', fontSize: 'calc(14px * var(--ts))' }}>
              {row.name}
            </span>
            <span className="settings__rowsub">{row.detail}</span>
          </div>
        ))}
      </div>
    </>
  );
}
