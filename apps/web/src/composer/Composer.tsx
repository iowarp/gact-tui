import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { brand } from '@brand';
import { Chip, ContextMenu, Icon, type MenuItemDef, type SelectOption } from '../kit';
import { AsyncRunsPopover, type AsyncRunItem } from './AsyncRunsPopover';
import { Picker, type PickerItem } from './Picker';
import { ProviderModelPicker, type ProviderModelGroup } from './ProviderModelPicker';
import './composer.css';

export type ComposerMode = 'ask' | 'execute' | 'plan';

/**
 * The approval axis, from the wire Literal (gact/types.py: UpdateSessionRequest
 * .approval_mode). The prototype showed ask/auto-edits/auto/bypass, but that
 * was placeholder semantics for "a menu of acceptance modes" — these are the
 * values the backend actually accepts.
 */
export const APPROVAL_MODES = ['ask', 'auto-edits', 'bypass', 'ai-review'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export interface ComposerSubmission {
  text: string;
  mode: ComposerMode;
}

/**
 * A message held back for the busy agent's next step boundary — the
 * prototype's `mainQ` row (mq.up/mq.down/mq.startEdit/mq.rm, `queueRows()`).
 */
export interface QueuedMessage {
  id: string;
  text: string;
}

/**
 * Tail-biased path compaction for the placement chip. The prototype's paths
 * are naturally short (`/scratch/j4471`); a deep path keeps its LAST segments
 * — the part that names the place — behind a leading ellipsis. Done in code:
 * the CSS rtl-clip trick shuffles leading `~/` punctuation to the tail.
 */
export function compactPath(path: string, budget = 34): string {
  if (path.length <= budget) return path;
  const segments = path.split('/').filter(Boolean);
  let out = '';
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const next = `/${segments[i]}${out}`;
    if (next.length > budget) break;
    out = next;
  }
  return out ? `…${out}` : `…${path.slice(-budget)}`;
}

export interface ComposerProps {
  /** Where the turn will run — the prototype's host chip. */
  placement?: string;
  asyncCount?: number;
  /**
   * Per-task detail behind the async chip — the prototype's runs popover.
   * Omitted = the chip falls back to a direct `onOpenAsync` jump (the prior
   * behavior), since a popover with no row data would misrepresent what the
   * surface actually knows.
   */
  asyncTasks?: AsyncRunItem[];
  contextPercent?: number;
  models?: SelectOption[];
  modelId?: string;
  /**
   * True while the reads behind an empty `modelId` (the session record and
   * the global LM binding) have not BOTH resolved — the model pill shows
   * '—' instead of asserting "model not set" (round-6 CONCURRENCY finding).
   * Only meaningful when `modelId` is empty; a known id always wins.
   */
  modelUnresolved?: boolean;
  /** Live provider catalogue for the prototype's two-pane model picker. */
  modelProviders?: ProviderModelGroup[];
  thinkingLevel?: string;
  /** Real session execution axis: backend edit is labelled execute in the UI. */
  sessionMode?: 'execute' | 'plan';
  /**
   * Blocks input; `busyReason` is then REQUIRED to be shown. When
   * `onQueueMessage` is ALSO supplied, the prototype's real behavior applies
   * instead of a hard block: the field stays open and Send enqueues
   * (`sendTitle` becomes "Queue for the next step boundary") rather than
   * doing nothing.
   */
  busy?: boolean;
  busyReason?: string;
  /** Messages held back for the next step boundary while busy (mainQ). */
  queuedMessages?: QueuedMessage[];
  /** Supplying this is what turns a busy Send into "enqueue" instead of a
   *  disabled no-op — see `busy`. */
  onQueueMessage?: (text: string) => void;
  onReorderQueuedMessage?: (id: string, direction: 'up' | 'down') => void;
  onEditQueuedMessage?: (id: string, text: string) => void;
  onRemoveQueuedMessage?: (id: string) => void;
  /** mainQNow/fv.deliverNow — interrupt the current step and deliver the
   *  whole queue immediately. */
  onDeliverQueuedNow?: () => void;
  placeholder?: string;
  /** Slash commands, from client.commands(). Empty disables the `/` picker. */
  commands?: PickerItem[];
  /** Workspace files, from client.workspaceFiles(). Empty disables `@`. */
  files?: PickerItem[];
  onModelChange?: (id: string) => void;
  /** Wires the model picker's header gear ("provider settings") to real
   *  navigation. Omitted = shown disabled + flagged, never a silent no-op. */
  onOpenProviderSettings?: () => void;
  /** Current approval mode; omit when no session is open to carry one. */
  approvalMode?: ApprovalMode;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
  onSubmit: (submission: ComposerSubmission) => void;
  /**
   * True while the session's turn is actually in flight on the backend (not
   * just this client's own send round-trip). Combined with `onStop`, it
   * repurposes the send button into a stop control — owner request
   * 2026-08-05: "this should be changing to enable me to stop the session".
   * `running` alone (no `onStop`) leaves the send button unchanged, same as
   * every other optional wiring in this component.
   */
  running?: boolean;
  /** Cancels the in-flight run (POST /v1/sessions/{id}/cancel). Only takes
   *  effect while `running` is true. */
  onStop?: () => void;
  /** Pill chip click-throughs — the placement chip opens the workspace files
      browser, the async chip opens the runs view/popover, ctx opens
      telemetry. Omitted = the chip renders as text. */
  onOpenPlacement?: () => void;
  onOpenAsync?: () => void;
  onOpenContext?: () => void;
  /**
   * Rendered inside the composer block, below the frame — the prototype puts
   * its version stamp here, within the same 860px column. A sibling AFTER the
   * composer would push the whole block off the viewport floor.
   */
  footer?: ReactNode;
  /**
   * Fills the textarea from OUTSIDE the component — the fresh-state SUGGESTED
   * rows populate the composer on click. `token` must change on every use
   * (even reselecting the same starter) so the effect fires again.
   */
  insertPrompt?: { text: string; token: number };
}

/**
 * The composer — the prototype's input surface.
 *
 * Composed from the kit (Chip, Tabs, Select); it owns only the textarea and
 * the send affordance. A busy composer never silently swallows input: it
 * disables the field AND states the reason.
 */
export function Composer({
  placement,
  asyncCount,
  asyncTasks,
  contextPercent,
  models = [],
  modelId = '',
  modelUnresolved = false,
  modelProviders,
  thinkingLevel,
  sessionMode,
  approvalMode,
  onApprovalModeChange,
  running = false,
  onStop,
  busy = false,
  busyReason,
  queuedMessages,
  onQueueMessage,
  onReorderQueuedMessage,
  onEditQueuedMessage,
  onRemoveQueuedMessage,
  onDeliverQueuedNow,
  placeholder = `Message ${brand.name.toLowerCase()} (@ to reference, / for commands)`,
  commands = [],
  files = [],
  onModelChange = () => {},
  onOpenProviderSettings,
  onSubmit,
  onOpenPlacement,
  onOpenAsync,
  onOpenContext,
  footer,
  insertPrompt,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ComposerMode>(sessionMode ?? 'ask');
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [approvalMenuOpen, setApprovalMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [asyncPopoverOpen, setAsyncPopoverOpen] = useState(false);
  const [dismissedAsyncIds, setDismissedAsyncIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [queueEdit, setQueueEdit] = useState<{ id: string; text: string } | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const queue = queuedMessages ?? [];
  // Enqueueing is only real when the caller wired somewhere for the message
  // to land — otherwise busy stays a hard block, same as before.
  const canQueue = busy && Boolean(onQueueMessage);

  useEffect(() => {
    if (sessionMode) setMode(sessionMode);
  }, [sessionMode]);

  useEffect(() => {
    if (!insertPrompt) return;
    setText(insertPrompt.text);
    boxRef.current?.focus();
    // Depends on the whole object (not just .text): the caller mints a fresh
    // object with an incremented token on every use, so reselecting the SAME
    // starter still refills (and refocuses) the field.
  }, [insertPrompt]);

  // The prototype's continuous type-to-autogrow (onInput:
  // `el.style.height = min(scrollHeight,180)+'px'`) — every text change,
  // typed or programmatic (picker completion, starter insert, submit-clear),
  // re-measures. Reset to 'auto' first so deleting content shrinks the box
  // back down instead of only ever growing.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  // `/` commands a TURN, so it only counts at the very start. `@` references a
  // file and may appear anywhere in a sentence.
  const slashQuery = /^\/(\S*)$/.exec(text)?.[1];
  const atQuery = /(?:^|\s)@(\S*)$/.exec(text)?.[1];

  const matches = (items: PickerItem[], query: string): PickerItem[] =>
    items.filter((i) => `${i.label} ${i.id}`.toLowerCase().includes(query.toLowerCase()));

  const slashItems = slashQuery === undefined ? [] : matches(commands, slashQuery);
  const atItems = atQuery === undefined ? [] : matches(files, atQuery);

  // A picker only opens when the surface HAS that data. Opening an empty one
  // would read as the feature being broken rather than unavailable.
  const slashOpen = !dismissed && slashQuery !== undefined && commands.length > 0;
  const atOpen = !dismissed && !slashOpen && atQuery !== undefined && files.length > 0;
  const pickerOpen = slashOpen || atOpen;
  const pickerItems = slashOpen ? slashItems : atItems;

  function choose(item: PickerItem) {
    // Replace the token being typed, keeping everything before it.
    const next = slashOpen
      ? `${item.label} `
      : `${text.slice(0, text.length - (atQuery?.length ?? 0) - 1)}@${item.id} `;
    setText(next);
    setDismissed(true);
    setActiveIndex(0);
    boxRef.current?.focus();
  }

  const canSend = text.trim().length > 0 && (!busy || canQueue);
  // `onStop` gates this like every other optional callback here: `running`
  // alone (no wired destination) leaves the send button exactly as it was.
  const stopControl = running && Boolean(onStop);
  // The finished-agent badge (data-badge, below) lives INSIDE this chip, so
  // gating visibility on `asyncCount` (running count) ALONE made the badge
  // structurally unreachable: the moment every task in a fan-out settles,
  // asyncCount drops back to 0 and the chip — badge and all — disappears in
  // the same tick (round-8 owner finding, live-verified: a mixed running+
  // finished window existed on the wire but the chip never painted). The
  // chip now also stays up while any async task is undismissed-finished,
  // and its own count switches from "running" to "running + undismissed
  // finished" so the number on screen always matches what the popover
  // underneath it lists.
  const finishedAsyncTasks = asyncTasks?.filter(
    (task) => task.terminal && !dismissedAsyncIds.has(task.id),
  );
  const runningAsyncCount = asyncTasks
    ? asyncTasks.filter((task) => !task.terminal).length
    : (asyncCount ?? 0);
  const finishedAsyncCount = finishedAsyncTasks?.length ?? 0;
  const hasAsync = asyncTasks
    ? runningAsyncCount > 0 || finishedAsyncCount > 0
    : asyncCount !== undefined && asyncCount > 0;
  // Falls back to the raw `asyncCount` prop when the caller has no per-task
  // detail (asyncTasks omitted) — same convention as the popover-vs-direct-
  // jump split below.
  const asyncDisplayCount = asyncTasks ? runningAsyncCount + finishedAsyncCount : asyncCount;
  const hasContext = contextPercent !== undefined;
  const hasPill = Boolean(placement) || hasAsync || hasContext;
  const placementParts = placement?.match(/^([^:]+:)(.*)$/);
  const placementHost = placementParts?.[1] ?? '';
  const placementPath = compactPath(placementParts?.[2] ?? placement ?? '');
  const normalizedModels = models.map(({ detail, ...option }) => ({
    ...option,
    label: typeof detail === 'string' ? `${detail} / ${option.label}` : option.label,
  }));
  const modelOptions =
    modelId || normalizedModels.some((option) => option.id === '')
      ? normalizedModels
      : [{ id: '', label: 'model not set' }, ...normalizedModels];
  const approvalMenuItems: MenuItemDef[] = [
    {
      id: 'ask',
      label: 'ask',
      description: 'Prompt me before every tool call',
      icon: <Icon name="ask" />,
    },
    {
      id: 'auto-edits',
      label: 'auto-edits',
      description: 'Auto-approve safe file edits; ask for the rest',
      icon: <Icon name="pencil" />,
    },
    {
      id: 'bypass',
      label: 'bypass',
      description: 'Skip permissions entirely',
      icon: <Icon name="warning" />,
    },
    {
      id: 'ai-review',
      label: 'ai-review',
      description: 'An AI reviewer approves or blocks each action',
      icon: <Icon name="eye" />,
    },
  ].map((item) => ({ ...item, checked: item.id === approvalMode }));
  const modeMenuItems: MenuItemDef[] = [
    {
      id: 'execute',
      label: 'execute',
      description: 'Act on the workspace under the permission mode',
      icon: <Icon name="play" />,
    },
    {
      id: 'plan',
      label: 'plan',
      description: 'Read-only — plan changes, never apply',
      icon: <Icon name="list" />,
    },
  ].map((item) => ({ ...item, checked: item.id === mode }));

  function submit() {
    if (!canSend) return;
    // Busy with a real queue destination: hold the message rather than
    // submitting into a turn that is already running (sendMain, prototype).
    if (busy && onQueueMessage) {
      onQueueMessage(text.trim());
      setText('');
      return;
    }
    onSubmit({ text: text.trim(), mode });
    setText('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (pickerOpen && pickerItems.length > 0) {
      // While a picker is open the arrow keys and Enter belong to IT, not to
      // the message — Enter here completes a token, it does not send.
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % pickerItems.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + pickerItems.length) % pickerItems.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const item = pickerItems[activeIndex];
        if (item) choose(item);
        return;
      }
    }
    if (pickerOpen && event.key === 'Escape') {
      event.preventDefault();
      setDismissed(true);
      return;
    }
    // Shift+Tab toggles the tall composer. Plain Tab is left alone so it can
    // still move focus — stealing it would trap keyboard users in the field.
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      setExpanded((cur) => !cur);
      return;
    }
    // Enter sends; Shift+Enter is a newline. Anything else is normal typing.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="composer">
      {hasPill ? (
        <div className="composer__pillbox">
          {placement ? (
            <span className="composer__placementchip">
              <Chip
                {...(onOpenPlacement ? { onClick: onOpenPlacement, title: 'Open files' } : {})}
              >
                {/* Static, not an activity indicator — placement is a
                    location, never pulses like a running/queued/error dot. */}
                <span className="composer__placementdot" aria-hidden="true" />
                <span
                  className="composer__placementlabel"
                  data-host={placementHost}
                  data-path={placementPath}
                >
                  {placement}
                </span>
              </Chip>
            </span>
          ) : null}
          {/* This separator gates WITH the async chip — it only exists to
              divide placement from async, so it must not render when there
              is no async chip to divide (the ctx-side separator below covers
              placement-to-ctx on its own in that case). */}
          {placement && hasAsync ? (
            <span className="composer__pillsep" aria-hidden="true" />
          ) : null}
          {hasAsync ? (
            <span
              className="composer__asyncchip"
              data-badge={finishedAsyncCount > 0 ? 'true' : undefined}
            >
              <Chip
                icon={<Icon name="zap" size={11} />}
                {...(asyncTasks
                  ? { onClick: () => setAsyncPopoverOpen((open) => !open), title: 'Open runs' }
                  : onOpenAsync
                    ? { onClick: onOpenAsync, title: 'Open runs' }
                    : {})}
              >
                {`async ${asyncDisplayCount}`}
                {finishedAsyncCount > 0 ? (
                  // The prototype's own dot (design/prototype/Clio Session.html,
                  // the `hasRecentDone` badge): a real titled element, not a CSS
                  // pseudo-element, so the count it carries is actually
                  // announced/inspectable on hover, same as the prototype's
                  // `title="1 finished async agent"`.
                  <span
                    className="composer__asyncbadge"
                    aria-hidden="true"
                    title={
                      finishedAsyncCount === 1
                        ? '1 finished async agent'
                        : `${finishedAsyncCount} finished async agents`
                    }
                  />
                ) : null}
              </Chip>
              {asyncTasks ? (
                <AsyncRunsPopover
                  open={asyncPopoverOpen}
                  tasks={asyncTasks}
                  dismissedIds={dismissedAsyncIds}
                  onDismiss={(id) =>
                    setDismissedAsyncIds((current) => new Set(current).add(id))
                  }
                  {...(onOpenAsync ? { onOpenHistory: onOpenAsync } : {})}
                  onClose={() => setAsyncPopoverOpen(false)}
                />
              ) : null}
            </span>
          ) : null}
          {/* The ctx-side separator is unconditional on `hasContext` alone —
              it must still render when async is absent/zero (the common
              single-session case), not only when both chips are present. */}
          {placement && hasContext ? (
            <span className="composer__pillsep" aria-hidden="true" />
          ) : null}
          {hasContext ? (
            <span className="composer__contextchip">
              {/* No dot: the prototype's ctx chip is bare muted text; the amber
                  activity dot rides the ASYNC chip (finished-agent badge). */}
              <Chip
                {...(onOpenContext ? { onClick: onOpenContext, title: 'Open context telemetry' } : {})}
              >
                <span className="composer__contextlabel" data-percent={`${contextPercent}%`}>
                  {contextPercent !== undefined && contextPercent > 0 && contextPercent < 1
                    ? 'ctx <1%'
                    : `ctx ${Math.round(contextPercent ?? 0)}%`}
                </span>
              </Chip>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Queued-messages tray docks directly BELOW the pill row (prototype
          DOM order: context strip, then the queue tray, then the input
          frame — verified live against the ground truth: the pill's own
          bottom-left corner is already square to meet this tray's square
          top-left corner, see composer.css). */}
      {queue.length > 0 ? (
        <div className="composer__queue" data-testid="composer-queue">
          <div className="composer__queuehead">
            <span className="composer__queuelabel">
              {queue.length === 1 ? '1 message queued' : `${queue.length} messages queued`}
            </span>
            {/* The header hint (mainQHint) and each row's own hint (baseHint,
                below) are two DIFFERENT prototype strings, not one reused —
                "main is mid-step" only ever appears here. */}
            <span className="composer__queuehint">main is mid-step · delivered at the next step boundary</span>
            <span className="composer__spacer" />
            {onDeliverQueuedNow ? (
              <button
                type="button"
                className="composer__queuedeliver"
                title="Interrupt the current step and deliver immediately"
                onClick={onDeliverQueuedNow}
              >
                interrupt and deliver
              </button>
            ) : null}
          </div>
          {queue.map((item, index) => {
            const editing = queueEdit?.id === item.id;
            return (
              <div className="composer__queuerow" key={item.id}>
                <span className="composer__queuenum">{`#${index + 1}`}</span>
                <div className="composer__queuebody">
                  {editing ? (
                    <input
                      className="composer__queueinput"
                      aria-label={`Edit queued message ${index + 1}`}
                      value={queueEdit.text}
                      autoFocus
                      onChange={(e) => setQueueEdit({ id: item.id, text: e.currentTarget.value })}
                      onBlur={() => {
                        const next = queueEdit.text.trim();
                        setQueueEdit(null);
                        if (next && next !== item.text) onEditQueuedMessage?.(item.id, next);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setQueueEdit(null);
                        }
                      }}
                    />
                  ) : (
                    <span className="composer__queuetext">{item.text}</span>
                  )}
                  <span className="composer__queuerowhint">
                    {index === 0 ? 'delivers at the next step boundary' : `after message #${index}`}
                  </span>
                </div>
                <span className="composer__queueactions">
                  <button
                    type="button"
                    aria-label="Move earlier in the queue"
                    title="Move earlier in the queue"
                    disabled={index === 0}
                    onClick={() => onReorderQueuedMessage?.(item.id, 'up')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move later in the queue"
                    title="Move later in the queue"
                    disabled={index === queue.length - 1}
                    onClick={() => onReorderQueuedMessage?.(item.id, 'down')}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Edit in place"
                    title="Edit in place"
                    onClick={() => setQueueEdit({ id: item.id, text: item.text })}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label="Remove from queue"
                    title="Remove from queue"
                    onClick={() => {
                      if (editing) setQueueEdit(null);
                      onRemoveQueuedMessage?.(item.id);
                    }}
                  >
                    ✕
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        className="composer__frame"
        data-testid="composer-frame"
        data-expanded={expanded ? 'true' : undefined}
        data-queued={queue.length > 0 ? 'true' : undefined}
        data-picker-open={pickerOpen ? 'true' : undefined}
        data-pill={hasPill ? 'true' : undefined}
      >
        <Picker
          open={pickerOpen}
          kind={slashOpen ? 'command' : 'file'}
          label={slashOpen ? 'Commands' : 'Files'}
          items={pickerItems}
          activeIndex={activeIndex}
          onSelect={choose}
          onClose={() => setDismissed(true)}
        />
        <textarea
          ref={boxRef}
          className="composer__input"
          rows={1}
          value={text}
          placeholder={placeholder}
          disabled={busy && !canQueue}
          aria-label="Message"
          onChange={(e) => {
            setText(e.currentTarget.value);
            setDismissed(false);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
        />

        <div className="composer__controls">
          {/* clio-agent serves no upload endpoint, so this is shown and
              flagged rather than hidden — a missing control reads as a
              feature we forgot, a flagged one as a gap we know about. */}
          <button
            type="button"
            className="composer__attach"
            title="Attach"
            aria-label="Attach"
            data-unbacked="true"
            disabled
          >
            <Icon name="plus" size={13} />
          </button>

          {/* Always visible, even pre-session — the prototype shows "ask"
              alongside "execute" from the first paint. The DROPDOWN (the real
              ask/auto-edits/bypass/ai-review picker) is the part gated on a
              real session: there is nothing to pick from before one exists. */}
          <span className="composer__approval">
            <button
              type="button"
              className="composer__quiet"
              data-testid="composer-approval"
              aria-label={approvalMode ?? 'ask'}
              aria-haspopup="menu"
              aria-expanded={approvalMenuOpen}
              aria-pressed={approvalMenuOpen}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                // Approval mode and turn mode (execute/plan) are independent
                // wire axes — this control only ever opens ITS OWN menu. It
                // used to also force `setMode('ask')` on every click, which
                // silently flipped a user's real execute/plan choice back to
                // 'ask' as a side effect of merely checking permissions.
                if (approvalMode && onApprovalModeChange) {
                  setApprovalMenuOpen((open) => !open);
                }
              }}
            >
              <Icon name="ask" />
              <span>{approvalMode ?? 'ask'}</span>
            </button>
            {approvalMode && onApprovalModeChange ? (
              <ContextMenu
                open={approvalMenuOpen}
                x={0}
                y={-220}
                items={approvalMenuItems}
                label="Approval modes"
                eyebrow="Permissions"
                onSelect={(id) => onApprovalModeChange(id as ApprovalMode)}
                onClose={() => setApprovalMenuOpen(false)}
              />
            ) : null}
          </span>

          <span className="composer__mode">
            <button
              type="button"
              className="composer__quiet"
              aria-label={mode === 'plan' ? 'Plan' : 'Execute'}
              aria-haspopup="menu"
              aria-expanded={modeMenuOpen}
              aria-pressed={mode === 'execute' || mode === 'plan'}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                if (mode === 'ask') setMode('execute');
                setModeMenuOpen((open) => !open);
              }}
            >
              <Icon name={mode === 'plan' ? 'list' : 'play'} />
              <span>{mode === 'plan' ? 'plan' : 'execute'}</span>
            </button>
            <ContextMenu
              open={modeMenuOpen}
              x={0}
              y={-154}
              items={modeMenuItems}
              label="Turn mode"
              eyebrow="mode"
              onSelect={(id) => setMode(id as ComposerMode)}
              onClose={() => setModeMenuOpen(false)}
            />
          </span>

          <span className="composer__spacer" />

          <span className="composer__model" data-testid="composer-model">
            <Icon name="sparkle" />
            <ProviderModelPicker
              value={modelId}
              options={modelOptions}
              {...(modelProviders ? { providers: modelProviders } : {})}
              {...(thinkingLevel ? { thinkingLevel } : {})}
              {...(onOpenProviderSettings ? { onOpenProviderSettings } : {})}
              {...(modelUnresolved ? { emptyLabel: '—' } : {})}
              onChange={onModelChange}
            />
          </span>

          <button
            type="button"
            className={
              stopControl ? 'composer__send composer__send--stop' : 'composer__send'
            }
            aria-label={
              stopControl
                ? 'Stop the run'
                : canQueue
                  ? 'Queue for the next step boundary'
                  : 'Send message'
            }
            title={stopControl ? undefined : canQueue ? 'Queue for the next step boundary' : undefined}
            disabled={stopControl ? false : !canSend}
            onClick={stopControl ? onStop : submit}
          >
            <Icon name={stopControl ? 'stop' : 'arrow-up'} size={13} />
          </button>
        </div>
      </div>

      {busy ? (
        <p className="composer__busy" data-testid="composer-busy" role="status">
          {busyReason ?? 'busy'}
        </p>
      ) : null}

      {footer}
    </div>
  );
}
