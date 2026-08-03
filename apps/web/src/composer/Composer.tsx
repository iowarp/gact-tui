import { useRef, useState, type KeyboardEvent } from 'react';
import { Chip, Select, Tabs, type SelectOption } from '../kit';
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
  onModelChange,
  onSubmit,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ComposerMode>('ask');
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const canSend = !busy && text.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSubmit({ text: text.trim(), mode });
    setText('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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

      <div className="composer__frame">
        <textarea
          ref={boxRef}
          className="composer__input"
          rows={1}
          value={text}
          placeholder={placeholder}
          disabled={busy}
          aria-label="Message"
          onChange={(e) => setText(e.currentTarget.value)}
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
