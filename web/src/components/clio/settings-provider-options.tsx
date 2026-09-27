import type { LanguageModelPreset } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ConfigurationField = NonNullable<LanguageModelPreset['configuration_fields']>[number];

interface SettingsProviderOptionsProps {
  fields: ConfigurationField[];
  values: Record<string, string>;
  edited: boolean;
  saving: boolean;
  onEdit: (id: string, value: string) => void;
  onSave: () => void;
}

/**
 * The options a provider itself declares it needs to reach a model (an Azure
 * API version, a Vertex project and region, an AWS region). They belong to
 * the connection, not to how the model replies, so they sit apart from the
 * response settings and appear only for a provider that declares them.
 */
export function SettingsProviderOptions({
  fields,
  values,
  edited,
  saving,
  onEdit,
  onSave,
}: SettingsProviderOptionsProps) {
  return (
    <section
      aria-label="Provider options"
      className="flex flex-col gap-3"
      data-slot="provider-options"
    >
      <h3 className="text-sm font-medium">Provider options</h3>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div className="flex min-w-0 flex-col gap-1.5" key={field.id}>
            <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
            <Input
              aria-label={field.label}
              className="h-7"
              onChange={(event) => onEdit(field.id, event.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              title={field.description}
              value={values[field.id] ?? ''}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button disabled={!edited || saving} onClick={onSave} size="sm" type="button">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </section>
  );
}
