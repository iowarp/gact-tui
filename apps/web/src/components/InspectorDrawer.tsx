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
  /** Cycle a task's status — wired by ChatScreen to PATCH /v1/tasks/{tid}. */
  onCycleTaskStatus?: (
    taskId: string,
    next: SessionTask['status'],
  ) => void | Promise<void>;
  /** Per-session context files from /v1/sessions/{id}/context/files. */
  contextFiles?: ContextFile[];
  /** Per-session time-series memory snapshots from
   * /v1/sessions/{id}/context/frames. Surfaces in the Frames tab. */
  frames?: ContextFrameRow[];
  /** Lazy-load a single frame's full payload — wired by ChatScreen to
   * `client.sessionContextFrame(sid, frameId)`. */
  onLoadFrameDetail?: (frameId: string) => Promise<Record<string, unknown>>;
  /** Per-session pending diffs from /v1/sessions/{id}/diffs — these
   * surface on the Diffs tab in addition to the current message's
   * file_diff parts so the user can see everything pending in the
   * session. */
  sessionDiffs?: SessionDiffRow[];
  /** Bulk-apply all pending diffs (POST /v1/sessions/{id}/diffs/apply). */
  onApplyAllDiffs?: () => void | Promise<void>;
  /** Bulk-reject all pending diffs. */
  onRejectAllDiffs?: () => void | Promise<void>;
  /** Per-session cron triggers from /v1/sessions/{id}/schedules. */
  schedules?: ScheduleRow[];
  /** Create a new schedule (POST /v1/sessions/{id}/schedules). */
  onCreateSchedule?: (body: { cron: string; prompt: string }) => void | Promise<void>;
  /** Delete a schedule (DELETE /v1/schedules/{id}). */
  onDeleteSchedule?: (scheduleId: string) => void | Promise<void>;
  /** Per-session blueprint + expert-pack bindings (PR #386/#387 + #344). */
  bindings?: SessionBindings;
  /** Bind a different blueprint to the active session. Pass null to clear. */
  onSetBlueprint?: (blueprintId: string | null) => void | Promise<void>;
  /** Bind a different expert pack to the active session. Pass null to clear. */
  onSetExpertPack?: (packId: string | null) => void | Promise<void>;
  /** Called when the user clicks a diff entry — opens the DiffPane. */
  onOpenDiff?: (diff: FileDiff) => void;
  /** Callback to remove a context file (DELETE /v1/sessions/{id}/context/files). */
  onRemoveContextFile?: (path: string) => void | Promise<void>;
  /** Cycle a context file's mode (read → edit → pin → read). */
  onCycleContextFileMode?: (
    path: string,
    next: 'read' | 'edit' | 'pin',
  ) => void | Promise<void>;
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

export interface BindingOption {
  id: string;
  label: string;
  description?: string;
}

export interface SessionBindings {
  blueprint_id: string | null;
  pack_id: string | null;
  availableBlueprints: BindingOption[];
  availablePacks: BindingOption[];
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
  | 'timeline'
  | 'tools'
  | 'diffs'
  | 'thinking'
  | 'tasks'
  | 'context'
  | 'frames'
  | 'schedules'
  | 'bindings'
  | 'health';

// ---- Execution timeline (1.0 item 5) ----

export interface TimelineEvent {
  /** Event kind — drives icon + color. */
  kind:
    | 'started'
    | 'routing'
    | 'thinking'
    | 'tool'
    | 'diff'
    | 'text'
    | 'handoff'
    | 'completed';
  label: string;
  detail?: string;
  /** Measured duration where the wire provides one (tool results). */
  durationMs?: number;
  /** Absolute timestamp where the wire provides one — never fabricated. */
  at?: string;
  status: 'ok' | 'error' | 'running';
}

/**
 * Build the per-turn execution timeline from a message's parts.
 *
 * Honest representation: the GACT wire guarantees parts arrive in append
 * order but does NOT timestamp individual parts — so the timeline shows
 * real sequence, plus timestamps/durations only where the wire actually
 * provides them (message created/updated, tool_result.duration_ms).
 */
export function assembleTimeline(msg: Message): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  events.push({
    kind: 'started',
    label: msg.role === 'assistant' ? 'Turn started' : 'Message sent',
    ...(msg.created_at ? { at: msg.created_at } : {}),
    status: 'ok',
  });

  // Pair tool calls with their results for status + duration.
  const resultByCallId = new Map<
    string,
    { is_error?: boolean; duration_ms?: number }
  >();
  for (const p of msg.parts) {
    if (p.type === 'tool_result') {
      const cid = p.call_id ?? p.tool_call_id;
      if (cid) resultByCallId.set(cid, p);
    }
  }

  let textEmitted = false;
  for (const p of msg.parts) {
    switch (p.type) {
      case 'routing_decision':
        events.push({
          kind: 'routing',
          label: `Routed to ${p.selected_agent}`,
          ...(p.rationale ? { detail: p.rationale } : {}),
          status: 'ok',
        });
        break;
      case 'thinking': {
        const body =
          (p as { thinking?: string; text?: string }).thinking ??
          (p as { text?: string }).text ??
          '';
        const words = body.trim() ? body.trim().split(/\s+/).length : 0;
        events.push({
          kind: 'thinking',
          label: 'Thinking',
          ...(words > 0 ? { detail: `~${words} words` } : {}),
          status: 'ok',
        });
        break;
      }
      case 'tool_call': {
        const cid = p.call_id ?? p.id ?? '';
        const res = cid ? resultByCallId.get(cid) : undefined;
        events.push({
          kind: 'tool',
          label: p.tool_name,
          detail: res
            ? res.is_error
              ? 'failed'
              : 'completed'
            : 'no result recorded',
          ...(res?.duration_ms != null ? { durationMs: res.duration_ms } : {}),
          status: res ? (res.is_error ? 'error' : 'ok') : 'running',
        });
        break;
      }
      case 'file_diff':
        events.push({
          kind: 'diff',
          label: 'Proposed diff',
          detail: p.path,
          status: 'ok',
        });
        break;
      case 'expert_handoff':
        events.push({
          kind: 'handoff',
          label: 'Expert handoff',
          ...(p.text ? { detail: p.text } : {}),
          status: 'ok',
        });
        break;
      case 'text':
        // One row for the response text, however many text parts stream in.
        if (!textEmitted) {
          events.push({ kind: 'text', label: 'Response text', status: 'ok' });
          textEmitted = true;
        }
        break;
      default:
        break;
    }
  }

  if (msg.stop_reason) {
    const failed = msg.stop_reason === 'error';
    const tokens = msg.tokens;
    const bits: string[] = [];
    if (tokens?.input != null || tokens?.output != null) {
      bits.push(`${tokens?.input ?? 0}→${tokens?.output ?? 0} tok`);
    }
    if (msg.cost_usd) bits.push(`$${msg.cost_usd.toFixed(4)}`);
    // Real elapsed time between the wire's own created/updated stamps.
    if (msg.created_at && msg.updated_at) {
      const ms =
        new Date(msg.updated_at).getTime() - new Date(msg.created_at).getTime();
      if (ms > 0) bits.push(`${(ms / 1000).toFixed(1)}s`);
    }
    events.push({
      kind: 'completed',
      label: failed ? 'Turn failed' : `Turn completed (${msg.stop_reason})`,
      ...(bits.length ? { detail: bits.join(' · ') } : {}),
      ...(msg.updated_at ? { at: msg.updated_at } : {}),
      status: failed ? 'error' : 'ok',
    });
  }
  return events;
}

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
  const hasBindings = () =>
    !!props.bindings &&
    (props.bindings.availableBlueprints.length > 0 ||
      props.bindings.availablePacks.length > 0 ||
      props.bindings.blueprint_id !== null ||
      props.bindings.pack_id !== null);

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
    hasBindings() ||
    hasIntegrations();

  // Order matters — the picker walks this list and lands on the
  // first tab whose data is present.
  const hasTimeline = () => !!props.message && props.message.parts.length > 0;

  const availableTabs = createMemo<InspectorTab[]>(() => {
    const out: InspectorTab[] = [];
    if (hasRunData()) out.push('turn');
    if (hasTimeline()) out.push('timeline');
    if (props.toolCalls.length > 0) out.push('tools');
    if (hasDiffs() || hasSessionDiffs()) out.push('diffs');
    if (hasThinking()) out.push('thinking');
    if (hasTasks()) out.push('tasks');
    if (hasContextFiles()) out.push('context');
    if (hasFrames()) out.push('frames');
    if (hasSchedules()) out.push('schedules');
    if (hasBindings()) out.push('bindings');
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
    timeline: 'Timeline',
    tools: 'Tools',
    diffs: 'Diffs',
    thinking: 'Thinking',
    tasks: 'Tasks',
    context: 'Context',
    frames: 'Frames',
    schedules: 'Schedules',
    bindings: 'Bindings',
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

        <Show when={availableTabs().length > 0}>
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

        <Show when={hasTimeline() && activeTab() === 'timeline'}>
          <section class="inspector__sect" data-testid="inspector-timeline">
            <div class="inspector__sect-title">Execution timeline</div>
            {(() => {
              const events = createMemo(() =>
                props.message ? assembleTimeline(props.message) : [],
              );
              const maxDuration = createMemo(() =>
                Math.max(1, ...events().map((e) => e.durationMs ?? 0)),
              );
              return (
                <ol class="inspector__timeline" data-testid="inspector-timeline-list">
                  <For each={events()}>
                    {(ev) => (
                      <li
                        class={
                          'inspector__tl-event' +
                          ` inspector__tl-event--${ev.kind}` +
                          ` inspector__tl-event--${ev.status}`
                        }
                        data-testid={`timeline-event-${ev.kind}`}
                      >
                        <span class="inspector__tl-dot" aria-hidden="true" />
                        <div class="inspector__tl-body">
                          <div class="inspector__tl-head">
                            <span class="inspector__tl-label">{ev.label}</span>
                            <Show when={ev.durationMs != null}>
                              <span class="inspector__tl-dur">
                                {ev.durationMs! >= 1000
                                  ? `${(ev.durationMs! / 1000).toFixed(1)}s`
                                  : `${ev.durationMs}ms`}
                              </span>
                            </Show>
                            <Show when={ev.at}>
                              <span class="inspector__tl-time">
                                {new Date(ev.at!).toLocaleTimeString()}
                              </span>
                            </Show>
                          </div>
                          <Show when={ev.detail}>
                            <div class="inspector__tl-detail">{ev.detail}</div>
                          </Show>
                          <Show when={ev.durationMs != null}>
                            <div
                              class="inspector__tl-bar"
                              style={{
                                width: `${Math.max(2, Math.round((ev.durationMs! / maxDuration()) * 100))}%`,
                              }}
                            />
                          </Show>
                        </div>
                      </li>
                    )}
                  </For>
                </ol>
              );
            })()}
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
              <div class="inspector__sect-title">
                All pending in session ({props.sessionDiffs!.length})
              </div>
              <Show when={props.onApplyAllDiffs || props.onRejectAllDiffs}>
                <div class="inspector__bulk-actions">
                  <Show when={props.onApplyAllDiffs}>
                    <button
                      type="button"
                      class="inspector__bulk-btn"
                      onClick={() => void props.onApplyAllDiffs?.()}
                      data-testid="inspector-diffs-apply-all"
                    >
                      Apply all
                    </button>
                  </Show>
                  <Show when={props.onRejectAllDiffs}>
                    <button
                      type="button"
                      class="inspector__bulk-btn inspector__bulk-btn--danger"
                      onClick={() => void props.onRejectAllDiffs?.()}
                      data-testid="inspector-diffs-reject-all"
                    >
                      Reject all
                    </button>
                  </Show>
                </div>
              </Show>
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
          <FramesTab
            frames={props.frames!}
            onLoadDetail={props.onLoadFrameDetail}
          />
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
                    onClick={() => {
                      if (!props.onCycleTaskStatus) return;
                      const order: SessionTask['status'][] = [
                        'pending',
                        'running',
                        'completed',
                      ];
                      const i = Math.max(0, order.indexOf(t.status));
                      const next = order[(i + 1) % order.length]!;
                      void props.onCycleTaskStatus(t.id, next);
                    }}
                    style={props.onCycleTaskStatus ? 'cursor: pointer' : ''}
                    title={
                      props.onCycleTaskStatus ? 'Click to cycle status' : undefined
                    }
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
                    <Show when={props.onCycleContextFileMode}>
                      <button
                        type="button"
                        class="inspector__file-mode"
                        title="Cycle mode: read → edit → pin"
                        onClick={() => {
                          const order: Array<'read' | 'edit' | 'pin'> = [
                            'read',
                            'edit',
                            'pin',
                          ];
                          const cur = (f.mode ?? 'read') as 'read' | 'edit' | 'pin';
                          const next = order[(order.indexOf(cur) + 1) % order.length]!;
                          void props.onCycleContextFileMode?.(f.path, next);
                        }}
                      >
                        {f.mode ?? 'read'}
                      </button>
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

        <Show when={hasBindings() && activeTab() === 'bindings'}>
          <BindingsTab
            bindings={props.bindings!}
            onSetBlueprint={props.onSetBlueprint}
            onSetExpertPack={props.onSetExpertPack}
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

/** Frames tab — each row expands on click to lazy-fetch the
 * single-frame detail and pretty-print its payload. */
function FramesTab(props: {
  frames: ContextFrameRow[];
  onLoadDetail?: (frameId: string) => Promise<Record<string, unknown>>;
}) {
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [details, setDetails] = createSignal<Record<string, Record<string, unknown> | string>>({});

  async function toggle(id: string) {
    const cur = new Set(expanded());
    if (cur.has(id)) {
      cur.delete(id);
    } else {
      cur.add(id);
      if (props.onLoadDetail && !details()[id]) {
        try {
          const d = await props.onLoadDetail(id);
          setDetails({ ...details(), [id]: d });
        } catch (e) {
          setDetails({
            ...details(),
            [id]: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    setExpanded(cur);
  }

  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">
        Context frames ({props.frames.length})
      </div>
      <ul class="inspector__frames">
        <For each={props.frames}>
          {(f) => (
            <li
              class={'inspector__frame inspector__frame--' + (f.status ?? 'unknown')}
              data-testid={`inspector-frame-${f.id}`}
            >
              <button
                type="button"
                class="inspector__frame-head inspector__frame-head--clickable"
                onClick={() => void toggle(f.id)}
                data-testid={`inspector-frame-toggle-${f.id}`}
              >
                <Icon
                  name="chevron-right"
                  size={11}
                  class={
                    'inspector__frame-chev ' +
                    (expanded().has(f.id) ? 'is-open' : '')
                  }
                />
                <span class="inspector__frame-id">{f.id.slice(0, 12)}</span>
                <Show when={f.status}>
                  <span class="inspector__chip">{f.status}</span>
                </Show>
                <Show when={typeof f.token_count === 'number'}>
                  <span class="inspector__frame-tokens">{f.token_count}t</span>
                </Show>
              </button>
              <Show when={f.summary}>
                <div class="inspector__frame-summary">{f.summary}</div>
              </Show>
              <Show when={expanded().has(f.id)}>
                <Show
                  when={details()[f.id]}
                  fallback={
                    <div class="inspector__frame-loading">Loading…</div>
                  }
                >
                  <pre class="inspector__frame-payload">
                    {typeof details()[f.id] === 'string'
                      ? (details()[f.id] as string)
                      : JSON.stringify(details()[f.id], null, 2)}
                  </pre>
                </Show>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

/** Per-session blueprint + expert-pack bindings. Dropdowns let the
 * user swap the active blueprint/pack on the running session
 * (PRs #386/#387, #344/#376/#377). */
function BindingsTab(props: {
  bindings: SessionBindings;
  onSetBlueprint?: (id: string | null) => void | Promise<void>;
  onSetExpertPack?: (id: string | null) => void | Promise<void>;
}) {
  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">Agent blueprint</div>
      <select
        class="inspector__binding-select"
        value={props.bindings.blueprint_id ?? ''}
        onChange={(e) => {
          const v = e.currentTarget.value;
          void props.onSetBlueprint?.(v === '' ? null : v);
        }}
        data-testid="binding-blueprint"
      >
        <option value="">— None —</option>
        <For each={props.bindings.availableBlueprints}>
          {(bp) => <option value={bp.id}>{bp.label}</option>}
        </For>
      </select>
      <Show
        when={
          props.bindings.blueprint_id &&
          props.bindings.availableBlueprints.find(
            (b) => b.id === props.bindings.blueprint_id,
          )?.description
        }
      >
        <p class="inspector__binding-desc">
          {props.bindings.availableBlueprints.find(
            (b) => b.id === props.bindings.blueprint_id,
          )?.description}
        </p>
      </Show>

      <div class="inspector__sect-title">Expert pack</div>
      <select
        class="inspector__binding-select"
        value={props.bindings.pack_id ?? ''}
        onChange={(e) => {
          const v = e.currentTarget.value;
          void props.onSetExpertPack?.(v === '' ? null : v);
        }}
        data-testid="binding-expert-pack"
      >
        <option value="">— None —</option>
        <For each={props.bindings.availablePacks}>
          {(p) => <option value={p.id}>{p.label}</option>}
        </For>
      </select>
      <Show
        when={
          props.bindings.pack_id &&
          props.bindings.availablePacks.find(
            (p) => p.id === props.bindings.pack_id,
          )?.description
        }
      >
        <p class="inspector__binding-desc">
          {props.bindings.availablePacks.find(
            (p) => p.id === props.bindings.pack_id,
          )?.description}
        </p>
      </Show>
    </section>
  );
}

/** Cheap structural check — returns true when the input is 5 or 6
 * space-separated fields. Doesn't validate field ranges (the backend
 * is authoritative); just catches blatant typos before submit. */
function looksLikeCron(s: string): boolean {
  const fields = s.trim().split(/\s+/);
  return fields.length === 5 || fields.length === 6;
}

/** Humanise an ISO timestamp into a short "in N min" or "5h ago"
 * line. Falls back to the raw ISO when unparseable. */
function humanRelativeIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const delta = d.getTime() - Date.now();
  const sign = delta >= 0 ? '' : 'ago ';
  const abs = Math.abs(delta);
  const min = Math.round(abs / 60_000);
  if (min < 1) return delta >= 0 ? 'imminently' : 'just now';
  if (min < 60) return `${sign}in ${min}m`.replace('ago in', 'ago').trim();
  const hr = Math.round(min / 60);
  if (hr < 24) return delta >= 0 ? `in ${hr}h` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  return delta >= 0 ? `in ${day}d` : `${day}d ago`;
}

/** Best-effort cron → English for the schedule preview line. Doesn't
 * pretend to handle every cron grammar — just the common cases users
 * actually paste (asterisk-slash-N minutes/hours, fixed times,
 * days-of-week). Falls back to the raw string so unrecognised forms
 * still echo back. */
function humanizeCron(raw: string): string {
  const cron = raw.trim();
  if (!cron) return '';
  const parts = cron.split(/\s+/);
  if (parts.length < 5) return cron;
  const [m, h, dom, mon, dow] = parts;
  // every minute
  if (m === '*' && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    return 'Every minute';
  }
  // hourly at minute N
  if (h === '*' && dom === '*' && mon === '*' && dow === '*' && /^\d+$/.test(m ?? '')) {
    return `Every hour at :${(m ?? '0').padStart(2, '0')}`;
  }
  // every N minutes / hours
  const stepM = (m ?? '').match(/^\*\/(\d+)$/);
  if (stepM && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${stepM[1]} minutes`;
  }
  const stepH = (h ?? '').match(/^\*\/(\d+)$/);
  if (stepH && m === '0' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${stepH[1]} hours`;
  }
  // daily at HH:MM
  if (/^\d+$/.test(m ?? '') && /^\d+$/.test(h ?? '') && dom === '*' && mon === '*' && dow === '*') {
    return `Daily at ${(h ?? '0').padStart(2, '0')}:${(m ?? '0').padStart(2, '0')}`;
  }
  // weekly at HH:MM on DOW
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (
    /^\d+$/.test(m ?? '') &&
    /^\d+$/.test(h ?? '') &&
    dom === '*' &&
    mon === '*' &&
    /^[0-6]$/.test(dow ?? '')
  ) {
    return `Weekly on ${DOW[parseInt(dow ?? '0', 10)]} at ${(h ?? '0').padStart(2, '0')}:${(m ?? '0').padStart(2, '0')}`;
  }
  return cron;
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
                  <span
                    class="inspector__schedule-next"
                    title={s.next_run_at}
                  >
                    next {humanRelativeIso(s.next_run_at!)}
                  </span>
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
          <Show when={cron().trim()}>
            <span
              class={
                'inspector__schedule-preview ' +
                (looksLikeCron(cron()) ? '' : 'inspector__schedule-preview--bad')
              }
              data-testid="schedule-cron-preview"
              title={looksLikeCron(cron()) ? '' : 'Cron must be 5 (or 6) space-separated fields'}
            >
              {humanizeCron(cron())}
            </span>
          </Show>
        </form>
      </Show>
    </section>
  );
}
