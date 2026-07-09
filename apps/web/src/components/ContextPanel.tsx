/**
 * ContextPanel — the dedicated per-session context view: a scope/expert
 * selector, the {@link ContextUsageBar} (segmented bar + legend + used/window
 * absolute & %), and a "Compact now" action that POSTs
 * `compactContext(sessionId, scope)` and refetches. 409/503 errors surface as
 * toasts via {@link useToast}.
 *
 * Experts come from the agent roster (`client.agents()` — the routing
 * hierarchy). The default scope is the session's active expert when the caller
 * supplies one, else the first roster entry, else the session default (no
 * scope).
 */
import { createMemo, createResource, createSignal, Show } from 'solid-js';
import type { Client, ContextState } from '@clio/core';
import { CompactContextError } from '@clio/core';
import { Dropdown, type DropdownItem } from './Dropdown.js';
import { ContextUsageBar } from './ContextUsageBar.js';
import { categoryTotal, isRoutableExpert } from './ContextUsageModel.js';
import { presentBlueprintLabel } from '../brand-presentation.js';
import { useToast } from './Toast.js';
import { Icon } from './Icon.js';
import './context-usage.css';

type ContextClient = Pick<Client, 'getContextState' | 'compactContext' | 'agents'>;

export interface ContextExpert {
  id: string;
  label: string;
}

export interface ContextPanelProps {
  client: ContextClient;
  sessionId: string;
  /** Active expert/scope id — the default selection. Omit for the session default. */
  activeExpert?: string;
  /** Pre-supplied expert roster; when absent the panel loads `client.agents()`. */
  experts?: ContextExpert[];
  /** Optional close affordance (footer/overlay launch). */
  onClose?: () => void;
}

const COMPACT_TOAST: Record<string, { title: string; tone: 'error' | 'info' }> = {
  nothing_to_compact: {
    title: 'Nothing to compact — no live context to summarize.',
    tone: 'info',
  },
  compaction_unavailable: {
    title: 'Compaction unavailable — no language model is bound.',
    tone: 'error',
  },
  session_not_found: { title: 'Session not found.', tone: 'error' },
  unknown: { title: 'Compaction failed.', tone: 'error' },
};

export function ContextPanel(props: ContextPanelProps) {
  const toast = useToast();
  const [scope, setScope] = createSignal<string | undefined>(props.activeExpert);
  const [compacting, setCompacting] = createSignal(false);

  // Expert roster: prefer the supplied list; else load the agent hierarchy.
  const [roster] = createResource(
    () => (props.experts ? null : props.sessionId),
    async () => {
      try {
        const res = await props.client.agents();
        // Routable EXPERTS only (skills / non-expert kinds are not context
        // scopes), labelled by their short id (main, geospatial, data, …) — the
        // SAME identity the live context footer shows — rather than the verbose
        // expert-pack title (`a.title`, e.g. "Geospatial Resolution Expert"),
        // which this picker is meant to shorten. A brand display-name still wins
        // when one is declared for the id.
        return res.agents
          .filter((a) => isRoutableExpert(a))
          .map((a) => ({ id: a.id, label: presentBlueprintLabel(a.id, a.id) }));
      } catch {
        return [] as ContextExpert[];
      }
    },
  );
  const experts = createMemo<ContextExpert[]>(() => props.experts ?? roster() ?? []);

  // Context state keyed on (session, scope) so switching experts refetches.
  const [state, { refetch, mutate }] = createResource<
    ContextState,
    { sid: string; scope: string | undefined }
  >(
    () => ({ sid: props.sessionId, scope: scope() }),
    ({ sid, scope: s }) => props.client.getContextState(sid, s),
  );

  const expertItems = createMemo<DropdownItem<string>[]>(() =>
    experts().map((e) => ({ id: e.id, label: e.label, value: e.id })),
  );
  const selectedLabel = createMemo(() => {
    const cur = scope();
    if (!cur) return 'Active expert';
    return experts().find((e) => e.id === cur)?.label ?? cur;
  });

  const hasLive = createMemo(() => {
    const s = state();
    if (!s) return false;
    return s.live_block_count > 0 || categoryTotal(s.categories) > 0;
  });

  async function doCompact() {
    if (compacting()) return;
    setCompacting(true);
    try {
      const next = await props.client.compactContext(props.sessionId, scope());
      mutate(next);
      toast.push({
        title: 'Context compacted.',
        tone: 'success',
        duration: 3500,
      });
    } catch (e) {
      const reason = e instanceof CompactContextError ? e.reason : 'unknown';
      const t = COMPACT_TOAST[reason] ?? {
        title: 'Compaction failed.',
        tone: 'error' as const,
      };
      toast.push({ title: t.title, tone: t.tone, duration: 5000 });
      // Refetch so the bar reflects any server-side change even on failure.
      void refetch();
    } finally {
      setCompacting(false);
    }
  }

  return (
    <div class="ctx-panel" data-testid="context-panel">
      <div class="ctx-panel__head">
        <span class="ctx-panel__title">Context</span>
        <div class="ctx-panel__selector">
          <Dropdown
            label={selectedLabel()}
            icon="agents"
            testid="context-panel-expert"
            items={expertItems()}
            selectedId={scope()}
            emptyHint="No experts"
            onPick={(it) => setScope(it.value)}
          />
        </div>
        <Show when={props.onClose}>
          <button
            type="button"
            class="dp-iconbtn"
            title="Close"
            data-testid="context-panel-close"
            onClick={() => props.onClose?.()}
          >
            <Icon name="close" size={14} />
          </button>
        </Show>
      </div>

      <Show
        when={state()}
        fallback={
          <Show
            when={!state.error}
            fallback={
              <div class="ctx-panel__empty" data-testid="context-panel-error">
                {String((state.error as Error)?.message ?? state.error)}
              </div>
            }
          >
            <div class="ctx-panel__loading">Loading context…</div>
          </Show>
        }
      >
        {(s) => (
          <>
            <ContextUsageBar
              state={s()}
              showHeader
              showLegend
              testid="context-panel-bar"
            />
            <div class="ctx-panel__actions">
              <button
                type="button"
                class="ctx-panel__compact"
                data-testid="context-panel-compact"
                disabled={compacting() || !hasLive()}
                title={
                  hasLive()
                    ? 'Summarize the live working set into one summary segment'
                    : 'Nothing to compact'
                }
                onClick={() => void doCompact()}
              >
                <Icon name="sparkle" size={12} />
                {compacting() ? 'Compacting…' : 'Compact now'}
              </button>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
