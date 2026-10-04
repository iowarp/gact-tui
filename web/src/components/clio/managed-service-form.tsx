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
import { ServerParametersForm } from './managed-service-parameters';
import { MonitoringImageStorage } from './monitoring-image-storage';

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
}: {
  service: ManagedServiceDefinition;
  configuration: Record<string, string>;
  variant: string;
  onVariant: (value: string) => void;
  onConfiguration: (field: string, value: string) => void;
  targetId?: string;
  hostLabel: string;
  storageOnly?: boolean;
}) {
  const fields = service.configuration_fields.filter(
    (field) => !field.variants?.length || field.variants.includes(variant),
  );
  const path = configuration['storage.service_directory'] || '';
  const storageOwned = Boolean(
    service.configuration['storage.service_directory'] && service.owned_resources?.length,
  );
  return (
    <div className="space-y-5">
      {!storageOnly ? (
        <>
          <Field>
            <FieldLabel>Deployment method</FieldLabel>
            <Select
              onValueChange={onVariant}
              value={variant}
              disabled={service.state === 'running' || service.state === 'stopped'}
            >
              <SelectTrigger aria-label={`${service.label} version`}>
                <SelectValue placeholder="Choose a deployment method" />
              </SelectTrigger>
              <SelectContent>
                {service.variants.map((item) => (
                  <SelectItem key={item.id} value={item.id} disabled={!item.compatible}>
                    {item.label} · {item.version}
                    {item.compatible ? '' : ' — unavailable'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {service.variants.some((item) => !item.compatible) ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Host compatibility
                <InfoTip label={`About ${service.label} compatibility`}>
                  {service.variants
                    .filter((item) => !item.compatible)
                    .map((item) => (
                      <p key={item.id}>
                        {item.label}: {item.reason}
                      </p>
                    ))}
                </InfoTip>
              </div>
            ) : null}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields
              .filter((field) => field.id !== 'image_storage')
              .map((field) => (
                <Field key={field.id}>
                  <FieldLabel>{field.label}</FieldLabel>
                  {field.options?.length ? (
                    <Select
                      onValueChange={(value) => onConfiguration(field.id, value)}
                      value={configuration[field.id]}
                      disabled={
                        storageOwned &&
                        service.category === 'monitoring' &&
                        field.id === 'container_runtime'
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
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      aria-label={`${service.label} ${field.label}`}
                      onChange={(event) => onConfiguration(field.id, event.target.value)}
                      placeholder={field.placeholder}
                      required={field.required}
                      value={configuration[field.id] ?? ''}
                    />
                  )}
                </Field>
              ))}
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
          <ServiceAccessChoice
            configuration={configuration}
            onConfiguration={onConfiguration}
            service={service}
          />
          <ServerParametersForm
            onChange={onConfiguration}
            parameters={service.parameters ?? []}
            serviceLabel={service.label}
            values={configuration}
            variant={variant}
          />
        </>
      ) : null}
      {service.category === 'monitoring' || variant.startsWith('native-cuda') ? (
        <Field>
          <div className="flex items-center gap-2">
            <FieldLabel>Service data on {hostLabel}</FieldLabel>
            <InfoTip label="About service storage">
              Choose a dedicated folder on this execution host. Databases, logs and evidence remain
              here when the runtime is removed. Container images use the selected image storage,
              checked separately. With Podman, Service folder also places images and downloads here.
              {storageOwned
                ? ' This deployment already owns its folder. Reinstall does not move existing data; choose storage when creating a deployment.'
                : ''}
            </InfoTip>
          </div>
          <div className="flex gap-2">
            <Input
              aria-label={`${service.label} service data on ${hostLabel}`}
              value={path}
              disabled={storageOwned}
              placeholder="Use this host’s configured service storage"
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
      ) : null}
    </div>
  );
}
