import type { ReasoningEffort } from '@clio/core/v3';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { REASONING_EFFORT_LABELS, type ModelReasoningLevels } from '@/lib/reasoning-levels';
import { t } from '@lingui/core/macro';

const MODEL_DEFAULT = '__model_default__';
/**
 * The segmented control (spec .xsg): the chosen level is the raised segment.
 * Seven levels fit a phone column only with tighter segments; past that (long
 * translations, a large interface size) they wrap onto a second line.
 */
const ITEM =
  'h-6 rounded-[0.3125rem] border-0 px-2.5 max-[25rem]:px-1! text-xs font-normal text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground data-[state=on]:bg-menu-highlight data-[state=on]:text-foreground';

interface ReasoningLevelSegmentedProps {
  reasoning: ModelReasoningLevels | undefined;
  /** The chosen level; empty means the model's own default. */
  value: ReasoningEffort | '';
  onChange: (value: ReasoningEffort | '') => void;
  disabled?: boolean;
}

/**
 * How hard the model thinks, as a segmented control over exactly the levels
 * the model reports, led by its own default. Renders nothing for a model
 * that offers no level.
 */
export function ReasoningLevelSegmented({
  reasoning,
  value,
  onChange,
  disabled = false,
}: ReasoningLevelSegmentedProps) {
  const levels = reasoning?.levels ?? [];
  if (!levels.length) return null;
  const selected = value && levels.includes(value) ? value : MODEL_DEFAULT;
  const defaultName = reasoning?.default ? REASONING_EFFORT_LABELS[reasoning.default] : undefined;
  return (
    <ToggleGroup
      aria-label={t`Reasoning effort`}
      className="max-w-full shrink-0 flex-wrap gap-px rounded-[0.4375rem] bg-muted p-0.5"
      data-slot="reasoning-level"
      disabled={disabled}
      onValueChange={(next) => {
        if (!next) return;
        onChange(next === MODEL_DEFAULT ? '' : (levels.find((level) => level === next) ?? ''));
      }}
      size="sm"
      spacing={0}
      type="single"
      value={selected}
      variant="default"
    >
      <ToggleGroupItem
        className={ITEM}
        title={
          defaultName ? t`The model's own default (${defaultName})` : t`The model's own default`
        }
        value={MODEL_DEFAULT}
      >
        {t`Default`}
      </ToggleGroupItem>
      {levels.map((level) => (
        <ToggleGroupItem className={ITEM} key={level} value={level}>
          {REASONING_EFFORT_LABELS[level]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
