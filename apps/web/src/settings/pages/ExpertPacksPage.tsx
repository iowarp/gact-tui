import { useEffect, useState } from 'react';
import type { Client } from '@clio/core';
import { EmptyState, ErrorNote, LoadingNote, PageHeader } from './common';

/** Expert packs — optional overlays applied on top of a blueprint. */
export function ExpertPacksPage({ client }: { client: Client }) {
  const [packs, setPacks] = useState<Array<{ id: string; name?: string; description?: string }> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .expertPacks()
      .then(({ packs: list }) => {
        if (!cancelled) setPacks(list);
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
      title="Expert packs"
      subtitle="Optional expert overlays applied on top of a blueprint."
    />
  );

  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!packs) return (<>{header}<LoadingNote /></>);
  if (packs.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No expert packs installed"
          body="Packs installed on the backend will be listed here."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="settings__list" style={{ maxWidth: 640 }}>
        {packs.map((p) => (
          <div className="settings__row" key={p.id}>
            <div className="settings__rowbody">
              <span className="settings__rowname">{p.name || p.id}</span>
              {p.description ? <span className="settings__rowsub">{p.description}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
