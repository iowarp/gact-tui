import { useEffect, useState } from 'react';
import type { Client, RelayStatus } from '@clio/core';
import { DegradedButton, DegradedIconButton, EmptyState, ErrorNote, LoadingNote, PageHeader } from './common';

/**
 * Relays — the prototype shows a registry of named relay hosts (ares 12ms,
 * polaris 38ms, delta 214ms) that can be added/removed. The wire has no such
 * registry (clio-agent#1179 landed a SINGLETON: GET /v1/relay/status reports
 * only this backend's own configured relay + a fresh TCP reachability
 * probe). The one real relay renders as a real row — reachable/unreachable,
 * not a fabricated latency figure the probe does not measure — and the
 * registry actions the wire cannot back (add another relay, remove this one)
 * render disabled with their reason rather than silently doing nothing.
 */
export function RelaysPage({ client }: { client: Client }) {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .relayStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const header = (
    <PageHeader
      title="Relays"
      subtitle="Relay hosts that tunnel agent traffic. Click a name to toggle name / address."
    />
  );

  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!status) return (<>{header}<LoadingNote /></>);

  return (
    <>
      {header}
      {status.configured ? (
        <div className="settings__list" data-gap="tight">
          <div className="settings__row">
            <span
              className="settings__dot"
              style={{ background: status.reachable ? 'var(--t-ok)' : 'var(--t-er)' }}
            />
            <div className="settings__rowbody">
              <span className="settings__rowname">{status.host || 'relay'}</span>
              <span className="settings__rowsub">
                {status.reachable ? 'reachable' : 'unreachable'}
                {status.detail ? ` · ${status.detail}` : ''}
              </span>
            </div>
            <span className="settings__spacer" />
            <DegradedIconButton
              icon="x"
              label={`Remove ${status.host || 'relay'}`}
              reason="This is the backend's own configured relay (clio-agent#1179) — there is no route to unregister it from here."
            />
          </div>
        </div>
      ) : (
        <EmptyState
          title="No relay configured"
          body="This backend has none set up. Federation and remote agent tunneling run without one."
        />
      )}
      <DegradedButton
        label="+ Add relay"
        reason="The wire reports one configured relay, not a registry (clio-agent#1179) — there is no route to add another."
        primary
      />
    </>
  );
}
