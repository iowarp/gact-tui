import {
  AudioLinesIcon,
  BrainIcon,
  EyeIcon,
  FileTextIcon,
  ScrollTextIcon,
  SparklesIcon,
  VideoIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  modelCapabilityTagLabel,
  modelCapabilityTagMeaning,
  modelCapabilityTagSource,
  type ModelCapabilityTag,
} from '@/lib/model-capability-tags';
import { cn } from '@/lib/utils';

const TAG_ICONS: Record<string, LucideIcon> = {
  'input_modality:image': EyeIcon,
  'input_modality:audio': AudioLinesIcon,
  'input_modality:video': VideoIcon,
  'input_modality:pdf': FileTextIcon,
  'capability:tool_calling': WrenchIcon,
  'capability:reasoning': BrainIcon,
};

function tagIcon(tag: ModelCapabilityTag): LucideIcon {
  if (tag.axis === 'context') return ScrollTextIcon;
  return TAG_ICONS[`${tag.axis}:${tag.value}`] ?? SparklesIcon;
}

interface ModelCapabilityTagsProps {
  tags: readonly ModelCapabilityTag[];
  /** `sm`: a picker row; `default`: the Models page card. */
  size?: 'sm' | 'default';
  className?: string;
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
export function ModelCapabilityTags({ tags, size = 'default', className }: ModelCapabilityTagsProps) {
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
                  className="cursor-default font-normal text-muted-foreground"
                  data-tag={`${tag.axis}:${tag.value}`}
                  radius="full"
                  size={size === 'sm' ? 'sm' : 'lg'}
                  variant="outline"
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="block max-w-xs leading-5" side="top">
                <span className="block">{modelCapabilityTagMeaning(tag)}</span>
                <span className="block opacity-70">{modelCapabilityTagSource(tag)}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </span>
    </TooltipProvider>
  );
}
