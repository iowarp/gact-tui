import type { ComponentType, ReactNode, SVGProps } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { InfoTip } from './info-tip';

/** Place a preference beside its control, stacking on small screens. */
export function SettingsRow({
  title,
  description,
  info,
  children,
  htmlFor,
}: {
  title: string;
  description?: ReactNode;
  /** Explanation beside the field label, without another line of page copy. */
  info?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="@container">
      <div
        data-slot="settings-row"
        className="grid items-center gap-3 border-b border-border/60 py-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
      >
        <div className="min-w-0 pr-4">
          <div className="flex items-center gap-1.5">
            {htmlFor ? (
              <Label htmlFor={htmlFor} className="text-sm font-medium">
                {title}
              </Label>
            ) : (
              <h2 className="text-sm font-medium">{title}</h2>
            )}
            {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
          </div>
          {description ? (
            <div className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        <div
          data-slot="settings-control"
          className="flex w-full min-w-0 items-center justify-start @2xl:justify-end"
        >
          {children}
        </div>
      </div>
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
      className="grid w-full auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted/70 p-1"
    >
      {options.map(({ value: option, label: name, description, icon: Icon }) => (
        <Label
          key={option}
          htmlFor={`${id}-${option}`}
          title={description}
          className={cn(
            'flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-center text-sm text-muted-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring',
            value === option && 'bg-background text-foreground shadow-sm',
          )}
        >
          <RadioGroupItem
            className="sr-only absolute size-px border-0"
            id={`${id}-${option}`}
            value={option}
          />
          {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
          {name}
        </Label>
      ))}
    </RadioGroup>
  );
}
