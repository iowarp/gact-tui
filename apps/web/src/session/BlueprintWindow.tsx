import { useEffect, useState } from 'react';
import {
  fetchAgentBlueprint,
  type AgentBlueprintDetail,
  type Client,
} from '@clio/core';
import { Layer } from '../kit';
import { Markdown } from '../transcript/markdown';
import './blueprintwindow.css';

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

/**
 * The blueprint window — an EXPLORER of the active blueprint's files (owner
 * ask, cluster B), same tree-left/content-right grammar as the fixed
 * FilesLayer, backed by whatever the clio server can actually serve for a
 * blueprint's root directory.
 *
 * Root cause of the prior "shows only the definition, badly formatted"
 * complaint: `GET /v1/agent-blueprints/{id}` (clio-agent
 * routes/blueprints.py:298 `get_agent_blueprint`) already carries the
 * AGENT.md body as `agent_blueprint.metadata.body` (parsed off frontmatter —
 * `agent_blueprints.py:342`), but this component never read it; it rendered
 * a raw `<dl>`/`<pre>` metadata dump instead and stubbed the actual
 * definition text as "no wire surface yet". That stub was stale — this
 * renders the real body through the transcript Markdown module.
 *
 * The genuinely missing piece is a per-directory listing/read surface for
 * the blueprint's root (`experts/*.md`, `tools/`, …): the only blueprint
 * routes are `GET /v1/agent-blueprints` and `GET /v1/agent-blueprints/{id}`
 * (metadata + agents + mcp_descriptors, no file tree), and the workspace
 * file routes (`GET /v1/workspaces/{wid}/files[/read]`) are scoped to a
 * REGISTERED workspace id, not an arbitrary filesystem path — a blueprint's
 * `root` is neither. Nothing here fabricates a tree for that; it shows the
 * gap explicitly (see `BlueprintExplorerGap` below) so it can be filed
 * precisely instead of faked.
 */
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
    <Layer open={layerOpen} title={title} windowControls width={680} height={560} onClose={onClose}>
      {!blueprintId ? (
        <p className="blueprintwindow__empty" data-testid="blueprint-window-empty">
          No blueprint is attached to this session. Picking one from here is not wired yet.
        </p>
      ) : null}
      {state.kind === 'failed' ? (
        <p className="blueprintwindow__empty" role="alert">
          Could not load blueprint: {state.detail}
        </p>
      ) : null}
      {state.kind === 'loaded' ? <BlueprintDetail detail={state.detail} /> : null}
    </Layer>
  );
}

function BlueprintDetail({ detail }: { detail: AgentBlueprintDetail }) {
  const { agent_blueprint: blueprint } = detail;
  const agents = detail.agents ?? [];
  const rawBody = blueprint.metadata?.['body'];
  const body = typeof rawBody === 'string' ? rawBody.trim() : '';
  const rootDir = blueprint.root ?? '';

  return (
    <div className="blueprintwindow">
      <dl className="blueprintwindow__identity">
        <div>
          <dt>version</dt>
          <dd>{blueprint.version || 'not provided'}</dd>
        </div>
        <div>
          <dt>root</dt>
          <dd className="blueprintwindow__path" title={rootDir}>
            {rootDir || 'not provided'}
          </dd>
        </div>
      </dl>
      {blueprint.description ? <p className="blueprintwindow__desc">{blueprint.description}</p> : null}

      <section aria-labelledby="blueprint-definition-title" className="blueprintwindow__section">
        <h3 id="blueprint-definition-title">definition</h3>
        {body ? (
          <div className="blueprintwindow__markdown" data-testid="blueprint-window-markdown">
            <Markdown text={body} />
          </div>
        ) : (
          <p className="blueprintwindow__empty">
            This blueprint's AGENT.md has no body text beyond its frontmatter.
          </p>
        )}
      </section>

      <BlueprintExplorerGap />

      <section aria-labelledby="blueprint-agents-title" className="blueprintwindow__section">
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

      <section aria-labelledby="blueprint-validation-title" className="blueprintwindow__section">
        <h3 id="blueprint-validation-title">validation_errors</h3>
        {(blueprint.validation_errors ?? []).length > 0 ? (
          <ul>
            {blueprint.validation_errors?.map((error) => <li key={error}>{error}</li>)}
          </ul>
        ) : (
          <p>none</p>
        )}
      </section>
    </div>
  );
}

/**
 * Honest, typed gap notice: there is no backend surface to list or read the
 * blueprint's OTHER files (experts/*.md, tools/, …) — only the AGENT.md body
 * above, via `agent_blueprint.metadata.body`.
 *
 * `GET /v1/workspaces/{wid}/files[/read]` (clio-agent
 * routes/workspaces.py, mounted per-workspace) only resolves a REGISTERED
 * workspace id's root_path; a blueprint's root is an arbitrary filesystem
 * path with no workspace registration, and the blueprint routes themselves
 * (clio-agent routes/blueprints.py:210-332, `register_blueprints_routes`)
 * expose metadata + agents + mcp_descriptors only — no directory listing, no
 * per-file read. The nearest existing route is
 * `GET /v1/agent-blueprints/{blueprint_id}` at routes/blueprints.py:298-332.
 */
function BlueprintExplorerGap() {
  return (
    <p className="blueprintwindow__gap" data-testid="blueprint-window-explorer-gap">
      Full file explorer (experts/*.md, tools/) is not backed yet — the server
      has no directory-listing or per-file-read route for a blueprint's root
      (nearest existing route: <code>GET /v1/agent-blueprints/&#123;id&#125;</code>,
      clio-agent <code>routes/blueprints.py:298</code>, metadata only). Only
      the AGENT.md body above is available today.
    </p>
  );
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section aria-labelledby={`blueprint-${title}-title`} className="blueprintwindow__section">
      <h3 id={`blueprint-${title}-title`}>{title}</h3>
      <pre className="blueprintwindow__json">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
