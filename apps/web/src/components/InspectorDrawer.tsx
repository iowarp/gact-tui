import { createMemo, createSignal, For, Show } from 'solid-js';
import { Icon } from './Icon.js';
import type { ContextFile, Message, Part, FileDiff, SessionTask } from '@clio/core';
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
  /** Per-session task list from /v1/sessions/{id}/tasks. */
  tasks?: SessionTask[];
  /** Per-session context files from /v1/sessions/{id}/context/files. */
  contextFiles?: ContextFile[];
  /** Per-session time-series memory snapshots from
   * /v1/sessions/{id}/context/frames. Surfaces in the Frames tab. */
  frames?: ContextFrameRow[];
  /** Per-session pending diffs from /v1/sessions/{id}/diffs — these
   * surface on the Diffs tab in addition to the current message's
   * file_diff parts so the user can see everything pending in the
   * session. */
  sessionDiffs?: SessionDiffRow[];
  /** Per-session cron triggers from /v1/sessions/{id}/schedules. */
  schedules?: ScheduleRow[];
  /** Create a new schedule (POST /v1/sessions/{id}/schedules). */
  onCreateSchedule?: (body: { cron: string; prompt: string }) => void | Promise<void>;
  /** Delete a schedule (DELETE /v1/schedules/{id}). */
  onDeleteSchedule?: (scheduleId: string) => void | Promise<void>;
  /** Called when the user clicks a diff entry — opens the DiffPane. */
  onOpenDiff?: (diff: FileDiff) => void;
  /** Callback to remove a context file (DELETE /v1/sessions/{id}/context/files). */
  onRemoveContextFile?: (path: string) => void | Promise<void>;
  onClose: () => void;
}

export interface ContextFrameRow {
  id: string;
  created_at?: string;
  status?: string;
  summary?: string;
  token_count?: number;
}

export interface ScheduleRow {
  id: string;
  cron?: string;
  next_run_at?: string;
  enabled?: boolean;
  prompt?: string;
}

export interface SessionDiffRow {
  path: string;
  applied?: boolean;
  message_id?: string;
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

type InspectorTab =
  | 'turn'
  | 'tools'
  | 'diffs'
  | 'thinking'
  | 'tasks'
  | 'context'
  | 'frames'
  | 'schedules'
  | 'health';

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
  const hasTasks = () => !!props.tasks && props.tasks.length > 0;
  const hasContextFiles = () =>
    !!props.contextFiles && props.contextFiles.length > 0;
  const hasFrames = () => !!props.frames && props.frames.length > 0;
  const hasSessionDiffs = () =>
    !!props.sessionDiffs && props.sessionDiffs.length > 0;
  const hasSchedules = () =>
    !!props.schedules && (props.schedules.length > 0 || !!props.onCreateSchedule);

  const hasAnyContent = () =>
    hasRunData() ||
    props.toolCalls.length > 0 ||
    hasThinking() ||
    hasDiffs() ||
    hasSessionDiffs() ||
    hasTasks() ||
    hasContextFiles() ||
    hasFrames() ||
    hasSchedules() ||
    hasIntegrations();

  // Order matters — the picker walks this list and lands on the
  // first tab whose data is present.
  const availableTabs = createMemo<InspectorTab[]>(() => {
    const out: InspectorTab[] = [];
    if (hasRunData()) out.push('turn');
    if (props.toolCalls.length > 0) out.push('tools');
    if (hasDiffs() || hasSessionDiffs()) out.push('diffs');
    if (hasThinking()) out.push('thinking');
    if (hasTasks()) out.push('tasks');
    if (hasContextFiles()) out.push('context');
    if (hasFrames()) out.push('frames');
    if (hasSchedules()) out.push('schedules');
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
    tasks: 'Tasks',
    context: 'Context',
    frames: 'Frames',
    schedules: 'Schedules',
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
                  <span class="inspector__num">{humanNum(props.tokens?.input ?? 0)}</span>
                  <span class="inspector__num-sep">→</span>
                  <span class="inspector__num">{humanNum(props.tokens?.output ?? 0)}</span>
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
                  <ToolCallRow
                    summary={c}
                    parts={props.message?.parts ?? []}
                  />
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

        <Show when={(hasDiffs() || hasSessionDiffs()) && activeTab() === 'diffs'}>
          <section class="inspector__sect">
            <Show when={hasDiffs()}>
              <div class="inspector__sect-title">This turn's diffs</div>
              <ul class="inspector__diffs">
                <For each={(props.message?.parts ?? []).filter(
                  (p): p is FileDiff => p.type === 'file_diff',
                )}>
                  {(d) => (
                    <li
                      class={
                        'inspector__diff ' +
                        (props.onOpenDiff ? 'inspector__diff--click' : '')
                      }
                      data-testid={`inspector-diff-${d.path}`}
                      onClick={() => props.onOpenDiff?.(d)}
                    >
                      <Icon name="diff" size={14} />
                      <span class="inspector__diff-path">{d.path}</span>
                      <Show when={d.applied}>
                        <span class="inspector__chip inspector__chip--ok">applied</span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Show when={hasSessionDiffs()}>
              <div class="inspector__sect-title">All pending in session ({props.sessionDiffs!.length})</div>
              <ul class="inspector__diffs">
                <For each={props.sessionDiffs}>
                  {(d) => (
                    <li
                      class="inspector__diff"
                      data-testid={`inspector-sdiff-${d.path}`}
                    >
                      <Icon name="diff" size={14} />
                      <span class="inspector__diff-path">{d.path}</span>
                      <Show when={d.applied}>
                        <span class="inspector__chip inspector__chip--ok">applied</span>
                      </Show>
                      <Show when={!d.applied}>
                        <span class="inspector__chip">pending</span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </Show>

        <Show when={hasFrames() && activeTab() === 'frames'}>
          <section class="inspector__sect">
            <div class="inspector__sect-title">
              Context frames ({props.frames!.length})
            </div>
            <ul class="inspector__frames">
              <For each={props.frames}>
                {(f) => (
                  <li
                    class={'inspector__frame inspector__frame--' + (f.status ?? 'unknown')}
                    data-testid={`inspector-frame-${f.id}`}
                  >
                    <div class="inspector__frame-head">
                      <span class="inspector__frame-id">{f.id.slice(0, 12)}</span>
                      <Show when={f.status}>
                        <span class="inspector__chip">{f.status}</span>
                      </Show>
                      <Show when={typeof f.token_count === 'number'}>
                        <span class="inspector__frame-tokens">{f.token_count}t</span>
                      </Show>
                    </div>
                    <Show when={f.summary}>
                      <div class="inspector__frame-summary">{f.summary}</div>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

        <Show when={hasTasks() && activeTab() === 'tasks'}>
          <section class="inspector__sect">
            <div class="inspector__sect-title">
              Tasks ({props.tasks!.length})
            </div>
            <ul class="inspector__tasks">
              <For each={props.tasks}>
                {(t) => (
                  <li
                    class={'inspector__task inspector__task--' + t.status}
                    data-testid={`inspector-task-${t.id}`}
                  >
                    <span class={'inspector__task-pip inspector__task-pip--' + t.status} />
                    <span class="inspector__task-title">{t.title}</span>
                    <span class="inspector__task-status">{t.status}</span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

        <Show when={hasContextFiles() && activeTab() === 'context'}>
          <section class="inspector__sect">
            <div class="inspector__sect-title">
              Context files ({props.contextFiles!.length})
            </div>
            <ul class="inspector__files">
              <For each={props.contextFiles}>
                {(f) => (
                  <li
                    class={'inspector__file inspector__file--' + (f.mode ?? 'read')}
                    data-testid={`inspector-file-${f.path}`}
                  >
                    <Icon
                      name={f.mode === 'edit' ? 'edit' : 'diff'}
                      size={12}
                      class="inspector__file-icon"
                    />
                    <span class="inspector__file-path" title={f.path}>{f.path}</span>
                    <Show when={f.language}>
                      <span class="inspector__file-lang">{f.language}</span>
                    </Show>
                    <Show when={props.onRemoveContextFile}>
                      <button
                        type="button"
                        class="inspector__file-x"
                        title="Remove from context"
                        aria-label={`Remove ${f.path} from context`}
                        onClick={() => void props.onRemoveContextFile?.(f.path)}
                      >
                        <Icon name="close" size={10} />
                      </button>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

        <Show when={hasSchedules() && activeTab() === 'schedules'}>
          <SchedulesTab
            schedules={props.schedules ?? []}
            onCreate={props.onCreateSchedule}
            onDelete={props.onDeleteSchedule}
          />
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

function humanNum(n: number): string {
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toString();
}

function ToolCallRow(props: { summary: ToolCallSummary; parts: Part[] }) {
  const [open, setOpen] = createSignal(false);
  const callPart = () =>
    props.parts.find(
      (p) =>
        p.type === 'tool_call' &&
        (p.call_id === props.summary.callId || p.id === props.summary.callId),
    );
  const resultPart = () =>
    props.parts.find(
      (p) =>
        p.type === 'tool_result' &&
        (p.call_id === props.summary.callId ||
          p.tool_call_id === props.summary.callId),
    );

  const callInput = () => {
    const part = callPart();
    if (part?.type === 'tool_call' && part.input) {
      return JSON.stringify(part.input, null, 2);
    }
    return null;
  };

  const callOutput = () => {
    const part = resultPart();
    if (part?.type !== 'tool_result') return null;
    if (typeof part.output === 'string') return part.output;
    if (Array.isArray(part.content)) {
      return part.content
        .map((c) => (c.type === 'text' ? c.text : `[${c.type}]`))
        .join('\n');
    }
    return null;
  };

  const hasDetail = () => callInput() != null || callOutput() != null;

  return (
    <li
      class={'inspector__call inspector__call--' + props.summary.status}
      data-testid={`inspector-call-${props.summary.callId}`}
    >
      <button
        type="button"
        class="inspector__call-row"
        onClick={() => hasDetail() && setOpen((v) => !v)}
        disabled={!hasDetail()}
      >
        <Icon name="tool" size={14} class="inspector__call-icon" />
        <span class="inspector__call-name">{props.summary.toolName}</span>
        <Show when={props.summary.durationMs != null}>
          <span class="inspector__call-dur">{props.summary.durationMs}ms</span>
        </Show>
        <Show when={hasDetail()}>
          <Icon
            name="chevron-right"
            size={12}
            class={'inspector__call-chev ' + (open() ? 'is-open' : '')}
          />
        </Show>
      </button>
      <Show when={open() && callInput()}>
        <div class="inspector__call-detail">
          <div class="inspector__call-detail-label">
            input
            <button
              type="button"
              class="inspector__call-copy"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(callInput()!);
                }
              }}
              title="Copy input JSON"
            >
              copy
            </button>
          </div>
          <pre class="inspector__call-detail-body">{callInput()}</pre>
        </div>
      </Show>
      <Show when={open() && callOutput()}>
        <div class="inspector__call-detail">
          <div class="inspector__call-detail-label">
            output
            <button
              type="button"
              class="inspector__call-copy"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(callOutput()!);
                }
              }}
              title="Copy output"
            >
              copy
            </button>
          </div>
          <pre class="inspector__call-detail-body">{callOutput()}</pre>
        </div>
      </Show>
    </li>
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

/** Cron-style schedules per session. Renders the list with delete
 * buttons + a minimal create form. Capability-gated upstream. */
function SchedulesTab(props: {
  schedules: ScheduleRow[];
  onCreate?: (body: { cron: string; prompt: string }) => void | Promise<void>;
  onDelete?: (scheduleId: string) => void | Promise<void>;
}) {
  const [cron, setCron] = createSignal('');
  const [prompt, setPrompt] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  async function submit(ev: SubmitEvent) {
    ev.preventDefault();
    if (!props.onCreate) return;
    const c = cron().trim();
    const p = prompt().trim();
    if (!c || !p || busy()) return;
    setBusy(true);
    try {
      await props.onCreate({ cron: c, prompt: p });
      setCron('');
      setPrompt('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">
        Schedules ({props.schedules.length})
      </div>
      <ul class="inspector__schedules">
        <For each={props.schedules}>
          {(s) => (
            <li
              class={
                'inspector__schedule ' +
                (s.enabled === false ? 'inspector__schedule--off' : '')
              }
              data-testid={`inspector-schedule-${s.id}`}
            >
              <div class="inspector__schedule-head">
                <code class="inspector__schedule-cron">{s.cron ?? '(no cron)'}</code>
                <Show when={s.enabled === false}>
                  <span class="inspector__chip">disabled</span>
                </Show>
                <Show when={s.next_run_at}>
                  <span class="inspector__schedule-next">next {s.next_run_at}</span>
                </Show>
                <Show when={props.onDelete}>
                  <button
                    type="button"
                    class="inspector__schedule-x"
                    title="Delete schedule"
                    aria-label="Delete schedule"
                    onClick={() => void props.onDelete?.(s.id)}
                  >
                    <Icon name="close" size={10} />
                  </button>
                </Show>
              </div>
              <Show when={s.prompt}>
                <div class="inspector__schedule-prompt">{s.prompt}</div>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.onCreate}>
        <form class="inspector__schedule-form" onSubmit={submit}>
          <input
            class="inspector__schedule-input inspector__schedule-input--cron"
            type="text"
            placeholder="0 9 * * * (cron)"
            value={cron()}
            onInput={(e) => setCron(e.currentTarget.value)}
            data-testid="schedule-cron-input"
          />
          <input
            class="inspector__schedule-input"
            type="text"
            placeholder="Prompt to send on schedule"
            value={prompt()}
            onInput={(e) => setPrompt(e.currentTarget.value)}
            data-testid="schedule-prompt-input"
          />
          <button
            type="submit"
            class="inspector__schedule-add"
            disabled={busy() || !cron().trim() || !prompt().trim()}
            data-testid="schedule-add"
          >
            <Icon name="plus" size={12} />
            <span>Add</span>
          </button>
        </form>
      </Show>
    </section>
  );
}
