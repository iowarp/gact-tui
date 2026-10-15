import type { ManagedServiceDefinition } from '@clio/core/v3';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoTip } from './info-tip';
import { HostPathPicker } from './host-path-picker';
import { ServiceAccessChoice } from './managed-service-access';
import { ManagedServiceContextControl } from './managed-service-context';
import { ServerParametersForm } from './managed-service-parameters';
import { MonitoringImageStorage } from './monitoring-image-storage';
import { SearchEnginePicker } from './search-engine-picker';
import { ServiceInstallationMethod } from './service-installation-method';

/** Shared definition-driven setup and reconfiguration form. Paths belong to the named host. */
export function ManagedServiceForm({
  service,
  configuration,
  variant,
  onVariant,
  onConfiguration,
  targetId,
  hostLabel,
  storageOnly = false,
  installationOnly = false,
  showIntroduction = true,
  showMethod = true,
}: {
  service: ManagedServiceDefinition;
  configuration: Record<string, string>;
  variant: string;
  onVariant: (value: string) => void;
  onConfiguration: (field: string, value: string) => void;
  targetId?: string;
  hostLabel: string;
  storageOnly?: boolean;
  /** Package/image preparation does not need a model, listening port or server flags. */
  installationOnly?: boolean;
  showIntroduction?: boolean;
  showMethod?: boolean;
}) {
  const fields = service.configuration_fields.filter(
    (field) =>
      (!field.variants?.length || field.variants.includes(variant)) &&
      (!installationOnly || (field.id === 'container_runtime' && !variant.startsWith('native'))) &&
      !(variant === 'native-windows-cpu' && field.id === 'hf_model'),
  );
  const path = configuration['storage.service_directory'] || '';
  const storageOwned = Boolean(
    service.configuration['storage.service_directory'] && service.owned_resources?.length,
  );
  const basic = fields.filter(
    (field) =>
      ['model', 'model_path', 'hf_model'].includes(field.id) ||
      (field.required && !['container_runtime', 'port'].includes(field.id)),
  );
  const advanced = fields.filter(
    (field) =>
      !basic.includes(field) && !['engines', 'opt_in_engines', 'image_storage'].includes(field.id),
  );
  const renderField = (field: (typeof fields)[number]) => (
    <Field key={field.id}>
      <div className="flex items-center gap-2">
        <FieldLabel>{field.label}</FieldLabel>
        <InfoTip label={`About ${field.label}`}>
          {field.id === 'model_path'
            ? 'The path to an existing GGUF model file on this computer. Choose a model before starting the server. Installing the runtime does not need one.'
            : field.id === 'hf_model'
              ? 'A Hugging Face GGUF repository and optional quantization. Use this instead of a local model path.'
              : field.id === 'model'
                ? 'The model identity or downloaded model folder this runtime will load.'
                : field.required
                  ? 'Required for this service.'
                  : `Optional. Leave unchanged to use ${field.placeholder || 'the service default'}.`}
        </InfoTip>
      </div>
      {field.options?.length ? (
        <Select
          onValueChange={(value) => onConfiguration(field.id, value)}
          value={configuration[field.id] || field.placeholder}
          disabled={
            storageOwned && service.category === 'monitoring' && field.id === 'container_runtime'
          }
        >
          <SelectTrigger aria-label={`${service.label} ${field.label}`}>
            <SelectValue placeholder={field.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                disabled={
                  field.id === 'container_runtime' &&
                  option !== 'podman' &&
                  configuration.image_storage === 'service'
                }
              >
                {field.id === 'safe_search'
                  ? { '0': 'Off', '1': 'Moderate', '2': 'Strict' }[option] || option
                  : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          aria-label={`${service.label} ${field.label}`}
          onChange={(event) => onConfiguration(field.id, event.target.value)}
          placeholder={
            field.id === 'model_path' && variant === 'native-windows-cpu'
              ? 'C:\\models\\model.gguf'
              : field.placeholder
          }
          required={field.required}
          value={configuration[field.id] ?? ''}
        />
      )}
    </Field>
  );
  const storage =
    service.category === 'monitoring' ||
    variant.startsWith('native-cuda') ||
    variant.startsWith('native-xpu') ? (
      <Field>
        <div className="flex items-center gap-2">
          <FieldLabel>Service data</FieldLabel>
          <InfoTip label="About service storage">
            The default uses this computer’s configured service folder. Removing the runtime retains
            its databases, logs and evidence.{' '}
            {storageOwned
              ? 'This installation already owns its folder; reconfiguration does not move it.'
              : 'Choose a dedicated folder to override the default.'}
          </InfoTip>
        </div>
        <div className="flex gap-2">
          <Input
            aria-label={`${service.label} service data on ${hostLabel}`}
            value={path}
            disabled={storageOwned}
            placeholder="Use this computer’s service folder"
            onChange={(event) => onConfiguration('storage.service_directory', event.target.value)}
          />
          {targetId ? (
            <HostPathPicker
              targetId={targetId}
              hostLabel={hostLabel}
              label="service data"
              path={path || '/'}
              disabled={storageOwned}
              onChoose={(value) => onConfiguration('storage.service_directory', value)}
            />
          ) : null}
        </div>
      </Field>
    ) : null;
  return (
    <div className="space-y-5">
      {!storageOnly ? (
        <>
          {showIntroduction ? (
            <p className="text-sm text-muted-foreground">{service.description}</p>
          ) : null}
          {showMethod ? (
            <ServiceInstallationMethod service={service} variant={variant} onVariant={onVariant} />
          ) : null}
          {showIntroduction && service.category === 'model_runtime' ? (
            <p className="text-xs text-muted-foreground">
              {installationOnly
                ? 'Install the runtime without a model file. Choose a model when you are ready to start.'
                : 'Choose the model to load. Ports and runtime settings are under Advanced settings.'}
            </p>
          ) : null}
          {basic.length ? (
            <div className="grid gap-4">{basic.map(renderField)}</div>
          ) : !installationOnly ? (
            <p className="text-sm">
              Ports and storage use this computer’s defaults. Open Advanced settings to change them.
            </p>
          ) : null}
          <ServiceAccessChoice
            configuration={configuration}
            onConfiguration={onConfiguration}
            service={service}
          />
          <details className="border-t pt-4">
            <summary className="cursor-pointer text-sm font-medium">Advanced settings</summary>
            <div className="mt-4 space-y-5">
              {service.id === 'searxng' ? (
                <SearchEnginePicker
                  value={configuration.engines || ''}
                  defaults={fields.find((field) => field.id === 'engines')?.placeholder || ''}
                  optIn={configuration.opt_in_engines || ''}
                  onChange={(value) => onConfiguration('engines', value)}
                  onOptIn={(value) => onConfiguration('opt_in_engines', value)}
                />
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                {advanced.map(renderField)}
                {fields.some((field) => field.id === 'image_storage') ? (
                  <MonitoringImageStorage
                    configuration={configuration}
                    runtime={
                      configuration.container_runtime ||
                      fields.find((field) => field.id === 'container_runtime')?.placeholder ||
                      ''
                    }
                    owned={storageOwned}
                    hostLabel={hostLabel}
                    onChange={(value) => onConfiguration('image_storage', value)}
                  />
                ) : null}
              </div>
              {!installationOnly ? (
                <ManagedServiceContextControl
                  configuration={configuration}
                  onConfiguration={onConfiguration}
                  service={service}
                  targetId={targetId}
                  variant={variant}
                />
              ) : null}
              {!installationOnly ? (
                <ServerParametersForm
                  onChange={onConfiguration}
                  parameters={service.parameters ?? []}
                  serviceLabel={service.label}
                  values={configuration}
                  variant={variant}
                />
              ) : null}
              {storage}
            </div>
          </details>
        </>
      ) : (
        storage
      )}
    </div>
  );
}
