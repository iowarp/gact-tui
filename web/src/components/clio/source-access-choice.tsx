import type { SourceMode } from '@clio/core/v3';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { sourceModeDescriptions, sourceModeNames } from './connected-source-labels';

const modes: SourceMode[] = ['read_only', 'working_copy', 'write_enabled'];

/**
 * Access is the same three radio rows everywhere a source is connected: Read only,
 * Editable download and Read and write link. A mode the provider can't offer stays
 * listed but faint, and names its reason on hover.
 */
export function SourceAccessChoice({
  value,
  onChange,
  supported,
  reasons = {},
  disabled = false,
}: {
  value: SourceMode;
  onChange: (value: SourceMode) => void;
  supported: readonly SourceMode[];
  reasons?: Partial<Record<string, string>>;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-[5px]" data-slot="source-access">
      <div id={`${id}-label`} className="text-[11.5px] text-muted-foreground">
        Access
      </div>
      <RadioGroupPrimitive.Root
        aria-labelledby={`${id}-label`}
        value={value}
        onValueChange={(next) => onChange(next as SourceMode)}
        disabled={disabled}
        className="-mx-2 grid"
      >
        {modes.map((mode) => {
          const unavailable = !supported.includes(mode);
          const description = sourceModeDescriptions[mode];
          const name = sourceModeNames[mode];
          return (
            <label
              key={mode}
              htmlFor={`${id}-${mode}`}
              title={
                unavailable
                  ? (reasons[mode] ?? `${name} isn't available for this source.`)
                  : description
                    ? `${name}: ${description}`
                    : name
              }
              data-slot="source-access-row"
              className={cn(
                'flex min-h-[30px] items-center gap-[9px] rounded-md px-2 py-[3px] text-[12.5px] text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring',
                unavailable || disabled
                  ? 'cursor-not-allowed text-faint'
                  : 'cursor-pointer hover:bg-menu-highlight',
              )}
            >
              <RadioGroupPrimitive.Item
                id={`${id}-${mode}`}
                value={mode}
                disabled={unavailable}
                aria-describedby={description ? `${id}-${mode}-description` : undefined}
                className="size-3 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--faint)] outline-none data-[state=checked]:shadow-[inset_0_0_0_4px_var(--primary)] motion-safe:transition-shadow"
              />
              <span className="flex min-w-0 flex-col leading-[1.3]">
                <span className="truncate">{name}</span>
                {description && (
                  <small
                    id={`${id}-${mode}-description`}
                    className="truncate text-[11px] text-faint"
                  >
                    {description}
                  </small>
                )}
              </span>
            </label>
          );
        })}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
