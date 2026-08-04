import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { brand } from '@brand';
import {
  Chip,
  ContextMenu,
  Icon,
  StatusDot,
  type MenuItemDef,
  type SelectOption,
} from '../kit';
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
  contextPercent?: number;
  models?: SelectOption[];
  modelId?: string;
  /** Live provider catalogue for the prototype's two-pane model picker. */
  modelProviders?: ProviderModelGroup[];
  thinkingLevel?: string;
  /** Real session execution axis: backend edit is labelled execute in the UI. */
  sessionMode?: 'execute' | 'plan';
  /** Blocks input; `busyReason` is then REQUIRED to be shown. */
  busy?: boolean;
  busyReason?: string;
  placeholder?: string;
  /** Slash commands, from client.commands(). Empty disables the `/` picker. */
  commands?: PickerItem[];
  /** Workspace files, from client.workspaceFiles(). Empty disables `@`. */
  files?: PickerItem[];
  onModelChange?: (id: string) => void;
  /** Current approval mode; omit when no session is open to carry one. */
  approvalMode?: ApprovalMode;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
  onSubmit: (submission: ComposerSubmission) => void;
  /** Pill chip click-throughs — the prototype's async chip opens the runs
      view, ctx opens telemetry. Omitted = the chip renders as text. */
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
  contextPercent,
  models = [],
  modelId = '',
  modelProviders,
  thinkingLevel,
  sessionMode,
  approvalMode,
  onApprovalModeChange,
  busy = false,
  busyReason,
  placeholder = `Message ${brand.name.toLowerCase()} (@ to reference, / for commands)`,
  commands = [],
  files = [],
  onModelChange = () => {},
  onSubmit,
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
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLTextAreaElement>(null);

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

  const canSend = !busy && text.trim().length > 0;
  const hasAsync = asyncCount !== undefined && asyncCount > 0;
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
              <Chip>
                {/* Static like the prototype's pill dot — placement is a
                    location, not activity; the pulse belongs to real states. */}
                <StatusDot status="running" quiet />
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
          {placement && (hasAsync || hasContext) ? (
            <span className="composer__pillsep" aria-hidden="true" />
          ) : null}
          {hasAsync ? (
            <span className="composer__asyncchip">
              <Chip
                icon={<Icon name="zap" size={11} />}
                {...(onOpenAsync ? { onClick: onOpenAsync, title: 'Open runs' } : {})}
              >{`async ${asyncCount}`}</Chip>
            </span>
          ) : null}
          {hasAsync && hasContext ? (
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
                  {`ctx ${contextPercent}%`}
                </span>
              </Chip>
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className="composer__frame"
        data-testid="composer-frame"
        data-expanded={expanded ? 'true' : undefined}
        data-queued={asyncCount ? 'true' : undefined}
        data-picker-open={pickerOpen ? 'true' : undefined}
        data-pill={hasPill ? 'true' : undefined}
      >
        <Picker
          open={pickerOpen}
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
          disabled={busy}
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
                setMode('ask');
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
              onChange={onModelChange}
            />
          </span>

          <button
            type="button"
            className="composer__send"
            aria-label="Send message"
            disabled={!canSend}
            onClick={submit}
          >
            <Icon name="arrow-up" size={13} />
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
