import { createMemo, createSignal, For, Show } from 'solid-js';
import { Icon } from './Icon.js';
import type { Message, Part, FileDiff } from '@clio/core';
import { createPersistedString } from '../persisted.js';
import './inspector-drawer.css';

export interface InspectorDrawerProps {
  open: boolean;
  /** Latest assistant message (or current turn) — drives the metadata panel. */
  message: Message | null;
  /** Pending tool-call activity for the active turn. */
  toolCalls: ToolCallSummary[];
  /** Rolling per-session cost. */
  costUsd: number;
  /** Tokens for the latest completed turn. */
  tokens?: { input?: number; output?: number; total?: number };
  /** Optional model identifier shown in the header. */
  model?: string;
  /** Backend integration health entries (from /v1/health when capability is on). */
  integrations?: IntegrationStatus[];
  onClose: () => void;
}

export interface ToolCallSummary {
  callId: string;
  toolName: string;
  status: 'started' | 'completed' | 'error';
  durationMs?: number;
}

export interface IntegrationStatus {
  name: string;
  status: 'ready' | 'degraded' | 'unavailable' | 'skipped';
  summary?: string;
}

type InspectorTab = 'turn' | 'tools' | 'diffs' | 'thinking' | 'health';

export function InspectorDrawer(props: InspectorDrawerProps) {
  const hasRunData = () =>
    props.message?.stop_reason ||
    props.model ||
    (props.tokens?.input ?? 0) + (props.tokens?.output ?? 0) > 0 ||
    props.costUsd > 0;

  const hasThinking = () =>
    !!props.message?.parts?.some((p) => p.type === 'thinking');
  const hasDiffs = () =>
    !!props.message?.parts?.some((p) => p.type === 'file_diff');
  const hasIntegrations = () =>
    !!props.integrations && props.integrations.length > 0;

  const hasAnyContent = () =>
    hasRunData() ||
    props.toolCalls.length > 0 ||
    hasThinking() ||
    hasDiffs() ||
    hasIntegrations();

  // Order matters — the picker walks this list and lands on the
  // first tab whose data is present.
  const availableTabs = createMemo<InspectorTab[]>(() => {
    const out: InspectorTab[] = [];
    if (hasRunData()) out.push('turn');
    if (props.toolCalls.length > 0) out.push('tools');
    if (hasDiffs()) out.push('diffs');
    if (hasThinking()) out.push('thinking');
    if (hasIntegrations()) out.push('health');
    return out;
  });

  const [activeTabRaw, setActiveTabRaw] = createPersistedString(
    'clio.inspector.tab.v1',
    'turn',
  );
  const [stickyTab, setStickyTab] = createSignal<InspectorTab | null>(null);

  const activeTab = createMemo<InspectorTab>(() => {
    const tabs = availableTabs();
    if (tabs.length === 0) return 'turn';
    const wanted = (stickyTab() ?? activeTabRaw()) as InspectorTab;
    if (tabs.includes(wanted)) return wanted;
    return tabs[0] ?? 'turn';
  });

  function pickTab(t: InspectorTab) {
    setStickyTab(t);
    setActiveTabRaw(t);
  }

  const TAB_LABEL: Record<InspectorTab, string> = {
    turn: 'Turn',
    tools: 'Tools',
    diffs: 'Diffs',
    thinking: 'Thinking',
    health: 'Health',
  };

  return (
    <Show when={props.open}>
      <aside class="inspector" data-testid="inspector-drawer" aria-label="Turn inspector">
        <header class="inspector__head">
          <h3 class="inspector__title">Turn inspector</h3>
          <button
            type="button"
            class="inspector__close"
            onClick={props.onClose}
            aria-label="Close inspector"
            data-testid="inspector-close"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <Show when={!hasAnyContent()}>
          <div class="inspector__empty" data-testid="inspector-empty">
            <div class="inspector__empty-icon">
              <Icon name="sparkle" size={20} />
            </div>
            <p class="inspector__empty-title">Waiting for the first turn</p>
            <p class="inspector__empty-body">
              Stop reason, tokens, cost, tool calls, thinking blocks,
              diffs, and integration health land here once CLIO answers.
            </p>
          </div>
        </Show>

        <Show when={availableTabs().length > 1}>
          <nav class="inspector__tabs" role="tablist" aria-label="Inspector sections">
            <For each={availableTabs()}>
              {(t) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab() === t}
                  class={
                    'inspector__tab ' +
                    (activeTab() === t ? 'is-active' : '')
                  }
                  data-testid={`inspector-tab-${t}`}
                  onClick={() => pickTab(t)}
                >
                  {TAB_LABEL[t]}
                </button>
              )}
            </For>
          </nav>
        </Show>

        <Show when={hasRunData() && activeTab() === 'turn'}>
          <section class="inspector__sect">
            <div class="inspector__sect-title">Run</div>
            <dl class="inspector__kv">
              <Show when={props.message?.stop_reason}>
                <dt>stop_reason</dt>
                <dd>
                  <span
                    class={
                      'inspector__chip ' +
                      (props.message!.stop_reason === 'error'
                        ? 'inspector__chip--err'
                        : 'inspector__chip--ok')
                    }
                  >
                    {props.message!.stop_reason}
                  </span>
                </dd>
              </Show>
              <Show when={props.model}>
                <dt>model</dt>
                <dd>{props.model}</dd>
              </Show>
              <Show when={(props.tokens?.input ?? 0) + (props.tokens?.output ?? 0) > 0}>
                <dt>tokens</dt>
                <dd>
                  <span class="inspector__num">{props.tokens?.input ?? 0}</span>
                  <span class="inspector__num-sep">→</span>
                  <span class="inspector__num">{props.tokens?.output ?? 0}</span>
                </dd>
              </Show>
              <Show when={props.costUsd > 0}>
                <dt>cost</dt>
                <dd class="inspector__num">${props.costUsd.toFixed(4)}</dd>
              </Show>
            </dl>
          </section>
        </Show>

        <Show when={props.toolCalls.length > 0 && activeTab() === 'tools'}>
          <section class="inspector__sect">
            <div class="inspector__sect-title">Tool calls</div>
            <ul class="inspector__calls">
              <For each={props.toolCalls}>
                {(c) => (
                  <li class={'inspector__call inspector__call--' + c.status}>
                    <Icon name="tool" size={14} class="inspector__call-icon" />
                    <span class="inspector__call-name">{c.toolName}</span>
                    <Show when={c.durationMs != null}>
                      <span class="inspector__call-dur">{c.durationMs}ms</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

        <Show when={hasThinking() && activeTab() === 'thinking'}>
          <section class="inspector__sect">
            <div class="inspector__sect-title">Thinking</div>
            <For each={(props.message?.parts ?? []).filter((p) => p.type === 'thinking')}>
              {(p) => (
                <pre class="inspector__thinking">
                  {(p as { thinking?: string; text?: string }).thinking ??
                    (p as { text?: string }).text ??
                    ''}
                </pre>
              )}
            </For>
          </section>
        </Show>

        <Show when={hasDiffs() && activeTab() === 'diffs'}>
          <section class="inspector__sect">
            <div class="inspector__sect-title">Diffs</div>
            <ul class="inspector__diffs">
              <For each={(props.message?.parts ?? []).filter(
                (p): p is FileDiff => p.type === 'file_diff',
              )}>
                {(d) => (
                  <li class="inspector__diff">
                    <Icon name="diff" size={14} />
                    <span class="inspector__diff-path">{d.path}</span>
                    <Show when={d.applied}>
                      <span class="inspector__chip inspector__chip--ok">applied</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

        <Show when={hasIntegrations() && activeTab() === 'health'}>
          <section class="inspector__sect">
            <div class="inspector__sect-title">Integrations</div>
            <ul class="inspector__integrations">
              <For each={props.integrations}>
                {(i) => (
                  <li class={'inspector__integration inspector__integration--' + i.status}>
                    <span class="inspector__integration-dot" />
                    <span class="inspector__integration-name">{i.name}</span>
                    <Show when={i.summary}>
                      <span class="inspector__integration-summary">{i.summary}</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
      </aside>
    </Show>
  );
}

// Helper to derive a flat ToolCallSummary[] from a Message's parts (caller
// passes them in already-shaped; this is here as a convenience for tests).
export function summarizeToolCalls(parts: Part[]): ToolCallSummary[] {
  const out: ToolCallSummary[] = [];
  for (const p of parts) {
    if (p.type === 'tool_call') {
      out.push({
        callId: p.call_id ?? p.id ?? 'unknown',
        toolName: p.tool_name,
        status: 'started',
      });
    }
    if (p.type === 'tool_result') {
      const target = out.find((t) => t.callId === (p.call_id ?? p.tool_call_id));
      if (target) {
        target.status = p.is_error ? 'error' : 'completed';
        if (p.duration_ms != null) target.durationMs = p.duration_ms;
      }
    }
  }
  return out;
}
