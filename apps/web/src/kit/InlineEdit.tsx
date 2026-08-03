import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import './inlineedit.css';

export type InlineEditSize = 'title' | 'rail';

export interface InlineEditProps {
  value: string;
  /** Names the field for assistive tech, e.g. "Session title". */
  label: string;
  /** `title` is the topbar's 14px/600; `rail` the row's 11.5px/500. */
  size?: InlineEditSize;
  /** Open straight into edit mode — used when an explicit Rename action
   *  opened this field, where a second click would be a dead step. */
  startEditing?: boolean;
  /** Called when editing ends without committing, so the owner can drop its
   *  "currently renaming" state instead of leaving the row stuck. */
  onCancel?: () => void;
  onCommit: (next: string) => void;
}

/**
 * Rename in place.
 *
 * The prototype renames in two surfaces — the topbar title and each rail row —
 * with identical behaviour and different metrics. Both edit fields deliberately
 * mirror the metrics of the text they replace (`--t-sf2` fill, `--t-cy4`
 * border), so the field appears WHERE the label was without the row shifting.
 */
export function InlineEdit({
  value,
  label,
  size = 'title',
  startEditing = false,
  onCancel,
  onCommit,
}: InlineEditProps) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards the blur handler so Escape does not commit on its way out.
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    // An empty name would leave an unreadable row, and an unchanged one would
    // cost a round trip and a wire event for nothing.
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    onCommit(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelled.current = true;
      setDraft(value);
      setEditing(false);
      onCancel?.();
    }
  }

  if (editing) {
    return (
      <span className="kit-inlineedit" data-size={size} data-editing="true">
        <input
          ref={inputRef}
          className="kit-inlineedit__input"
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Clicking away accepts, which is how editing behaves elsewhere in
            // the app — but Escape must not commit on its way out.
            if (cancelled.current) {
              cancelled.current = false;
              return;
            }
            commit();
          }}
        />
      </span>
    );
  }

  return (
    <span className="kit-inlineedit" data-size={size}>
      <span
        className="kit-inlineedit__value"
        role="button"
        tabIndex={0}
        aria-label={`Rename ${label}`}
        title="Click to rename"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {value}
      </span>
    </span>
  );
}
