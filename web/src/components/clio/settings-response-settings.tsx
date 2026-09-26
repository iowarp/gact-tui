import type { LanguageModelPreset } from '@clio/core/v3';
import { ChevronRightIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/reui/number-field';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ModelSettingsValues } from './settings-models-form';

interface SettingsResponseSettingsProps {
  preset: LanguageModelPreset | undefined;
  values: ModelSettingsValues;
  /** Whether the local-runtime controls (parallel slots, context size, address) apply. */
  runtimeSized: boolean;
  edited: boolean;
  saving: boolean;
  onEdit: (patch: Partial<ModelSettingsValues>) => void;
  onSave: () => void;
}

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function Setting({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', wide && 'sm:col-span-2')}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function NumberSetting({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Setting label={label}>
      <NumberField
        aria-label={label}
        className="gap-0"
        max={max}
        min={min}
        onValueChange={(next) => onChange(next === null ? '' : String(next))}
        size="sm"
        step={step}
        value={toNumber(value)}
      >
        <NumberFieldGroup>
          <NumberFieldDecrement />
          <NumberFieldInput aria-label={label} placeholder="Provider default" />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
    </Setting>
  );
}

/**
 * The rarely changed response settings, behind one quiet disclosure: a
 * compact two-column panel (temperature and output length, plus a local
 * runtime's own sizing and address, and any setting the provider itself
 * declares). Empty means the provider's own default -- never 0.
 */
export function SettingsResponseSettings({
  preset,
  values,
  runtimeSized,
  edited,
  saving,
  onEdit,
  onSave,
}: SettingsResponseSettingsProps) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible data-slot="response-settings" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <Button className="-ms-2 text-muted-foreground" size="sm" type="button" variant="ghost">
          <ChevronRightIcon
            aria-hidden="true"
            className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')}
          />
          Response settings
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <NumberSetting
            label="Temperature"
            max={2}
            min={0}
            onChange={(temperature) => onEdit({ temperature })}
            step={0.1}
            value={values.temperature}
          />
          <NumberSetting
            label="Longest reply (tokens)"
            min={1}
            onChange={(maxTokens) => onEdit({ maxTokens })}
            step={256}
            value={values.maxTokens}
          />
          {runtimeSized ? (
            <>
              <NumberSetting
                label="Replies at once"
                min={0}
                onChange={(parallel) => onEdit({ parallel })}
                value={values.parallel}
              />
              <NumberSetting
                label="Context size (tokens)"
                min={0}
                onChange={(contextLength) => onEdit({ contextLength })}
                step={1024}
                value={values.contextLength}
              />
              <Setting label="Server address" wide>
                <Input
                  aria-label="Server address"
                  autoComplete="url"
                  className="h-7"
                  onChange={(event) => onEdit({ apiBase: event.target.value })}
                  placeholder="http://127.0.0.1:8000/v1"
                  value={values.apiBase}
                />
              </Setting>
            </>
          ) : null}
          {(preset?.configuration_fields ?? []).map((field) => (
            <Setting key={field.id} label={field.label}>
              <Input
                aria-label={field.label}
                className="h-7"
                onChange={(event) =>
                  onEdit({ providerOptions: { ...values.providerOptions, [field.id]: event.target.value } })
                }
                placeholder={field.placeholder}
                required={field.required}
                title={field.description}
                value={values.providerOptions[field.id] ?? ''}
              />
            </Setting>
          ))}
        </div>
        <div className="flex justify-end pt-3">
          <Button disabled={!edited || saving} onClick={onSave} size="sm" type="button">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
