import type { CommentMode } from '@clio/core/v3';
import { GripVerticalIcon, ListIcon, SendIcon } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { MODE_LABELS } from './comment-model';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** One mark as the controls list it: its label and comment. */
export interface ControlsMark {
  label: string;
  comment: string;
  /** Shown under the mark, such as an anchor the surface could not find again. */
  note?: string;
}

/**
 * The comment controls every surface shares, first built for A2UI region capture: a small
 * floating bar the person can move, with Select (marking on or off), the list of marks made
 * so far, Close, an optional Add region, the send control and any extra action (the
 * attention set). Each mark opens its editor from the list or from its box on the surface.
 */
export function CommentControls({
  title,
  selecting,
  onToggleSelect,
  modes = [],
  mode,
  onMode,
  hint,
  marks,
  onOpenMark,
  onAddRegion,
  addRegionDisabled,
  sendLabel,
  onSend,
  sendDisabled,
  busy,
  busyLabel = 'Capturing…',
  onClose,
  error,
  initialPosition,
  children,
}: {
  title: string;
  selecting: boolean;
  onToggleSelect: () => void;
  /** The modes the surface offers; a choice of mode shows when there is more than one. */
  modes?: readonly CommentMode[];
  mode?: CommentMode;
  onMode?: (mode: CommentMode) => void;
  /** What to do to make a mark, shown when the list is empty. */
  hint: string;
  marks: readonly ControlsMark[];
  onOpenMark: (label: string) => void;
  onAddRegion?: () => void;
  addRegionDisabled?: boolean;
  /** Omitted when the marks cannot be sent from here (the attention set only). */
  sendLabel?: string;
  onSend?: () => void;
  sendDisabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  onClose: () => void;
  error?: string;
  initialPosition?: { x: number; y: number };
  children?: ReactNode;
}) {
  const [listOpen, setListOpen] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | undefined>(undefined);
  const placed = position ?? {
    x: Math.max(8, window.innerWidth - 272),
    y: Math.max(8, window.innerHeight - 220),
  };
  return (
    <div
      aria-label={`Comments on ${title}`}
      className="fixed z-[90] w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
      data-capture-ui="true"
      data-slot="comment-controls"
      role="group"
      style={{ left: placed.x, top: placed.y }}
    >
      <div className="flex items-center gap-1">
        <button
          aria-label="Move capture controls"
          className="cursor-move touch-none rounded p-1 text-muted-foreground hover:bg-muted"
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, left: placed.x, top: placed.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current)
              setPosition({
                x: clamp(
                  drag.current.left + event.clientX - drag.current.x,
                  0,
                  window.innerWidth - 250,
                ),
                y: clamp(
                  drag.current.top + event.clientY - drag.current.y,
                  0,
                  window.innerHeight - 60,
                ),
              });
          }}
          onPointerUp={() => {
            drag.current = undefined;
          }}
          type="button"
        >
          <GripVerticalIcon aria-hidden="true" className="size-4" />
        </button>
        <Button
          aria-pressed={selecting}
          onClick={() => {
            window.getSelection()?.removeAllRanges();
            onToggleSelect();
          }}
          size="sm"
          variant={selecting ? 'secondary' : 'ghost'}
        >
          Select
        </Button>
        <Button
          aria-expanded={listOpen}
          aria-label="Selections list"
          onClick={() => setListOpen((open) => !open)}
          size="icon-sm"
          variant="ghost"
        >
          <ListIcon aria-hidden="true" className="size-4" />
        </Button>
        {marks.length ? (
          <span className="text-xs tabular-nums text-muted-foreground">{marks.length}</span>
        ) : null}
        <Button
          aria-label="Close capture"
          className="ml-auto"
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <CloseIcon aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {modes.length > 1 && mode && onMode ? (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Mark</span>
          <Select value={mode} onValueChange={(value) => onMode(value as CommentMode)}>
            <SelectTrigger aria-label="Comment mode" className="h-7 flex-1" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[95]">
              {modes.map((option) => (
                <SelectItem key={option} value={option}>
                  {MODE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {onAddRegion ? (
        <Button
          className="mt-2 w-full"
          disabled={busy || addRegionDisabled}
          onClick={onAddRegion}
          size="sm"
          variant="outline"
        >
          Add region
        </Button>
      ) : null}
      {listOpen || !marks.length ? (
        <div className="mt-2 max-h-44 space-y-1 overflow-auto border-t pt-2 text-xs">
          {marks.length ? (
            marks.map((mark) => (
              <button
                className="block w-full truncate rounded p-1 text-left hover:bg-muted"
                key={mark.label}
                onClick={() => onOpenMark(mark.label)}
                type="button"
              >
                {mark.label}: {mark.comment || 'Add a comment'}
                {mark.note ? (
                  <span className="block truncate text-muted-foreground" data-slot="mark-note">
                    {mark.note}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="text-muted-foreground">{hint}</p>
          )}
        </div>
      ) : null}
      {marks.length && sendLabel && onSend ? (
        <Button
          className="mt-2 w-full"
          disabled={busy || sendDisabled}
          onClick={onSend}
          size="sm"
          type="button"
        >
          <SendIcon aria-hidden="true" className="size-3.5" />
          {busy ? busyLabel : sendLabel}
        </Button>
      ) : null}
      {children}
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
