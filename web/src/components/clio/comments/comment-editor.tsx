import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DeleteIcon } from '@/lib/icon-vocabulary';
import { RegionCoordinateInputs } from '../region-coordinate-inputs';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Where a mark sits on screen, in client pixels. */
export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * The editor beside one mark, first built for A2UI region capture: the mark's label and the
 * surface it is on, its box as numbers (a region), what it points at (a quote, an element),
 * the comment, and Delete, Cancel and Done. Every comment goes to the agent when the marks
 * are sent. Enter finishes, Escape cancels. It opens just below the mark, kept on screen.
 */
/** Whether the heading's title only repeats the quote shown under it. */
function repeats(title: string, detail?: string): boolean {
  if (!detail) return false;
  const plain = (text: string) => text.replace(/[“”"…]/g, '').trim().toLowerCase();
  const head = plain(title);
  return Boolean(head) && plain(detail).startsWith(head);
}

export function CommentEditor({
  label,
  title,
  near,
  detail,
  coordinates,
  comment,
  onDone,
  onCancel,
  onDelete,
}: {
  label: string;
  title: string;
  near?: ScreenBox;
  /** What the mark points at, for marks without a box to edit (a quote, an element). */
  detail?: string;
  coordinates?: { box: Box; onChange: (box: Box) => void };
  comment: string;
  onDone: (comment: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(comment);
  const left = near ? near.left + near.width - 260 : window.innerWidth - 432;
  const top = near ? near.top + near.height + 12 : window.innerHeight - 560;
  return (
    <div
      aria-label={`Comment on ${label}`}
      className="fixed z-[90] max-h-[calc(100dvh-1rem)] w-[min(26rem,calc(100vw-1rem))] overflow-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl"
      data-capture-ui="true"
      data-slot="comment-editor"
      role="dialog"
      style={{
        left: clamp(left, 8, Math.max(8, window.innerWidth - 424)),
        top: clamp(top, 8, Math.max(8, window.innerHeight - 340)),
      }}
    >
      <p className="mb-2 text-sm font-semibold">
        {label}
        {repeats(title, detail) ? null : ` — ${title}`}
      </p>
      {detail ? (
        <p className="mb-2 line-clamp-3 text-xs text-muted-foreground" title={detail}>
          {detail}
        </p>
      ) : null}
      {coordinates ? (
        <RegionCoordinateInputs box={coordinates.box} onChange={coordinates.onChange} />
      ) : null}
      <textarea
        aria-label={`Comment for ${label}`}
        autoFocus
        className="min-h-28 w-full resize-y rounded-md border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
          else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onDone(text.trim());
          }
        }}
        placeholder="What should the agent notice here?"
        value={text}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          aria-label={`Delete ${label}`}
          className="mr-auto"
          onClick={onDelete}
          size="icon-sm"
          variant="ghost"
        >
          <DeleteIcon aria-hidden="true" className="size-4" />
        </Button>
        <Button onClick={onCancel} size="sm" variant="ghost">
          Cancel
        </Button>
        <Button onClick={() => onDone(text.trim())} size="sm">
          <CheckIcon aria-hidden="true" className="size-4" />
          Done
        </Button>
      </div>
    </div>
  );
}
