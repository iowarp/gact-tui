import { Badge } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  modelCapabilityTagDetail,
  modelCapabilityTagLabel,
  modelCapabilityTagMeaning,
  modelCapabilityTagSource,
  type ModelCapabilityTag,
} from '@/lib/model-capability-tags';
import { cn } from '@/lib/utils';
import { tagIcon } from './model-capability-tag-icons';

interface ModelCapabilityTagsProps {
  tags: readonly ModelCapabilityTag[];
  /** `sm`: a picker row; `default`: the Models page card. */
  size?: 'sm' | 'default';
  /**
   * Makes each chip clickable (the picker adds the tag's filter token). The
   * click never reaches the row the chips sit in.
   */
  onTagClick?: (tag: ModelCapabilityTag) => void;
  className?: string;
}

/** Free is the pitch: it reads green, every other tag stays quiet. */
function isFreeTag(tag: ModelCapabilityTag): boolean {
  return tag.axis === 'price';
}

/**
 * A model's capability tags as small labelled chips ("Vision", "Tools",
 * "Reasoning", "200K"). Each chip's tooltip says what it means and where the
 * claim came from. Takes the normalized tag list, never raw catalog fields,
 * so the picker rows and the Models card read the same; an empty list
 * renders nothing (unknown is never guessed).
 *
 * The chips are hover-only (not tab stops): they sit inside picker options,
 * where a focusable control would break the listbox. Their text is the label,
 * so nothing is conveyed by the icon alone.
 */
export function ModelCapabilityTags({
  tags,
  size = 'default',
  className,
  onTagClick,
}: ModelCapabilityTagsProps) {
  if (!tags.length) return null;
  return (
    <TooltipProvider delayDuration={250}>
      <span
        className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}
        data-slot="model-capability-tags"
      >
        {tags.map((tag) => {
          const Icon = tagIcon(tag);
          const label = modelCapabilityTagLabel(tag);
          return (
            <Tooltip key={`${tag.axis}:${tag.value}`}>
              <TooltipTrigger asChild>
                <Badge
                  className={cn(
                    'font-normal',
                    !isFreeTag(tag) && 'text-muted-foreground',
                    onTagClick
                      ? 'cursor-pointer hover:border-primary/40 hover:text-foreground'
                      : 'cursor-default',
                  )}
                  onClick={
                    onTagClick
                      ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onTagClick(tag);
                        }
                      : undefined
                  }
                  onPointerDown={onTagClick ? (event) => event.stopPropagation() : undefined}
                  data-tag={`${tag.axis}:${tag.value}`}
                  radius="full"
                  size={size === 'sm' ? 'sm' : 'lg'}
                  variant={isFreeTag(tag) ? 'success-light' : 'outline'}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="block max-w-xs leading-5" side="top">
                <span className="block">{modelCapabilityTagMeaning(tag)}</span>
                <span className="block opacity-70">{modelCapabilityTagSource(tag)}</span>
                {modelCapabilityTagDetail(tag) ? (
                  <span className="block font-mono text-xs opacity-70" data-slot="tag-evidence-detail">
                    {modelCapabilityTagDetail(tag)}
                  </span>
                ) : null}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </span>
    </TooltipProvider>
  );
}
