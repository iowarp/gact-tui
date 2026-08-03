import { useRef, useState, type KeyboardEvent } from 'react';
import { Chip, Select, Tabs, type SelectOption } from '../kit';
import { Picker, type PickerItem } from './Picker';
import './composer.css';

export type ComposerMode = 'ask' | 'execute';

export interface ComposerSubmission {
  text: string;
  mode: ComposerMode;
}

export interface ComposerProps {
  /** Where the turn will run — the prototype's host chip. */
  placement?: string;
  asyncCount?: number;
  contextPercent?: number;
  models: SelectOption[];
  modelId: string;
  /** Blocks input; `busyReason` is then REQUIRED to be shown. */
  busy?: boolean;
  busyReason?: string;
  placeholder?: string;
  /** Slash commands, from client.commands(). Empty disables the `/` picker. */
  commands?: PickerItem[];
  /** Workspace files, from client.workspaceFiles(). Empty disables `@`. */
  files?: PickerItem[];
  onModelChange: (id: string) => void;
  onSubmit: (submission: ComposerSubmission) => void;
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
  models,
  modelId,
  busy = false,
  busyReason,
  placeholder = 'Message clio (@ to reference, / for commands)',
  commands = [],
  files = [],
  onModelChange,
  onSubmit,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ComposerMode>('ask');
  const [dismissed, setDismissed] = useState(false);
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
    // Enter sends; Shift+Enter is a newline. Anything else is normal typing.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="composer">
      <div className="composer__chips">
        {placement ? <Chip tone="accent">{placement}</Chip> : null}
        {asyncCount ? <Chip tone="accent">{`async ${asyncCount}`}</Chip> : null}
        {contextPercent === undefined ? null : <Chip>{`ctx ${contextPercent}%`}</Chip>}
      </div>

      <div
        className="composer__frame"
        data-queued={asyncCount ? 'true' : undefined}
        data-picker-open={pickerOpen ? 'true' : undefined}
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
          <Tabs
            label="Turn mode"
            activeId={mode}
            onChange={(id) => setMode(id as ComposerMode)}
            tabs={[
              { id: 'ask', label: 'ask' },
              { id: 'execute', label: 'execute' },
            ]}
          />

          <span className="composer__spacer" />

          <Select
            label="Model"
            value={modelId}
            options={models}
            placement="up"
            onChange={onModelChange}
          />

          <button
            type="button"
            className="composer__send"
            aria-label="Send message"
            disabled={!canSend}
            onClick={submit}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 11.5v-9M3.5 6L7 2.5 10.5 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {busy ? (
        <p className="composer__busy" data-testid="composer-busy" role="status">
          {busyReason ?? 'busy'}
        </p>
      ) : null}
    </div>
  );
}
