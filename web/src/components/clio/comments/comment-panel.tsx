import type { CommentMode } from '@clio/core/v3';
import { GripVerticalIcon, SendIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CloseIcon, DeleteIcon } from '@/lib/icon-vocabulary';
import { MODE_LABELS } from './comment-model';
import type { CommentSessionValue } from './comment-session';

const HINTS: Record<CommentMode, string> = {
  text: 'Select text to mark it.',
  region: 'Drag over the view to mark a region.',
  element: 'Click an element to pick it.',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The one comment panel (comments plan rule 2; addendum A section 1): the mode the next
 * mark uses, every mark with its label and comment, "Send to agent" on an artifact, and the
 * control that sends the marks together. Movable, and narrow enough for a phone.
 */
export function CommentPanel({ session }: { session: CommentSessionValue }) {
  const { surface, marks, mode } = session;
  const artifact = surface.destination.kind === 'artifact';
  const [position, setPosition] = useState<{ x: number; y: number }>();
  const drag = useRef<{ x: number; y: number; left: number; top: number }>(undefined);
  const count = marks.length;
  const sendLabel = artifact
    ? `Send ${count} ${count === 1 ? 'comment' : 'comments'}`
    : `Add ${count} ${count === 1 ? 'mark' : 'marks'} to message`;
  return createPortal(
    <section
      aria-label={`Comments on ${surface.title}`}
      className="fixed z-50 flex max-h-[min(36rem,70dvh)] w-[min(22rem,calc(100vw-1rem))] flex-col rounded-lg border bg-popover text-popover-foreground shadow-xl"
      data-capture-ui="true"
      data-slot="comment-panel"
      style={
        position
          ? { left: position.x, top: position.y }
          : { right: 'max(0.5rem, env(safe-area-inset-right))', bottom: '0.5rem' }
      }
    >
      <header className="flex items-center gap-1 border-b p-2">
        <button
          aria-label="Move comment panel"
          className="cursor-move touch-none rounded p-1 text-muted-foreground hover:bg-muted"
          onPointerDown={(event) => {
            const box = event.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
            drag.current = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            setPosition({
              x: clamp(drag.current.left + event.clientX - drag.current.x, 0, window.innerWidth - 120),
              y: clamp(drag.current.top + event.clientY - drag.current.y, 0, window.innerHeight - 60),
            });
          }}
          onPointerUp={() => {
            drag.current = undefined;
          }}
          type="button"
        >
          <GripVerticalIcon aria-hidden="true" className="size-4" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Comments on {surface.title}</h2>
        <Button aria-label="Close comments" onClick={session.stop} size="icon-sm" variant="ghost">
          <CloseIcon aria-hidden="true" className="size-4" />
        </Button>
      </header>
      <div className="flex items-center gap-2 border-b p-2 text-xs">
        {surface.modes.length > 1 ? (
          <>
            <span className="text-muted-foreground">Next mark</span>
            <Select value={mode} onValueChange={(value) => session.setMode(value as CommentMode)}>
              <SelectTrigger aria-label="Comment mode" className="h-7 w-32" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {surface.modes.map((option) => (
                  <SelectItem key={option} value={option}>
                    {MODE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}
        <span className="text-muted-foreground">{HINTS[mode]}</span>
      </div>
      <ol aria-label="Marks" className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {marks.length === 0 ? (
          <li className="text-xs text-muted-foreground">No marks yet. {HINTS[mode]}</li>
        ) : null}
        {marks.map((mark) => (
          <li className="rounded-md border p-2" key={mark.label}>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
                {mark.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={mark.preview}>
                {mark.preview}
              </span>
              <Button
                aria-label={`Delete ${mark.label}`}
                onClick={() => session.removeMark(mark.label)}
                size="icon-sm"
                variant="ghost"
              >
                <DeleteIcon aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <textarea
              aria-label={`Comment for ${mark.label}`}
              autoFocus={session.editing === mark.label}
              className="min-h-16 w-full resize-y rounded-md border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onChange={(event) => session.updateMark(mark.label, { comment: event.target.value })}
              onFocus={() => session.setEditing(mark.label)}
              placeholder="What should the agent notice here?"
              value={mark.comment}
            />
            {artifact ? (
              <label className="mt-1 flex items-center gap-2 text-xs">
                <Checkbox
                  checked={mark.sendToAgent}
                  onCheckedChange={(checked) =>
                    session.updateMark(mark.label, { sendToAgent: checked === true })
                  }
                />
                Send to agent
              </label>
            ) : null}
          </li>
        ))}
      </ol>
      <footer className="space-y-2 border-t p-2">
        {session.error ? (
          <p className="text-xs text-destructive" role="alert">
            {session.error}
          </p>
        ) : null}
        <Button
          className="w-full"
          disabled={!count || session.sending}
          onClick={() => void session.send()}
          size="sm"
        >
          <SendIcon aria-hidden="true" className="size-3.5" />
          {session.sending ? 'Sending…' : sendLabel}
        </Button>
      </footer>
    </section>,
    document.body,
  );
}
