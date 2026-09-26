import type { ReasoningEffort } from '@clio/core/v3';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { REASONING_EFFORT_LABELS, type ModelReasoningLevels } from '@/lib/reasoning-levels';

const MODEL_DEFAULT = '__model_default__';
/** The chosen level reads at a glance, in light and dark. */
const SELECTED = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

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
      aria-label="Thinking"
      className="flex-wrap"
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
      variant="outline"
    >
      <ToggleGroupItem
        className={SELECTED}
        title={defaultName ? `The model's own default (${defaultName})` : "The model's own default"}
        value={MODEL_DEFAULT}
      >
        Default
      </ToggleGroupItem>
      {levels.map((level) => (
        <ToggleGroupItem className={SELECTED} key={level} value={level}>
          {REASONING_EFFORT_LABELS[level]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
