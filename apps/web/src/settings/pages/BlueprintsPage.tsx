import { useEffect, useState } from 'react';
import { fetchAgentBlueprint, type Client } from '@clio/core';
import { BlueprintWindow } from '../../session/BlueprintWindow';
import { EmptyState, ErrorNote, LoadingNote, PageHeader } from './common';

/**
 * Agent blueprints — installed blueprint packs (client.agentBlueprints()).
 * "Open editor" reuses the same read-only blueprint detail window the
 * composer's /blueprint command opens — a real viewer, not a fabricated
 * link.
 *
 * The prototype's own mock only templates ONE row's subtext ("this session ·
 * 4 declared children · 12 files", for the blueprint backing the active
 * session) — the other two rows carry freeform prose ("depth-2 nested
 * chain", "simplest single-child pack") that is just the blueprint's own
 * description in the mock, not a formula. So only the active blueprint's row
 * gets a real derived count: `activeBlueprintId` (SessionView's real
 * `detail.metadata.active_agent_blueprint_id`) triggers ONE extra detail
 * fetch (`fetchAgentBlueprint`, the same call BlueprintWindow already makes)
 * for THAT blueprint only — never N+1 fetches for the whole list — and its
 * real `agents` array (tier > 1 = declared child, tier 1 = the root
 * orchestrator) backs "N declared children". There is no file-count concept
 * anywhere in AgentBlueprintDetail, so "M files" stays omitted rather than
 * invented (see the fix_hint on this item in the conformance map). Every
 * other row keeps rendering its real description, unchanged.
 */
export function BlueprintsPage({
  client,
  activeBlueprintId,
}: {
  client: Client;
  activeBlueprintId?: string;
}) {
  const [blueprints, setBlueprints] = useState<
    Array<{ id: string; name?: string; description?: string; version?: string; scope?: string }> | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeChildCount, setActiveChildCount] = useState<number | null>(null);

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

  useEffect(() => {
    setActiveChildCount(null);
    if (!activeBlueprintId) return;
    let cancelled = false;
    void fetchAgentBlueprint(client, activeBlueprintId)
      .then((detail) => {
        if (cancelled) return;
        const agents = detail.agents ?? [];
        setActiveChildCount(agents.filter((agent) => (agent.tier ?? 1) > 1).length);
      })
      .catch(() => {
        // No real count available; the row falls back to its description.
      });
    return () => {
      cancelled = true;
    };
  }, [client, activeBlueprintId]);

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
        {blueprints.map((bp) => {
          const isActive = bp.id === activeBlueprintId;
          const subtext =
            isActive && activeChildCount !== null
              ? `this session · ${activeChildCount} declared child${activeChildCount === 1 ? '' : 'ren'}`
              : bp.description || bp.scope || 'no description';
          return (
            <div className="settings__row" key={bp.id}>
              <div className="settings__rowbody">
                <span className="settings__rowname">
                  {bp.name || bp.id}{' '}
                  {bp.version ? <span className="settings__rowsub">@{bp.version}</span> : null}
                </span>
                <span className="settings__rowsub">{subtext}</span>
              </div>
              <span className="settings__spacer" />
              <button type="button" className="settings__btn" onClick={() => setOpenId(bp.id)}>
                Open editor
              </button>
            </div>
          );
        })}
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
