import type { ComponentType, ReactNode } from 'react';
import { ArrowLeftRightIcon, ChevronRightIcon } from 'lucide-react';
import { providerDisplayName } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import type { ConversationModelBoundary } from './conversation-model-boundaries';
import { t } from '@lingui/core/macro';

/**
 * A line across the transcript where the conversation changed footing: the
 * spec's quiet 28px `.xs.in` line (15px icon, 12.5px muted words) with a
 * hairline running to the right edge, as for "Switched to …" and "Compacted
 * here, 61 messages summarized". When it opens a record, the words become one
 * button with an always-visible chevron.
 */
export function TranscriptDivider({
  icon: Icon,
  children,
  label,
  open,
  onOpenChange,
  title,
  className,
  ...data
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  children: ReactNode;
  /** The accessible name when the words alone are not enough. */
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hover name. */
  title?: string;
  className?: string;
  [data: `data-${string}`]: string | undefined;
}) {
  const words = (
    <>
      <Icon aria-hidden="true" className="size-[15px] shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </>
  );
  return (
    <div
      aria-label={onOpenChange ? undefined : label}
      className={cn(
        'flex h-7 min-w-0 items-center gap-2 px-2 text-menu text-muted-foreground',
        className,
      )}
      role={onOpenChange ? undefined : 'separator'}
      title={onOpenChange ? undefined : title}
      {...data}
    >
      {onOpenChange ? (
        <button
          aria-expanded={open}
          aria-label={label}
          className="-mx-1 inline-flex h-6 max-w-full min-w-0 items-center gap-2 rounded-[4px] px-1 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onClick={() => onOpenChange(!open)}
          title={title}
          type="button"
        >
          {words}
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              'size-3.5 shrink-0 motion-safe:transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>
      ) : (
        words
      )}
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border" />
    </div>
  );
}

function modelName(model: NonNullable<ConversationModelBoundary['model']>): string {
  return `${providerDisplayName(undefined, model.provider_id)}, ${model.model_id}`;
}

/**
 * Where the prompt's model changed: "Switched to Claude Code, claude-sonnet-5".
 * The first model draws no line; each reply's footer already names it.
 */
export function ConversationModelDivider({ boundary }: { boundary: ConversationModelBoundary }) {
  if (!boundary.model || !boundary.previous) return null;
  const model = modelName(boundary.model);
  const previous = modelName(boundary.previous);
  return (
    <TranscriptDivider
      className="mb-2"
      data-model-id={boundary.model.model_id}
      data-provider-id={boundary.model.provider_id}
      data-slot="model-checkpoint"
      icon={ArrowLeftRightIcon}
      label={t`Switched to ${model}. Previous model: ${previous}`}
      title={t`Previous model: ${previous}`}
    >
      {t`Switched to ${model}`}
    </TranscriptDivider>
  );
}
