import { useEffect, useState } from 'react';
import type { Client, LmConfigSnapshot, ProviderDef } from '@clio/core';
import { ErrorNote, LoadingNote, PageHeader } from './common';

/**
 * Models — default model per role for new sessions. Only "main" has a real
 * backend concept (GET /v1/providers/lm, a single global provider/model
 * pair); the wire carries no "router lm" role at all, so that row renders a
 * visible-degraded note instead of a fabricated assignment.
 */
export function ModelsPage({ client }: { client: Client }) {
  const [lm, setLm] = useState<LmConfigSnapshot | null>(null);
  const [providers, setProviders] = useState<ProviderDef[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([client.lmConfig(), client.providers()]).then(([lmR, provR]) => {
      if (cancelled) return;
      if (lmR.status === 'fulfilled') setLm(lmR.value);
      else setError(lmR.reason instanceof Error ? lmR.reason.message : String(lmR.reason));
      if (provR.status === 'fulfilled') setProviders(provR.value.providers);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const header = (
    <PageHeader
      title="Models"
      subtitle="Default model per role for new sessions. The composer picker overrides the current session only."
    />
  );

  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!lm) return (<>{header}<LoadingNote /></>);

  const providerLabel = providers.find((p) => p.id === lm.provider)?.name || lm.provider;

  return (
    <>
      {header}
      <div className="settings__list" data-gap="tight" style={{ maxWidth: 640 }}>
        <div className="settings__card">
          <div className="settings__cardhead" style={{ cursor: 'default' }}>
            <span style={{ fontWeight: 600, color: 'var(--t-hd)' }}>main</span>
            <span
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 'calc(11.5px * var(--ts))',
                color: 'var(--t-mu)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {lm.configured ? `${providerLabel} / ${lm.model}` : 'not configured'}
            </span>
          </div>
        </div>
        <div className="settings__card">
          <div className="settings__cardhead" style={{ cursor: 'default' }}>
            <span style={{ fontWeight: 600, color: 'var(--t-hd)' }}>router lm</span>
            <span
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 'calc(11.5px * var(--ts))',
                color: 'var(--t-mu)',
              }}
            >
              not exposed by this backend
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
