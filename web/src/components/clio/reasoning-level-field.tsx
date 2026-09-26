import type { ReasoningEffort } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  modelDefaultLabel,
  REASONING_EFFORT_LABELS,
  type ModelReasoningLevels,
} from '@/lib/reasoning-levels';
import { InfoTip } from './info-tip';

const MODEL_DEFAULT = '__model_default__';

/**
 * A reasoning-effort field listing exactly the levels the model reports. It
 * renders nothing when the model offers no level. With `allowModelDefault`,
 * an empty value means "the model's own default" and is offered first.
 */
export function ReasoningLevelField({
  allowModelDefault = false,
  description,
  info,
  id,
  onChange,
  reasoning,
  value,
}: {
  allowModelDefault?: boolean;
  description?: ReactNode;
  /** Explanation behind an info icon beside the label (instead of a description). */
  info?: string;
  id: string;
  onChange: (value: ReasoningEffort | undefined) => void;
  reasoning: ModelReasoningLevels | undefined;
  value: string | undefined;
}) {
  const levels = reasoning?.levels ?? [];
  if (!levels.length) return null;
  const defaultLabel = modelDefaultLabel(reasoning);
  const selected = value && levels.includes(value as ReasoningEffort) ? value : undefined;
  return (
    <Field>
      <div className="flex items-center gap-1.5">
        <FieldLabel htmlFor={id}>Reasoning effort</FieldLabel>
        {info ? <InfoTip label="About reasoning effort">{info}</InfoTip> : null}
      </div>
      <Select
        onValueChange={(next) =>
          onChange(next === MODEL_DEFAULT ? undefined : levels.find((level) => level === next))
        }
        value={selected ?? (allowModelDefault ? MODEL_DEFAULT : undefined)}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Provider default" />
        </SelectTrigger>
        <SelectContent>
          {allowModelDefault ? <SelectItem value={MODEL_DEFAULT}>{defaultLabel}</SelectItem> : null}
          {levels.map((level) => (
            <SelectItem key={level} value={level}>
              {REASONING_EFFORT_LABELS[level]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}
