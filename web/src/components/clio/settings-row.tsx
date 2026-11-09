import type { ComponentType, ReactNode, SVGProps } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AddIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { IconButton } from './primitives/icon-button';
import { InfoTip } from './info-tip';

/**
 * Setting row (B): label and ⓘ hint on the left, the control on the right, one
 * 44 px line. Explanation lives behind the ⓘ; `note` is a short visible state
 * line under the label ("Following your system, now dark"). Rows take 60% of a
 * wide page and stack their control under the label when narrow.
 */
export function SettingsRow({
  title,
  description,
  info,
  note,
  error,
  children,
  htmlFor,
  inlineControl = false,
  dirty = false,
}: {
  title: string;
  /** Explanation of the setting; shown behind the ⓘ beside the label. */
  description?: ReactNode;
  /** More explanation behind the same ⓘ (source, effect, …). */
  info?: ReactNode;
  /** Visible state under the label, one line. */
  note?: ReactNode;
  /** A validation message under the label. */
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  /** Small controls such as switches stay beside their label at every width. */
  inlineControl?: boolean;
  /** A typed value waiting in the save bar. */
  dirty?: boolean;
}) {
  const hint =
    description && info ? (
      <div className="grid gap-1.5">
        <div>{description}</div>
        <div>{info}</div>
      </div>
    ) : (
      (description ?? info)
    );
  return (
    <div className="@container w-full @3xl:w-[60%]" data-slot="settings-row-frame">
      <div
        data-slot="settings-row"
        data-dirty={dirty || undefined}
        className={cn(
          'relative grid min-h-11 items-center gap-x-4 gap-y-2 border-b border-border/70 py-[0.3125rem]',
          inlineControl
            ? 'grid-cols-[minmax(0,1fr)_auto]'
            : 'grid-cols-1 @sm:grid-cols-[minmax(7rem,1fr)_minmax(52%,max-content)]',
          dirty &&
            'before:absolute before:top-[1.1875rem] before:-left-3.5 before:size-1.5 before:rounded-full before:bg-primary',
        )}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            {htmlFor ? (
              <Label htmlFor={htmlFor} className="min-w-0 truncate text-[0.8125rem] font-normal">
                {title}
              </Label>
            ) : (
              <h2 className="min-w-0 truncate text-[0.8125rem] font-normal">{title}</h2>
            )}
            {hint ? (
              <InfoTip className="text-faint" label={`About ${title}`}>
                {hint}
              </InfoTip>
            ) : null}
          </div>
          {note ? (
            <div className="mt-0.5 truncate text-[0.71875rem] text-faint" data-slot="settings-note">
              {note}
            </div>
          ) : null}
          {error ? (
            <div className="mt-0.5 truncate text-xs text-destructive" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <div
          data-slot="settings-control"
          className="flex w-full min-w-0 items-center justify-start gap-2 whitespace-nowrap @sm:justify-end"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Small muted label over a run of rows ("Response", "Model servers"), with an optional + at the right. */
export function SettingsGroupLabel({
  children,
  info,
  onAdd,
  addLabel,
  actions,
  className,
}: {
  children: ReactNode;
  /** Explanation behind an ⓘ right after the label. */
  info?: ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  /** Other icon actions at the right end. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-4 flex h-7 min-w-0 items-center gap-2 text-[0.71875rem] whitespace-nowrap text-faint',
        className,
      )}
      data-slot="settings-group-label"
    >
      <h3 className="min-w-0 truncate font-normal">{children}</h3>
      {info ? (
        <InfoTip
          className="text-faint"
          label={typeof children === 'string' ? `About ${children}` : 'About this group'}
        >
          {info}
        </InfoTip>
      ) : null}
      <span className="flex-1" />
      {actions}
      {onAdd ? (
        <IconButton icon={<AddIcon />} label={addLabel ?? 'Add'} onClick={onAdd} size="sm" />
      ) : null}
    </div>
  );
}

/** Accessible radio choices as one segmented control, with explanatory hover text. */
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
      data-slot="settings-choice"
      className="inline-flex w-auto max-w-full min-w-0 shrink-0 gap-px rounded-[0.4375rem] bg-muted p-0.5"
    >
      {options.map(({ value: option, label: name, description, icon: Icon }) => (
        <Label
          key={option}
          htmlFor={`${id}-${option}`}
          title={description}
          className={cn(
            'flex h-6 min-w-0 cursor-pointer items-center gap-1.5 rounded-[0.3125rem] px-2.5 text-xs font-normal whitespace-nowrap text-muted-foreground hover:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring',
            value === option && 'bg-menu-highlight text-foreground',
          )}
        >
          <RadioGroupItem
            className="sr-only absolute size-px border-0"
            id={`${id}-${option}`}
            value={option}
            onFocus={() => {
              // Radix can defer arrow-key focus until after keyup. These Settings
              // radios select the focused choice, including a quick key press.
              if (value !== option) onChange(option);
            }}
          />
          {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
          <span className="min-w-0 truncate">{name}</span>
        </Label>
      ))}
    </RadioGroup>
  );
}
