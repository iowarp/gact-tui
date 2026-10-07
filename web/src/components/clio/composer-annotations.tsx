import { CameraIcon, ChartLineIcon, ChevronDownIcon, QuoteIcon } from 'lucide-react';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { RemoveIcon } from '@/lib/icon-vocabulary';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

/**
 * The card's icon, heading label, removal name, one-line plain-text preview,
 * and (data-zone-quote only) the full markdown block an expand popover can
 * render properly — one branch per annotation kind.
 *
 * A `data-zone-quote`'s `preview` is `summary`, never `markdown`: the full
 * reference block is markdown (bold, a pipe table, a fenced JSON block) meant
 * for the SENT message's blockquote, and showing it flattened into a single
 * line ahead of sending reads as raw syntax, not a summary (a coordinator
 * review caught exactly this — see git history for the before/after).
 */
function annotationCard(
  annotation: ComposerAnnotation,
  numbered: boolean,
  index: number,
): {
  icon: typeof QuoteIcon;
  label: string;
  removeName: string;
  preview: string;
  markdown?: string;
} {
  if (annotation.kind === 'data-zone-quote') {
    return {
      icon: ChartLineIcon,
      label: annotation.title,
      markdown: annotation.markdown,
      preview: annotation.summary,
      removeName: annotation.title,
    };
  }
  if (annotation.kind === 'region-capture') {
    return {
      icon: CameraIcon,
      label: annotation.title,
      markdown: annotation.markdown,
      preview: annotation.summary,
      removeName: annotation.title,
    };
  }
  return {
    icon: QuoteIcon,
    label: numbered ? `Selected text ${index + 1}` : 'Selected text',
    preview: annotation.text,
    removeName: 'selected text',
  };
}

/**
 * The selections attached to the next message, as boxed cards above the input.
 * Each is sent as a quote ahead of what the person writes, and can be removed
 * before sending.
 */
export function ClioComposerAnnotations({
  annotations,
  onRemove,
}: {
  annotations: readonly ComposerAnnotation[];
  onRemove: (annotation: ComposerAnnotation) => void;
}) {
  if (!annotations.length) return null;
  return (
    <ol aria-label="Attached selections" className="grid w-full basis-full gap-1.5 px-2.5 pt-2">
      {annotations.map((annotation, index) => {
        const {
          icon: Icon,
          label,
          markdown,
          preview,
          removeName,
        } = annotationCard(annotation, annotations.length > 1, index);
        return (
          <li
            className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2"
            key={annotation.id}
          >
            <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[0.6875rem] font-medium text-muted-foreground">{label}</p>
              <p className="line-clamp-1 break-words text-xs leading-5 text-foreground">
                {preview}
              </p>
            </div>
            {markdown ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    aria-label={`Show the full ${label} reference`}
                    className="size-6 shrink-0"
                    size="icon"
                    title="Show details"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronDownIcon aria-hidden="true" className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[26rem] max-w-[calc(100vw-2rem)]">
                  <PopoverHeader>
                    <PopoverTitle>{label}</PopoverTitle>
                    <PopoverDescription>
                      Sent with your next message, exactly as shown below.
                    </PopoverDescription>
                  </PopoverHeader>
                  <div className="max-h-80 overflow-y-auto text-xs [&_table]:text-xs">
                    <MarkdownText mode="static">{markdown}</MarkdownText>
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
            <Button
              aria-label={`Remove ${removeName} ${index + 1}`}
              className="size-6 shrink-0"
              onClick={() => onRemove(annotation)}
              size="icon"
              title="Remove"
              type="button"
              variant="ghost"
            >
              <RemoveIcon aria-hidden="true" className="size-3.5" />
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
