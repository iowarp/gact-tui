import type { LanguageModelPreset } from '@clio/core/v3';
import { Input } from '@/components/ui/input';
import { SettingsGroupLabel, SettingsRow } from './settings-row';

type ConfigurationField = NonNullable<LanguageModelPreset['configuration_fields']>[number];

interface SettingsProviderOptionsProps {
  fields: ConfigurationField[];
  values: Record<string, string>;
  /** Typed values waiting in the page's save bar. */
  dirty?: ReadonlySet<string>;
  onEdit: (id: string, value: string) => void;
}

/**
 * The options a provider itself declares it needs to reach a model (an Azure
 * API version, a Vertex project and region, an AWS region). They belong to
 * the connection, not to how the model replies, so they sit in their own
 * group and appear only for a provider that declares them. Typed values wait
 * in the page's save bar.
 */
export function SettingsProviderOptions({
  fields,
  values,
  dirty,
  onEdit,
}: SettingsProviderOptionsProps) {
  return (
    <section aria-label="Provider options" data-slot="provider-options">
      <SettingsGroupLabel>Provider options</SettingsGroupLabel>
      {fields.map((field) => {
        const choices = field.options ?? [];
        const id = `provider-option-${field.id}`;
        return (
          <SettingsRow
            description={field.description}
            dirty={dirty?.has(field.id) ?? false}
            htmlFor={id}
            key={field.id}
            title={field.label}
          >
            {choices.length > 0 ? (
              <select
                aria-label={field.label}
                className="h-[1.875rem] w-full min-w-0 rounded-md border border-input bg-input/30 px-2 text-[0.78125rem] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                id={id}
                onChange={(event) => onEdit(field.id, event.target.value)}
                // An unset choice is the provider's declared default (its placeholder).
                value={values[field.id] || field.placeholder || choices[0]}
              >
                {choices.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                aria-label={field.label}
                className="h-[1.875rem] text-[0.78125rem]"
                id={id}
                onChange={(event) => onEdit(field.id, event.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                value={values[field.id] ?? ''}
              />
            )}
          </SettingsRow>
        );
      })}
    </section>
  );
}