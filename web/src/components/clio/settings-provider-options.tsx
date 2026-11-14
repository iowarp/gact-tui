import type { LanguageModelPreset } from '@clio/core/v3';
import { Input } from '@/components/ui/input';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { localizeProviderOption } from './settings-schema-copy';
import { t } from '@lingui/core/macro';

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
    <section aria-label={t`Provider options`} data-slot="provider-options">
      <SettingsGroupLabel>{t`Provider options`}</SettingsGroupLabel>
      {fields.map((field) => {
        const choices = field.options ?? [];
        const id = `provider-option-${field.id}`;
        const copy = localizeProviderOption(field);
        const label = copy.label;
        return (
          <SettingsRow
            description={copy.description}
            dirty={dirty?.has(field.id) ?? false}
            htmlFor={id}
            key={field.id}
            title={label}
          >
            {choices.length > 0 ? (
              <select
                aria-label={label}
                className="h-[1.875rem] w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-menu outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
                id={id}
                onChange={(event) => onEdit(field.id, event.target.value)}
                // An unset choice is the provider's declared default (its placeholder).
                value={values[field.id] || field.placeholder || choices[0]}
              >
                {choices.map((option) => (
                  <option key={option} value={option}>
                    {copy.option(option)}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                aria-label={label}
                className="h-[1.875rem] text-menu"
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
