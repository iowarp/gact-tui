import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { brand } from '@brand';
import { Chip, ContextMenu, Icon, Select, type MenuItemDef, type SelectOption } from '../kit';
import { Picker, type PickerItem } from './Picker';
import './composer.css';

export type ComposerMode = 'ask' | 'execute';

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

export interface ComposerProps {
  /** Where the turn will run — the prototype's host chip. */
  placement?: string;
  asyncCount?: number;
  contextPercent?: number;
  models?: SelectOption[];
  modelId?: string;
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
  /**
   * Rendered inside the composer block, below the frame — the prototype puts
   * its version stamp here, within the same 860px column. A sibling AFTER the
   * composer would push the whole block off the viewport floor.
   */
  footer?: ReactNode;
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
  approvalMode,
  onApprovalModeChange,
  busy = false,
  busyReason,
  placeholder = `Message ${brand.name.toLowerCase()} (@ to reference, / for commands)`,
  commands = [],
  files = [],
  onModelChange = () => {},
  onSubmit,
  footer,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ComposerMode>('ask');
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [approvalMenuOpen, setApprovalMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLTextAreaElement>(null);

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
  const placementPath = placementParts?.[2] ?? placement ?? '';
  const normalizedModels = models.map(({ detail, ...option }) => ({
    ...option,
    label: typeof detail === 'string' ? `${detail} / ${option.label}` : option.label,
  }));
  const modelOptions =
    modelId || normalizedModels.some((option) => option.id === '')
      ? normalizedModels
      : [{ id: '', label: 'model not set' }, ...normalizedModels];
  const approvalMenuItems: MenuItemDef[] = APPROVAL_MODES.map((approval) => ({
    id: approval,
    label: approval,
  }));

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
        <div className="composer__chips">
          {placement ? (
            <span className="composer__placementchip">
              <Chip>
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
          {placement && (hasAsync || hasContext) ? (
            <span className="composer__pillsep" aria-hidden="true" />
          ) : null}
          {hasAsync ? (
            <span className="composer__asyncchip">
              <Chip icon={<Icon name="zap" size={11} />}>{`async ${asyncCount}`}</Chip>
            </span>
          ) : null}
          {hasAsync && hasContext ? (
            <span className="composer__pillsep" aria-hidden="true" />
          ) : null}
          {hasContext ? (
            <span className="composer__contextchip">
              <Chip icon={<span className="composer__contextdot" aria-hidden="true" />}>
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

          {approvalMode && onApprovalModeChange ? (
            <span className="composer__approval">
              <button
                type="button"
                className="composer__quiet"
                data-testid="composer-approval"
                aria-label={approvalMode}
                aria-haspopup="menu"
                aria-expanded={approvalMenuOpen}
                aria-pressed={mode === 'ask'}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setMode('ask');
                  setApprovalMenuOpen((open) => !open);
                }}
              >
                <Icon name="ask" />
                <span>{approvalMode}</span>
              </button>
              <ContextMenu
                open={approvalMenuOpen}
                x={0}
                y={-128}
                items={approvalMenuItems}
                label="Approval modes"
                onSelect={(id) => onApprovalModeChange(id as ApprovalMode)}
                onClose={() => setApprovalMenuOpen(false)}
              />
            </span>
          ) : null}

          <button
            type="button"
            className="composer__quiet"
            aria-label="Execute"
            aria-pressed={mode === 'execute'}
            onClick={() => setMode('execute')}
          >
            <Icon name="play" />
            <span>execute</span>
          </button>

          <span className="composer__spacer" />

          <span className="composer__model" data-testid="composer-model">
            <Icon name="sparkle" />
            <Select
              label="Model"
              value={modelId}
              options={modelOptions}
              placement="up"
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
