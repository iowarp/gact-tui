import type { GpuFact, ManagedServiceDefinition, ModelAcquisition } from '@clio/core/v3';
import { useState, type ReactNode } from 'react';
import { ArrowLeftIcon, PackageIcon, ServerIcon } from 'lucide-react';
import { type ServiceActionFeedback } from './service-management-panel';
import { ServiceFooterSlot } from './service-footer-slot';
import { AddIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DialogFrame } from './primitives/dialog-frame';
import { KeyValueGrid } from './primitives/key-value-grid';
import { ItemList, ItemRow } from './primitives/item-row';
import { InfraSearchField } from './infrastructure-filter-menu';
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
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);
  // The engine whose "Add instance" name field is open, and where.
  const [naming, setNaming] = useState<{ id: string; where: 'inventory' | 'chooser' }>();
  // The chooser lists only engines that take a named instance.
  const [namedOnly, setNamedOnly] = useState(false);
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
    setNamedOnly(false);
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
      <DialogFrame
        cancelLabel={deploying ? 'Cancel' : 'Done'}
        className="flex flex-col overflow-hidden [&>[data-slot=dialog-frame-body]]:min-h-0 [&>[data-slot=dialog-frame-body]]:flex-1 [&>[data-slot=dialog-frame-body]]:overflow-y-auto [&>[data-slot=dialog-frame-body]]:pl-[18px] [&>[data-slot=dialog-frame-footer]]:border-t [&>[data-slot=dialog-frame-footer]]:border-border [&>[data-slot=dialog-frame-footer]]:pt-3.5"
        footerStart={
          deploying ? (
            current ? (
              <Button className="-ml-2" onClick={() => onSelected('')} variant="ghost">
                <ArrowLeftIcon />
                Back
              </Button>
            ) : services.some(
                (service) =>
                  canAddInstance(service) && service.variants.some((row) => row.compatible),
              ) ? (
              <Button
                aria-pressed={namedOnly}
                className="-ml-2"
                onClick={() => {
                  setNaming(undefined);
                  setNamedOnly(!namedOnly);
                }}
                variant="ghost"
              >
                {namedOnly ? <ArrowLeftIcon /> : <AddIcon />}
                {namedOnly ? 'All services' : 'Add named instance'}
              </Button>
            ) : null
          ) : (
            <div className="-ml-1.5 flex items-center gap-0.5" ref={setFooterSlot} />
          )
        }
        icon={
          !current ? (
            <PackageIcon />
          ) : (
            (() => {
              const GroupIcon =
                SERVICE_GROUPS.find((group) => group.id === groupFor(current))?.icon ?? ServerIcon;
              return <GroupIcon />;
            })()
          )
        }
        onOpenChange={(open) => {
          if (!open) close();
        }}
        open={deploying || Boolean(selected)}
        srDescription={`Computer: ${hostLabel}`}
        title={
          deploying
            ? current
              ? `Set up ${current.label}`
              : 'Install a service'
            : `${current?.label ?? 'Service'} on ${hostLabel}`
        }
      >
        <ServiceFooterSlot.Provider value={deploying ? null : footerSlot}>
          {deploying ? (
            <>
              <nav
                aria-label="Deployment steps"
                className="mb-2 flex h-6 items-center gap-2 text-[12px] text-muted-foreground"
              >
                <DeployStep done={Boolean(current)} on={!current} step={1}>
                  Choose service
                </DeployStep>
                <span aria-hidden="true">›</span>
                <DeployStep on={Boolean(current)} step={2}>
                  Install
                </DeployStep>
              </nav>
              <KeyValueGrid
                className="-mx-2 mb-2"
                items={[
                  {
                    label: 'Computer',
                    icon: <ServerIcon aria-hidden="true" />,
                    value: hostLabel,
                    title: hostLabel,
                  },
                ]}
                variant="card"
              />
            </>
          ) : null}
          <div className="pb-1">
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
              <ServiceChooser
                addInstance={(service) => addInstance(service, 'chooser')}
                canAddInstance={canAddInstance}
                inventory={inventory}
                model={model}
                naming={naming?.where === 'chooser' ? naming.id : undefined}
                namedOnly={namedOnly}
                onManage={(id) => {
                  onSelected(id);
                  onDeploying(false);
                }}
                onName={(id) => setNaming({ id, where: 'chooser' })}
                onSetUp={onSelected}
                services={services}
              />
            ) : current ? (
              renderService(current, deploying)
            ) : (
              <p role="status">Loading service…</p>
            )}
          </div>
        </ServiceFooterSlot.Provider>
      </DialogFrame>
    </section>
  );
}

/** Step 1 of Install: one compact row per service, grouped, with a search field. */
function ServiceChooser({
  services,
  inventory,
  model,
  namedOnly,
  naming,
  canAddInstance,
  addInstance,
  onSetUp,
  onManage,
  onName,
}: {
  services: ManagedServiceDefinition[];
  inventory: ManagedServiceDefinition[];
  model?: ModelAcquisition;
  namedOnly: boolean;
  naming?: string;
  canAddInstance: (service: ManagedServiceDefinition) => boolean;
  addInstance: (service: ManagedServiceDefinition) => ReactNode;
  onSetUp: (id: string) => void;
  onManage: (id: string) => void;
  onName: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = services.filter(
    (service) =>
      // Instances not on this computer are set up through Add named instance.
      (!instanceName(service) || inventory.some((row) => row.id === service.id)) &&
      (!model || groupFor(service) === 'model_runtime') &&
      (!namedOnly || (canAddInstance(service) && service.variants.some((row) => row.compatible))) &&
      (!needle || `${service.label} ${service.description}`.toLowerCase().includes(needle)),
  );
  return (
    <div className="flex flex-col gap-2">
      <InfraSearchField
        className="w-full"
        label="Search services"
        onValueChange={setQuery}
        placeholder="Search services"
        value={query}
      />
      {namedOnly ? (
        <p className="text-xs text-muted-foreground">
          Choose the engine for the new named instance.
        </p>
      ) : null}
      {!shown.length ? (
        <StateView kind="empty" size="row" title={`No services match “${query.trim()}”`} />
      ) : null}
      {groups.map((group) => {
        const rows = shown.filter((service) => groupFor(service) === group.id);
        if (!rows.length) return null;
        const GroupIcon = group.icon ?? ServerIcon;
        return (
          <ItemList key={group.id} label={group.label}>
            <h3 className="px-2 pt-1 pb-0.5 text-[11.5px] font-medium text-muted-foreground">
              {group.label}
            </h3>
            {rows.map((service) => {
              const installed = inventory.some((row) => row.id === service.id);
              const requirement = model ? modelRuntimeRequirement(service, model) : undefined;
              const compatible = service.variants.some((row) => row.compatible);
              const reason =
                requirement ??
                (compatible
                  ? undefined
                  : service.variants.find((row) => row.id === service.recommended_variant)
                      ?.reason || service.variants[0]?.reason);
              const blocked = Boolean(requirement) || (!installed && !compatible);
              return (
                <div key={service.id}>
                  <ItemRow
                    className={cn('border-b-0 rounded-md', blocked && '[&>span]:opacity-55')}
                    icon={<GroupIcon />}
                    meta={reason ?? service.description}
                    size="sm"
                    slot={
                      blocked ? (
                        <span className="text-xs text-faint" title={reason}>
                          Unavailable
                        </span>
                      ) : namedOnly ? (
                        <Button
                          aria-label={`Add ${service.label} instance`}
                          onClick={() => onName(service.id)}
                          size="sm"
                          variant="outline"
                        >
                          Name…
                        </Button>
                      ) : (
                        <Button
                          aria-label={`${installed ? 'Manage' : 'Set up'} ${service.label}`}
                          onClick={() => (installed ? onManage(service.id) : onSetUp(service.id))}
                          size="sm"
                          variant="outline"
                        >
                          {installed ? 'Manage' : 'Set up'}
                        </Button>
                      )
                    }
                    slotWidth={96}
                    title={service.label}
                  />
                  {naming === service.id ? (
                    <div className="pt-1 pb-2 pl-[2.375rem]">{addInstance(service)}</div>
                  ) : null}
                </div>
              );
            })}
          </ItemList>
        );
      })}
    </div>
  );
}
/** One numbered step of the install crumb: the current one in the text tone. */
function DeployStep({
  step,
  on,
  done = false,
  children,
}: {
  step: number;
  on: boolean;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      aria-current={on ? 'step' : undefined}
      className={cn('inline-flex items-center gap-1.5', on && 'font-medium text-foreground')}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-4 place-items-center rounded-full border text-[10px] tabular-nums',
          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
          done && 'border-primary/60 text-primary',
        )}
      >
        {step}
      </span>
      {children}
    </span>
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
