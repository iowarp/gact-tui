import { useEffect, useState } from 'react';
import type { Capabilities, Client } from '@clio/core';
import type { RailConnection } from '../../shell/Rail';
import { loadRegistry } from '../../connect/registry';
import { DegradedButton, DegradedIconButton, PageHeader } from './common';

const KIND_LABEL: Record<string, string> = {
  'ssh-tunnel': 'ssh tunnel',
  'local-sidecar': 'bundled',
  http: 'http',
};

/**
 * Backends — the saved connection registry (connect/registry.ts), cross-
 * referenced against the live pool (`connections`) for status. Genuinely
 * client-held (D1: multi-connection client, no hub) — the same data the rail
 * footer's "Connected backends" popover already renders, surfaced here too.
 */
export function BackendsPage({
  client,
  connections = [],
  activeConnectionId,
}: {
  client: Client;
  connections?: RailConnection[];
  activeConnectionId?: string;
}) {
  const [live, setLive] = useState<Capabilities | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .capabilities()
      .then((c) => {
        if (!cancelled) setLive(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  const backends = loadRegistry().backends;

  return (
    <>
      <PageHeader
        title="Backends"
        subtitle="Registered agent backends. HTTP works everywhere; SSH tunnels need the desktop shell."
      />
      <div className="settings__list" data-gap="tight">
        {backends.map((backend) => {
          const isActive = backend.id === activeConnectionId;
          const conn = connections.find((c) => c.id === backend.id);
          const connected = isActive || conn?.status === 'ready';
          const kindLabel = KIND_LABEL[backend.kind] ?? backend.kind;
          const versionBits =
            isActive && live
              ? `${live.backend.name} v${live.backend.version} · contract v${live.contract_version}`
              : conn?.status === 'refused' || conn?.status === 'error'
                ? conn.status
                : connected
                  ? 'connected'
                  : 'idle';
          return (
            <div className="settings__row" key={backend.id}>
              <span
                className="settings__dot"
                style={{ background: connected ? 'var(--t-ok)' : 'var(--t-mu)' }}
              />
              <div className="settings__rowbody">
                <span className="settings__rowname">
                  {backend.label}{' '}
                  {isActive ? <span className="settings__rowsub">current</span> : null}
                </span>
                <span className="settings__rowsub">
                  {kindLabel} · {versionBits}
                </span>
              </div>
              <span className="settings__spacer" />
              {connected ? (
                isActive ? (
                  <button
                    type="button"
                    className="settings__btn"
                    onClick={() => {
                      void client.capabilities().then(setLive).catch(() => {});
                    }}
                  >
                    Refresh
                  </button>
                ) : (
                  <DegradedButton
                    label="Refresh"
                    reason="Only the active connection's client is available to this page (gact-tui#338)."
                  />
                )
              ) : (
                <DegradedButton
                  label="Connect"
                  reason="Settings cannot establish a new connection yet (gact-tui#338) — use the connect screen."
                />
              )}
            </div>
          );
        })}
        {backends.length === 0 ? (
          <p className="settings__note">No saved backends.</p>
        ) : null}
      </div>
      <DegradedButton
        label="+ Add remote backend"
        reason="Adding a backend from inside Settings is not wired yet (gact-tui#338) — use the connect screen."
        primary
      />
    </>
  );
}

/**
 * Agents — "connected agents across hosts" in the prototype. NOT
 * client.agents() (the expert/agent-blueprint catalog — see pages.ts) but
 * the same live-connection data Backends renders, filtered to what is
 * actually reachable right now. Detach/disconnect have no backend surface
 * yet (no detach-vs-disconnect distinction exists), so those render
 * disabled rather than silently doing nothing.
 */
export function AgentsPage({ connections = [] }: { connections?: RailConnection[] }) {
  const ready = connections.filter((c) => c.status === 'ready');
  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="Connected agents across hosts. Detach keeps an agent running after this client closes."
      />
      <div className="settings__list">
        {ready.map((c) => (
          <div className="settings__row" key={c.id}>
            <span className="settings__dot" style={{ background: 'var(--t-ok)' }} />
            <span className="settings__rowname">{c.label}</span>
            <span className="settings__rowsub">{c.url}</span>
            <span className="settings__spacer" />
            <DegradedIconButton
              icon="bolt"
              label={`Detach ${c.label}`}
              reason="Detach has no server-side meaning yet — disconnecting here would just drop the tab's reference."
            />
            <DegradedIconButton
              icon="x"
              label={`Disconnect ${c.label}`}
              reason="Disconnecting a non-active connection from Settings is not wired yet (gact-tui#338)."
            />
          </div>
        ))}
        {ready.length === 0 ? <p className="settings__note">No connected agents.</p> : null}
      </div>
      <DegradedButton
        label="+ Connect agent"
        reason="Connecting a new agent from inside Settings is not wired yet (gact-tui#338) — use the connect screen."
        primary
      />
    </>
  );
}
