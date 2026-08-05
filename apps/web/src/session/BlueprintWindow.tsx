import { useEffect, useState } from 'react';
import {
  fetchAgentBlueprint,
  type AgentBlueprintDetail,
  type Client,
} from '@clio/core';
import { Layer } from '../kit';

export interface BlueprintWindowProps {
  blueprintId: string | null;
  client: Client;
  open: boolean;
  onClose: () => void;
}

type BlueprintLoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; detail: AgentBlueprintDetail }
  | { kind: 'failed'; detail: string };

/** Read-only blueprint metadata window backed by the blueprint detail route. */
export function BlueprintWindow({ blueprintId, client, open, onClose }: BlueprintWindowProps) {
  const [state, setState] = useState<BlueprintLoadState>({ kind: 'idle' });

  useEffect(() => {
    if (!open || !blueprintId) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    void fetchAgentBlueprint(client, blueprintId).then(
      (detail) => {
        if (!cancelled) setState({ kind: 'loaded', detail });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'failed',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [blueprintId, client, open]);

  const blueprint = state.kind === 'loaded' ? state.detail.agent_blueprint : null;
  const title = blueprint?.title || blueprintId || 'blueprint';
  // Clickable even with nothing attached (fresh-session.json C1) — the
  // prototype's own click routes a bare session to a blueprint PICKER
  // (Settings > blueprints, not built yet — tracked separately). Until that
  // exists, opening this window and saying so honestly is the correct
  // degraded behavior: something real happens, nothing is fabricated.
  const layerOpen = open && state.kind !== 'loading';

  return (
    // The prototype's blueprint window uses the same LayerChrome.dc.html
    // partial as observability/files (kind="bp") — same Expand/Pop out/
    // Close-as-SVG-X chrome.
    <Layer open={layerOpen} title={title} windowControls onClose={onClose}>
      {!blueprintId ? (
        <p data-testid="blueprint-window-empty">
          No blueprint is attached to this session. Picking one from here is not wired yet.
        </p>
      ) : null}
      {state.kind === 'failed' ? <p role="alert">Could not load blueprint: {state.detail}</p> : null}
      {state.kind === 'loaded' ? <BlueprintDetail detail={state.detail} /> : null}
    </Layer>
  );
}

function BlueprintDetail({ detail }: { detail: AgentBlueprintDetail }) {
  const { agent_blueprint: blueprint } = detail;
  const agents = detail.agents ?? [];
  return (
    <>
      <dl>
        <dt>title</dt>
        <dd>{blueprint.title || blueprint.id}</dd>
        <dt>version</dt>
        <dd>{blueprint.version || 'not provided'}</dd>
        <dt>description</dt>
        <dd>{blueprint.description || 'not provided'}</dd>
      </dl>

      <section aria-labelledby="blueprint-agents-title">
        <h3 id="blueprint-agents-title">served agents</h3>
        {agents.length > 0 ? (
          <ul>
            {agents.map((agent) => (
              <li key={agent.id}>{agent.title || agent.id}</li>
            ))}
          </ul>
        ) : (
          <p>none</p>
        )}
      </section>

      <JsonSection title="mcp_descriptors" value={detail.mcp_descriptors ?? []} />
      <JsonSection title="defaults" value={blueprint.defaults ?? {}} />

      <section aria-labelledby="blueprint-validation-title">
        <h3 id="blueprint-validation-title">validation_errors</h3>
        {(blueprint.validation_errors ?? []).length > 0 ? (
          <ul>
            {blueprint.validation_errors?.map((error) => <li key={error}>{error}</li>)}
          </ul>
        ) : (
          <p>none</p>
        )}
      </section>

      <section aria-labelledby="blueprint-definition-title">
        <h3 id="blueprint-definition-title">definition</h3>
        <p>
          Degraded read-only view: the definition body has no wire surface yet
          (clio-agent#1178).
        </p>
      </section>
    </>
  );
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section aria-labelledby={`blueprint-${title}-title`}>
      <h3 id={`blueprint-${title}-title`}>{title}</h3>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
