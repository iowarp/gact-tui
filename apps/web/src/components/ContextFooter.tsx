/**
 * ContextFooter — compact bottom indicator for the ACTIVE expert: a mini
 * segmented bar + overall %, labeled with the expert name. Clicking it opens the
 * full {@link ContextPanel} in an overlay.
 *
 * Polls the active session's context state for the active scope. Renders nothing
 * until a state is available (so a session with no context budget stays quiet).
 */
import { createResource, createSignal, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { Client, ContextState } from '@clio/core';
import { ContextUsageBar } from './ContextUsageBar.js';
import { ContextPanel, type ContextExpert } from './ContextPanel.js';
import { fullnessFraction, contextTone, isRoutableExpert } from './ContextUsageModel.js';
import { presentBlueprintLabel } from '../brand-presentation.js';
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
        // Routable EXPERTS only — skills / non-expert kinds are not scopes.
        const experts = agents.filter((a) => isRoutableExpert(a));
        if (experts.length === 0) return undefined;
        // clio routing roots at `main`; prefer it, else an expert with no
        // parent, else the first roster entry.
        const parentOf = (a: (typeof experts)[number]) =>
          (a as { parent_id?: unknown }).parent_id ??
          a.metadata?.['parent_id'] ??
          a.metadata?.['parent_agent_id'];
        const root =
          experts.find((a) => a.id === 'main') ??
          experts.find((a) => !parentOf(a)) ??
          experts[0];
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
    () => {
      const scope = effectiveScope();
      return props.sessionId && scope ? { sid: props.sessionId, scope } : null;
    },
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
  // Label the LIVE active agent when the caller supplies one; otherwise fall
  // back to the resolved routing root (brand-mapped short name), so the footer
  // always names whose context it is showing rather than a bare "context".
  const label = () => {
    if (props.activeExpertLabel) return props.activeExpertLabel;
    if (props.activeExpert) return presentBlueprintLabel(props.activeExpert, props.activeExpert);
    const scope = rosterScope();
    return scope ? presentBlueprintLabel(scope, scope) : 'context';
  };

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
            {/* Portal to <body> so the fixed overlay escapes the composer's
                trapped stacking context (an ancestor with transform/contain
                pins z-index locally); otherwise z-index:60 renders UNDER the
                composer. Backdrop-click-to-close is preserved on the overlay. */}
            <Portal mount={document.body}>
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
            </Portal>
          </Show>
        </>
      )}
    </Show>
  );
}
