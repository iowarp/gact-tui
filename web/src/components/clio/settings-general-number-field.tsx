import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** A typed number in the control column (C): right-aligned digits, a muted unit inside the field. */
export function SettingsNumberField({
  id,
  value,
  onChange,
  min,
  max,
  unit,
  invalid = false,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  /** Short faint unit at the field's right end ("chars", "lines"), like the spec's "120 s". */
  unit?: string;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex w-24 shrink-0', className)}>
      <Input
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className={cn(
          'h-[1.875rem] w-full px-2.5 text-right font-mono text-xs tabular-nums md:text-xs',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          unit && 'pr-[calc(var(--unit-width)+0.875rem)]',
        )}
        id={id}
        inputMode="numeric"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        step={1}
        style={unit ? { ['--unit-width' as string]: `${unit.length * 0.4}rem` } : undefined}
        type="number"
        value={value}
      />
      {unit ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-label text-faint"
        >
          {unit}
        </span>
      ) : null}
    </span>
  );
}
