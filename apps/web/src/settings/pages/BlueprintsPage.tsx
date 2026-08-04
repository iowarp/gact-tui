import { useEffect, useState } from 'react';
import type { Client } from '@clio/core';
import { BlueprintWindow } from '../../session/BlueprintWindow';
import { EmptyState, ErrorNote, LoadingNote, PageHeader } from './common';

/** Agent blueprints — installed blueprint packs (client.agentBlueprints()).
 * "Open editor" reuses the same read-only blueprint detail window the
 * composer's /blueprint command opens — a real viewer, not a fabricated
 * link. */
export function BlueprintsPage({ client }: { client: Client }) {
  const [blueprints, setBlueprints] = useState<
    Array<{ id: string; name?: string; description?: string; version?: string; scope?: string }> | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .agentBlueprints()
      .then(({ blueprints: list }) => {
        if (!cancelled) setBlueprints(list);
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
      title="Agent blueprints"
      subtitle="Installed blueprint packs. A blueprint declares the child agents, tools, and templates a session can use."
    />
  );

  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!blueprints) return (<>{header}<LoadingNote /></>);
  if (blueprints.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No blueprints installed"
          body="Install an agent blueprint from the backend config to see it here."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="settings__list" style={{ maxWidth: 640 }}>
        {blueprints.map((bp) => (
          <div className="settings__row" key={bp.id}>
            <div className="settings__rowbody">
              <span className="settings__rowname">
                {bp.name || bp.id}{' '}
                {bp.version ? <span className="settings__rowsub">@{bp.version}</span> : null}
              </span>
              <span className="settings__rowsub">
                {bp.description || bp.scope || 'no description'}
              </span>
            </div>
            <span className="settings__spacer" />
            <button type="button" className="settings__btn" onClick={() => setOpenId(bp.id)}>
              Open editor
            </button>
          </div>
        ))}
      </div>
      <BlueprintWindow
        blueprintId={openId}
        client={client}
        open={openId !== null}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
