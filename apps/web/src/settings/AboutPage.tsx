import { useEffect, useState } from 'react';
import { brand } from '@brand';
import type { Capabilities, Client } from '@clio/core';
import type { BackendEntry } from '@clio/core';
import { KvGrid } from '../kit';
import { APP_VERSION } from '../build-info';

export interface AboutPageProps {
  client: Client;
  /** The registry entry for the currently active connection, if known —
   * carries the real kind (http/ssh-tunnel/local-sidecar) and, for SSH,
   * the real user@host identity. */
  activeBackend?: BackendEntry;
}

/**
 * About — build identity and the connected backend's own self-reported
 * identity (GET /v1/capabilities). The `auth` row only renders when there is
 * something real to say (an SSH backend's own user@host) — no login system
 * exists to fabricate a generic "signed in as" state for the common HTTP
 * case.
 */
export function AboutPage({ client, activeBackend }: AboutPageProps) {
  const [caps, setCaps] = useState<Capabilities | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .capabilities()
      .then((c) => {
        if (!cancelled) setCaps(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  const rows = [
    // git describe --dirty already bakes a -dirty suffix into APP_VERSION
    // when the tree is dirty — do not append it a second time.
    { key: 'APP', value: brand.name, trailing: `v${APP_VERSION}` },
    ...(caps
      ? [{ key: 'CONTRACT', value: `GACT v${caps.contract_version}`, trailing: '' }]
      : []),
    ...(caps
      ? [
          {
            key: 'BACKEND',
            value: caps.backend.name,
            trailing: activeBackend ? `${activeBackend.label} · ${KIND_LABEL[activeBackend.kind] ?? activeBackend.kind}` : caps.backend.version,
          },
        ]
      : []),
    ...(activeBackend?.kind === 'ssh-tunnel' && activeBackend.ssh
      ? [
          {
            key: 'AUTH',
            value: 'ssh key',
            trailing: `${activeBackend.ssh.user}@${activeBackend.ssh.host}`,
          },
        ]
      : []),
  ];

  return (
    <div className="settings__section">
      <h2 className="settings__title">About {brand.name}</h2>
      <p className="settings__lede">Build identity and connected backend.</p>

      <KvGrid label="About" rows={rows} />

      <div className="settings__links">
        <a href="https://github.com/iowarp/gact-tui" target="_blank" rel="noreferrer">
          github.com/iowarp/gact-tui <span>web, desktop, and TUI clients</span>
        </a>
        <a
          href="https://github.com/iowarp/gact-tui/blob/main/contract/SPEC.md"
          target="_blank"
          rel="noreferrer"
        >
          GACT v0.2 protocol spec <span>canonical wire contract</span>
        </a>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  'ssh-tunnel': 'ssh tunnel',
  'local-sidecar': 'bundled',
  http: 'http',
};
