import type { SourceMode } from '@clio/core/v3';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { sourceModeDescriptions, sourceModeNames } from './connected-source-labels';
import { SegmentedControl } from './primitives/segmented-control';
import type { SourceUse } from './source-access-intent';

const modes: SourceMode[] = ['read_only', 'working_copy', 'write_enabled'];

const useOptions: ReadonlyArray<{ value: SourceUse; label: string }> = [
  { value: 'link', label: 'Link to the originals' },
  { value: 'transfer', label: 'Download a copy' },
];

const useDescriptions: Record<SourceUse, string> = {
  link: 'Files stay at their source and are read when needed.',
  transfer: 'Files are saved in this workspace and stay available offline.',
};

/**
 * Access is the same three radio rows everywhere a source is connected: Read only,
 * Editable download and Read and write link. A mode the provider can't offer stays
 * listed but faint, and names its reason on hover.
 *
 * Under the rows, when the source offers both, Files chooses between linking to
 * the originals and downloading a copy; a read and write link always links. A
 * read and write link asks the user to allow changes to the originals.
 */
export function SourceAccessChoice({
  value,
  onChange,
  supported,
  reasons = {},
  disabled = false,
  uses = [],
  use,
  onUseChange,
  confirmed = false,
  onConfirmedChange,
}: {
  value: SourceMode;
  onChange: (value: SourceMode) => void;
  supported: readonly SourceMode[];
  reasons?: Partial<Record<string, string>>;
  disabled?: boolean;
  /** How the source can bring its files in; Files shows when it offers both. */
  uses?: readonly SourceUse[];
  use?: SourceUse;
  onUseChange?: (value: SourceUse) => void;
  confirmed?: boolean;
  /** Asks for the write confirmation under Read and write link. */
  onConfirmedChange?: (value: boolean) => void;
}) {
  const id = useId();
  const chooseUse = Boolean(onUseChange && use && uses.length > 1 && value !== 'write_enabled');
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
      {value === 'write_enabled' && onConfirmedChange && (
        <label
          data-slot="source-access-confirm"
          className={cn(
            '-mx-2 flex min-h-[30px] items-start gap-[9px] rounded-md px-2 py-[5px] text-[12.5px]',
            disabled ? 'cursor-not-allowed text-faint' : 'cursor-pointer hover:bg-menu-highlight',
          )}
        >
          <Checkbox
            aria-describedby={`${id}-confirm-description`}
            checked={confirmed}
            className="mt-px size-3.5"
            disabled={disabled}
            onCheckedChange={(checked) => onConfirmedChange(checked === true)}
          />
          <span className="flex min-w-0 flex-col leading-[1.3]">
            <span>Allow changes to original files</span>
            <small id={`${id}-confirm-description`} className="text-[11px] text-faint">
              Edits and deletions change the originals, including files shared with others.
            </small>
          </span>
        </label>
      )}
      {chooseUse && use && onUseChange && (
        <div className="mt-[7px] grid gap-[5px]" data-slot="source-access-files">
          <div id={`${id}-files`} className="text-[11.5px] text-muted-foreground">
            Files
          </div>
          <SegmentedControl
            label="Files"
            options={useOptions.map((option) => ({
              ...option,
              disabled: disabled || !uses.includes(option.value),
            }))}
            value={use}
            onValueChange={onUseChange}
            className="justify-self-start"
          />
          <small className="text-[11px] text-faint">{useDescriptions[use]}</small>
        </div>
      )}
    </div>
  );
}
