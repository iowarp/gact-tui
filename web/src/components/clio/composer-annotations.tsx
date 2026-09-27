import { QuoteIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RemoveIcon } from '@/lib/icon-vocabulary';
import type { ComposerAnnotation } from '@/lib/composer-annotations';

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
      {annotations.map((annotation, index) => (
        <li
          className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2"
          key={annotation.id}
        >
          <QuoteIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Selected text{annotations.length > 1 ? ` ${index + 1}` : ''}
            </p>
            <p className="line-clamp-2 break-words text-xs leading-5 text-foreground">
              {annotation.text}
            </p>
          </div>
          <Button
            aria-label={`Remove selected text ${index + 1}`}
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
      ))}
    </ol>
  );
}
