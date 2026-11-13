import type { CommentAttachment } from '@clio/core/v3';
import { BoxIcon, CameraIcon, ChartLineIcon, QuoteIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RemoveIcon } from '@/lib/icon-vocabulary';
import { anchorPreview } from './comments/comment-model';

const ICONS = {
  'agent-answer': QuoteIcon,
  'a2ui-surface': ChartLineIcon,
  'browser-page': CameraIcon,
  'mcp-app': BoxIcon,
} as const;

const KIND_LABELS = {
  'agent-answer': 'Comment on an answer',
  'a2ui-surface': 'Comment on a view',
  'browser-page': 'Comment on a page',
  'mcp-app': 'Comment on an app view',
} as const;

/**
 * The comment sessions attached to the next message, as cards above the input: each mark's
 * label and what it points at, with its comment editable before sending. They travel as
 * `comment_session` parts, so the agent reads labelled entries rather than pasted quotes.
 */
export function ClioComposerAnnotations({
  annotations,
  onChange,
}: {
  annotations: readonly CommentAttachment[];
  onChange: (annotations: readonly CommentAttachment[]) => void;
}) {
  if (!annotations.length) return null;
  const replace = (index: number, next?: CommentAttachment) =>
    onChange(annotations.flatMap((session, at) => (at !== index ? [session] : next ? [next] : [])));
  return (
    <ol aria-label="Attached comments" className="grid w-full basis-full gap-1.5 px-2.5 pt-2">
      {annotations.map((session, index) => {
        const Icon = ICONS[session.kind];
        return (
          <li
            className="min-w-0 rounded-lg border bg-muted/40 px-3 py-2"
            data-slot="attached-comment-session"
            key={`${session.kind}:${session.title ?? ''}:${index}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
              <p className="min-w-0 flex-1 truncate text-[0.6875rem] font-medium text-muted-foreground">
                {KIND_LABELS[session.kind]}
                {session.title ? `: ${session.title}` : ''}
              </p>
              <Button
                aria-label={`Remove ${KIND_LABELS[session.kind].toLowerCase()}`}
                onClick={() => replace(index)}
                size="icon-xs"
                variant="ghost"
              >
                <RemoveIcon aria-hidden="true" />
              </Button>
            </div>
            <ul className="mt-1 space-y-1">
              {session.marks.map((mark) => (
                <li className="flex min-w-0 items-center gap-2" key={mark.label}>
                  <span className="rounded bg-primary px-1 text-[0.625rem] font-bold text-primary-foreground">
                    {mark.label}
                  </span>
                  <span
                    className="line-clamp-1 min-w-0 shrink text-xs"
                    title={anchorPreview(mark.anchor)}
                  >
                    {anchorPreview(mark.anchor)}
                  </span>
                  <input
                    aria-label={`Comment for ${mark.label}`}
                    className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 text-xs"
                    onChange={(event) =>
                      replace(index, {
                        ...session,
                        marks: session.marks.map((item) =>
                          item.label === mark.label
                            ? { ...item, comment: event.target.value }
                            : item,
                        ),
                      })
                    }
                    placeholder="Comment (optional)"
                    value={mark.comment}
                  />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
