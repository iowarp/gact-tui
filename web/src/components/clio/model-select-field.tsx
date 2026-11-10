import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronDownIcon, CpuIcon } from 'lucide-react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import type { ClioModelOption } from '@/lib/model-options';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import { ClioModelPicker } from './model-picker';

export interface SettingsSelectFieldProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  icon?: ReactNode;
  /** The chosen value's words; `placeholder` shows muted when empty. */
  value?: ReactNode;
  placeholder?: ReactNode;
  /**
   * A save is in flight: the field reads as unavailable and won't open, but stays
   * focusable, so a picker closing on its own choice can still return focus here.
   */
  busy?: boolean;
}

/** A select-shaped field (C): icon, value, chevron. Every select opens the one Picker. */
export const SettingsSelectField = forwardRef<HTMLButtonElement, SettingsSelectFieldProps>(
  function SettingsSelectField(
    { icon, value, placeholder, busy, className, onClick, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        data-slot="settings-select-field"
        className={cn(
          'flex h-[1.875rem] w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border border-input bg-input/30 px-2.5 text-[0.78125rem] whitespace-nowrap text-foreground outline-none',
          // Inset like the row's text fields (the spec's dark field fill).
          'dark:bg-sidebar dark:hover:bg-input/30',
          'hover:bg-input/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
          'aria-expanded:border-ring aria-expanded:ring-2 aria-expanded:ring-ring/30',
          "[&_svg:not([class*='size-'])]:size-3.5",
          className,
        )}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        // Default-prevented, so an asChild trigger (Radix) doesn't open.
        onClick={(event) => {
          if (busy) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        {...props}
      >
        {icon ? (
          <span
            aria-hidden="true"
            className="grid shrink-0 place-items-center text-muted-foreground"
          >
            {icon}
          </span>
        ) : null}
        <span className={cn('min-w-0 flex-1 truncate text-left', !value && 'text-faint')}>
          {value || placeholder}
        </span>
        <ChevronDownIcon aria-hidden="true" className="shrink-0 text-muted-foreground" />
      </button>
    );
  },
);

/** "Provider / model" with the provider's logo; opens the model picker. */
export function ModelSelectField({
  id,
  title,
  options,
  providerId,
  modelId,
  providerName,
  option,
  placeholder,
  catalogStatus,
  onRetryCatalog,
  onChange,
  disabled,
  busy,
  label,
  inherited,
}: {
  id?: string;
  /** The field's accessible name when no `<label for={id}>` names it. */
  label?: string;
  /** The picker's title ("Choose the default model"); also the field's accessible name. */
  title: string;
  options: readonly ClioModelOption[];
  providerId?: string;
  modelId?: string;
  providerName?: string;
  option?: ClioModelOption;
  placeholder: string;
  catalogStatus: 'error' | 'loading' | 'ready';
  onRetryCatalog: (providerId?: string) => void;
  onChange: (choice: ClioModelOption) => void;
  disabled?: boolean;
  /** A save is pending: blocks opening but keeps the field focusable. */
  busy?: boolean;
  /** The value is inherited: show it, but leave the picker without a current row so choosing it pins it. */
  inherited?: boolean;
}) {
  const model = option?.label ?? modelId;
  const provider = providerName ?? option?.providerName;
  return (
    <ClioModelPicker
      catalogStatus={catalogStatus}
      model={inherited ? undefined : (option?.id ?? modelId)}
      onChange={onChange}
      onRetryCatalog={onRetryCatalog}
      options={options}
      provider={providerId}
      title={title}
      trigger={
        <SettingsSelectField
          aria-label={label}
          busy={busy}
          disabled={disabled}
          icon={
            providerId ? (
              <ModelSelectorLogo className="size-3.5" provider={providerLogoId(providerId)} />
            ) : (
              <CpuIcon />
            )
          }
          id={id}
          placeholder={placeholder}
          title={model ? `${provider ? `${provider} / ` : ''}${model}` : placeholder}
          value={
            model ? (
              <>
                {provider ? (
                  <>
                    <span data-slot="model-select-provider">{provider}</span>
                    <span className="px-1 text-faint">/</span>
                  </>
                ) : null}
                <span data-slot="model-select-name">{model}</span>
              </>
            ) : undefined
          }
        />
      }
    />
  );
}
