import type { GpuFact, ManagedServiceDefinition, ModelAcquisition } from '@clio/core/v3';
import { useRef, useState, type ReactNode } from 'react';
import { ServerIcon, ArrowLeftIcon } from 'lucide-react';
import { type ServiceActionFeedback } from './service-management-panel';
import { AddIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ManagedServiceLogo } from './managed-service-identity';
import { ServiceMethodAvailability } from './service-installation-method';
import { AddInstanceForm } from './managed-service-instance';
import { engineId, instanceName } from './managed-service-gpus';
import { InfraList } from './infrastructure-row';
import { StateView } from './primitives/state-view';
import {
  ManagedServiceInventoryRow,
  type ServiceConnection,
  type ServicePanelTab,
  type ServiceRowAction,
} from './managed-service-inventory-row';
import { SERVICE_COLUMNS, SERVICE_GROUPS } from './managed-service-groups';

const groups = SERVICE_GROUPS;
const groupFor = (service: ManagedServiceDefinition) => service.category;

/** Installed inventory first; deployment is a separate choose/configure flow. */
export function ManagedServiceInventory({
  targetId,
  hostLabel,
  services,
  selected,
  onSelected,
  deploying,
  onDeploying,
  renderService,
  onEditWebSearch,
  onOpenTab,
  operations,
  loading,
  unavailable = false,
  connectionFor,
  onRun,
  busyService,
  feedback = {},
  model,
  gpus = [],
  onAddInstance,
}: {
  endpoint: string;
  targetId: string;
  hostLabel: string;
  services: ManagedServiceDefinition[];
  selected: string;
  onSelected: (id: string) => void;
  deploying: boolean;
  onDeploying: (value: boolean) => void;
  renderService: (service: ManagedServiceDefinition, setup: boolean) => ReactNode;
  /** Opens the agent's Web Search connection settings. */
  onEditWebSearch?: () => void;
  /** Opens a service's management panel on one tab. */
  onOpenTab?: (serviceId: string, tab: ServicePanelTab) => void;
  operations: Record<string, string>;
  loading: boolean;
  unavailable?: boolean;
  connectionFor?: (service: ManagedServiceDefinition) => ServiceConnection;
  onRun?: (service: ManagedServiceDefinition, action: ServiceRowAction) => void;
  busyService?: string;
  feedback?: Record<string, ServiceActionFeedback>;
  model?: ModelAcquisition;
  /** The host's GPUs; each GPU deployment's row names the ones it uses. */
  gpus?: GpuFact[];
  /** Set up a named instance (`<engine>@<name>`) of an engine that supports them. */
  onAddInstance?: (service: ManagedServiceDefinition, name: string) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  // The engine whose "Add instance" name field is open, and where.
  const [naming, setNaming] = useState<{ id: string; where: 'inventory' | 'chooser' }>();
  const inventory = services.filter(
    (service) =>
      service.state === 'running' ||
      service.state === 'stopped' ||
      service.owned_resources?.length ||
      operations[service.id],
  );
  const current = services.find((service) => service.id === selected);
  const close = () => {
    setNaming(undefined);
    onSelected('');
    onDeploying(false);
  };
  const canAddInstance = (service: ManagedServiceDefinition) =>
    Boolean(onAddInstance && service.supports_instances && !instanceName(service));
  const addInstance = (service: ManagedServiceDefinition, where: 'inventory' | 'chooser') =>
    naming?.id === service.id && naming.where === where ? (
      <AddInstanceForm
        existing={inventory.map((row) => row.id)}
        onCancel={() => setNaming(undefined)}
        onSubmit={(name) => {
          setNaming(undefined);
          onAddInstance?.(service, name);
        }}
        service={service}
      />
    ) : null;
  return (
    <section aria-label={`Services on ${hostLabel}`} className="flex min-w-0 flex-col gap-3">
      {!inventory.length && !loading && !unavailable ? (
        <StateView
          detail="Install a service or connect one you already run."
          icon={ServerIcon}
          kind="empty"
          size="panel"
          title={`No managed services on ${hostLabel}`}
        />
      ) : null}
      {SERVICE_GROUPS.map((group) => {
        const rows = inventory.filter((service) => groupFor(service) === group.id);
        if (!rows.length) return null;
        return (
          <InfraList heading={group.label} key={group.id} {...SERVICE_COLUMNS}>
            {rows.map((service) => {
              const manage = () => {
                onDeploying(false);
                onSelected(service.id);
              };
              return (
                <ManagedServiceInventoryRow
                  addInstanceForm={addInstance(service, 'inventory')}
                  busy={busyService === service.id}
                  canAddInstance={canAddInstance(service)}
                  connection={connectionFor?.(service)}
                  feedback={feedback[service.id]}
                  gpus={gpus}
                  hostLabel={hostLabel}
                  key={service.id}
                  onAddInstance={() => setNaming({ id: service.id, where: 'inventory' })}
                  onEditWebSearch={service.id === 'web_search' ? onEditWebSearch : undefined}
                  onManage={manage}
                  onOpenTab={(tab) => {
                    onOpenTab?.(service.id, tab);
                    manage();
                  }}
                  onRun={onRun ? (requested) => onRun(service, requested) : undefined}
                  operation={operations[service.id]}
                  service={service}
                  targetId={targetId}
                />
              );
            })}
          </InfraList>
        );
      })}
      <Dialog
        open={deploying || Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl"
          onOpenAutoFocus={(event) => {
            if (!deploying) {
              event.preventDefault();
              dialog.current?.focus();
            }
          }}
          ref={dialog}
          tabIndex={-1}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {deploying
                ? current
                  ? `Set up ${current.label}`
                  : 'Install a service'
                : `Manage ${current?.label ?? 'service'}`}
            </DialogTitle>
            <DialogDescription>Computer: {hostLabel}</DialogDescription>
          </DialogHeader>
          {deploying ? (
            <nav
              aria-label="Deployment steps"
              className="flex items-center gap-2 border-b pb-3 text-xs text-muted-foreground"
            >
              <span className={!current ? 'font-semibold text-foreground' : ''}>
                Choose service
              </span>
              <span aria-hidden="true">›</span>
              <span className={current ? 'font-semibold text-foreground' : ''}>Install</span>
            </nav>
          ) : null}
          <div className="min-h-0 overflow-y-auto pr-1">
            {model && deploying ? (
              <p className="mb-4 text-sm">
                Choose a runtime for <strong>{model.repository}</strong>. Model files stay on{' '}
                {hostLabel}.
              </p>
            ) : null}
            {deploying && !current && !services.length ? (
              loading ? (
                <StateView
                  detail="Installable services appear once the computer answers."
                  kind="loading"
                  size="panel"
                  title={`Inspecting ${hostLabel}`}
                />
              ) : (
                <StateView
                  detail={
                    unavailable
                      ? 'Try again from the Services tab, then install.'
                      : 'Inspect the computer again from the Services tab, then install.'
                  }
                  kind="unavailable"
                  size="panel"
                  title={
                    unavailable
                      ? `Could not inspect ${hostLabel}`
                      : `No installable services found on ${hostLabel}`
                  }
                />
              )
            ) : deploying && !current ? (
              <div className="space-y-5">
                {groups
                  .filter(
                    (group) =>
                      (!model || group.id === 'model_runtime') &&
                      services.some((service) => groupFor(service) === group.id),
                  )
                  .map((group) => (
                    <section key={group.id}>
                      <h3 className="mb-2 text-sm font-semibold">{group.label}</h3>
                      <div className="space-y-2">
                        {services
                          .filter(
                            (service) =>
                              groupFor(service) === group.id &&
                              // Instances not on this computer are set up through Add instance.
                              (!instanceName(service) ||
                                inventory.some((row) => row.id === service.id)),
                          )
                          .map((service) => (
                            <div key={service.id}>
                              <button
                                aria-label={
                                  inventory.some((row) => row.id === service.id)
                                    ? `Manage ${service.label}`
                                    : service.variants.some((row) => row.compatible)
                                      ? `Set up ${service.label}`
                                      : `${service.label} unavailable`
                                }
                                disabled={
                                  (!inventory.some((row) => row.id === service.id) &&
                                    !service.variants.some((row) => row.compatible)) ||
                                  Boolean(model && modelRuntimeRequirement(service, model))
                                }
                                className="flex w-full items-center gap-3 border-b py-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-100 disabled:[&_svg]:opacity-40"
                                onClick={() => {
                                  onSelected(service.id);
                                  if (inventory.some((row) => row.id === service.id))
                                    onDeploying(false);
                                }}
                              >
                                <ManagedServiceLogo service={service} />
                                <span className="flex-1">
                                  <span className="font-medium">{service.label}</span>
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {service.description}
                                  </span>
                                  <ServiceMethodAvailability service={service} />
                                  {model && modelRuntimeRequirement(service, model) ? (
                                    <span className="mt-1 block text-xs text-warning-foreground">
                                      {modelRuntimeRequirement(service, model)}
                                    </span>
                                  ) : !service.variants.some((row) => row.compatible) ? (
                                    <span className="mt-1 block text-xs text-warning-foreground">
                                      {service.variants.find(
                                        (row) => row.id === service.recommended_variant,
                                      )?.reason || service.variants[0]?.reason}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {inventory.some((row) => row.id === service.id)
                                    ? 'Manage'
                                    : service.variants.some((row) => row.compatible)
                                      ? 'Set up'
                                      : 'Unavailable'}
                                </span>
                              </button>
                              {canAddInstance(service) &&
                              service.variants.some((row) => row.compatible) &&
                              !(model && modelRuntimeRequirement(service, model)) ? (
                                naming?.id === service.id && naming.where === 'chooser' ? (
                                  <div className="border-b py-3 pl-[3.25rem]">
                                    {addInstance(service, 'chooser')}
                                  </div>
                                ) : (
                                  <Button
                                    aria-label={`Add ${service.label} instance`}
                                    className="mt-1 ml-[3.25rem]"
                                    onClick={() => setNaming({ id: service.id, where: 'chooser' })}
                                    size="sm"
                                    variant="ghost"
                                  >
                                    <AddIcon />
                                    Add named instance
                                  </Button>
                                )
                              ) : null}
                            </div>
                          ))}
                      </div>
                    </section>
                  ))}
              </div>
            ) : current ? (
              <>
                {deploying ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-fit"
                    onClick={() => onSelected('')}
                  >
                    <ArrowLeftIcon />
                    Choose another service
                  </Button>
                ) : null}
                {renderService(current, deploying)}
              </>
            ) : (
              <p role="status">Loading service…</p>
            )}
          </div>
          <div className="shrink-0 border-t pt-3">
            <Button size="sm" variant="ghost" onClick={close}>
              <ArrowLeftIcon />
              Back to services
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Files a runtime can actually load, separate from whether the computer can run it. */
function modelRuntimeRequirement(
  service: ManagedServiceDefinition,
  model: ModelAcquisition,
): string | undefined {
  const engine = engineId(service);
  if (engine === 'llama_cpp' && !model.file_path?.endsWith('.gguf'))
    return 'llama.cpp needs a GGUF file. This download does not identify one.';
  if (engine === 'ollama') return 'Import these files into Ollama before serving them there.';
  if (service.id === 'model_router')
    return 'The router connects running model servers; it does not load downloaded files.';
  return undefined;
}
