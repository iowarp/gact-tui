import type { ComponentType, ReactNode, SVGProps } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Place a preference beside its control, stacking on small screens. */
export function SettingsRow({
  title,
  description,
  children,
  htmlFor,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid items-center gap-3 border-b border-border/60 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 pr-4">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="text-sm font-medium">
            {title}
          </Label>
        ) : (
          <h2 className="text-sm font-medium">{title}</h2>
        )}
        {description ? (
          <div className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <div className="min-w-0 sm:max-w-sm">{children}</div>
    </div>
  );
}

/** Accessible radio choices with visible labels and explanatory hover text. */
export function SettingsChoice({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
    description?: string;
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
  }>;
}) {
  return (
    <RadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onValueChange={onChange}
      className="flex w-fit flex-wrap gap-0.5 rounded-lg bg-muted/70 p-1"
    >
      {options.map(({ value: option, label: name, description, icon: Icon }) => (
        <Label
          key={option}
          htmlFor={`${id}-${option}`}
          title={description}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring',
            value === option && 'bg-background text-foreground shadow-sm',
          )}
        >
          <RadioGroupItem className="sr-only" id={`${id}-${option}`} value={option} />
          {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
          {name}
        </Label>
      ))}
    </RadioGroup>
  );
}
