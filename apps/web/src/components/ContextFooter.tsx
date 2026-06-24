/**
 * ContextFooter — compact bottom indicator for the ACTIVE expert: a mini
 * segmented bar + overall %, labeled with the expert name. Clicking it opens the
 * full {@link ContextPanel} in an overlay.
 *
 * Polls the active session's context state for the active scope. Renders nothing
 * until a state is available (so a session with no context budget stays quiet).
 */
import { createResource, createSignal, Show } from 'solid-js';
import type { Client, ContextState } from '@clio/core';
import { ContextUsageBar } from './ContextUsageBar.js';
import { ContextPanel, type ContextExpert } from './ContextPanel.js';
import { fullnessFraction, contextTone } from './ContextUsageModel.js';
import './context-usage.css';

type FooterClient = Pick<Client, 'getContextState' | 'compactContext' | 'agents'>;

export interface ContextFooterProps {
  client: FooterClient;
  /** Active session id; the footer hides when absent. */
  sessionId?: string;
  /** Active expert/scope id (label + the panel's default selection). */
  activeExpert?: string;
  /** Human label for the active expert; falls back to the id / "context". */
  activeExpertLabel?: string;
  /** Pre-supplied expert roster forwarded to the panel. */
  experts?: ContextExpert[];
}

function pctLabel(fraction: number | null): string {
  if (fraction == null) return '—';
  return `${Math.round(fraction * 100)}%`;
}

export function ContextFooter(props: ContextFooterProps) {
  const [open, setOpen] = createSignal(false);

  // Resolve a default scope when the caller supplies none. Some backends
  // (real clio) REQUIRE a `scope` on GET .../context/state and 422 without it,
  // so an unscoped probe would fail and the footer would never mount. Fall back
  // to the routing root (the agent with no parent — typically `main`), else the
  // first roster entry. Pre-supplied `experts`/`activeExpert` always win.
  const [rosterScope] = createResource(
    () => (props.activeExpert ? null : (props.sessionId ?? null)),
    async () => {
      const supplied = props.experts?.[0]?.id;
      if (supplied) return supplied;
      try {
        const { agents } = await props.client.agents();
        if (agents.length === 0) return undefined;
        // clio routing roots at `main`; prefer it, else an agent with no
        // parent in metadata, else the first roster entry.
        const root =
          agents.find((a) => a.id === 'main') ??
          agents.find((a) => !(a.metadata?.['parent_id'] ?? a.metadata?.['parent_agent_id'])) ??
          agents[0];
        return root?.id;
      } catch {
        return undefined;
      }
    },
  );

  const effectiveScope = () => props.activeExpert ?? rosterScope();

  const [state] = createResource<
    ContextState | null,
    { sid: string; scope: string | undefined }
  >(
    () =>
      props.sessionId
        ? { sid: props.sessionId, scope: effectiveScope() }
        : null,
    async ({ sid, scope }) => {
      try {
        return await props.client.getContextState(sid, scope);
      } catch {
        return null;
      }
    },
  );

  const fullness = () => {
    const s = state();
    return s ? fullnessFraction(s) : null;
  };
  const tone = () => contextTone(fullness(), state()?.autocompact_pct ?? null);
  const label = () =>
    props.activeExpertLabel || props.activeExpert || 'context';

  return (
    <Show when={props.sessionId ? state() : null}>
      {(s) => (
        <>
          <button
            type="button"
            class="ctx-footer"
            data-testid="context-footer"
            title={`${label()} — ${pctLabel(fullness())} of context window`}
            onClick={() => setOpen(true)}
          >
            <span class="ctx-footer__expert" data-testid="context-footer-expert">
              {label()}
            </span>
            <span class="ctx-footer__bar">
              <ContextUsageBar
                state={s()}
                showHeader={false}
                mini
                testid="context-footer-bar"
              />
            </span>
            <span
              class={'ctx-footer__pct ctx-footer__pct--' + tone()}
              data-testid="context-footer-pct"
            >
              {pctLabel(fullness())}
            </span>
          </button>

          <Show when={open()}>
            <div
              class="ctx-overlay"
              data-testid="context-overlay"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <ContextPanel
                client={props.client}
                sessionId={props.sessionId!}
                {...(effectiveScope() ? { activeExpert: effectiveScope() } : {})}
                {...(props.experts ? { experts: props.experts } : {})}
                onClose={() => setOpen(false)}
              />
            </div>
          </Show>
        </>
      )}
    </Show>
  );
}
