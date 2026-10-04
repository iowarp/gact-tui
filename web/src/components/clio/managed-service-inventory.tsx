import type { ManagedServiceDefinition } from '@clio/core/v3';
import { useRef, type ReactNode } from 'react';
import { ChevronDownIcon, PlugIcon, ServerIcon, ArrowLeftIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useInfrastructureState } from '@/hooks/use-infrastructure-state';
import {
  ManagedServiceLogo,
  ManagedServiceState,
  VerificationState,
} from './managed-service-identity';
import { InfoTip } from './info-tip';

const groups = [
  { id: 'model_runtime', label: 'Inference' },
  { id: 'monitoring', label: 'Monitoring and provenance' },
  { id: 'supporting', label: 'Supporting services' },
] as const;
const groupFor = (service: ManagedServiceDefinition) =>
  ['model_runtime', 'monitoring'].includes(service.category) ? service.category : 'supporting';

/** Installed inventory first; deployment is a separate choose/configure flow. */
export function ManagedServiceInventory({
  endpoint,
  targetId,
  hostLabel,
  services,
  selected,
  onSelected,
  deploying,
  onDeploying,
  renderService,
  onConnectExisting,
  operations,
  loading,
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
  onConnectExisting?: () => void;
  operations: Record<string, string>;
  loading: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useInfrastructureState<Record<string, boolean>>(
    endpoint,
    `${targetId}:service-groups`,
    {},
  );
  const inventory = services.filter(
    (service) =>
      service.state === 'running' ||
      service.state === 'stopped' ||
      service.owned_resources?.length ||
      operations[service.id],
  );
  const current = services.find((service) => service.id === selected);
  const close = () => {
    onSelected('');
    onDeploying(false);
  };
  return (
    <section aria-label={`Services on ${hostLabel}`} className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Services</h2>
          <InfoTip label="About service management">
            Manage resources already installed on the selected host. Deploy new installs an owned
            runtime. Connect existing attaches a service that you manage elsewhere.
          </InfoTip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onConnectExisting} disabled={!onConnectExisting}>
            <PlugIcon />
            Connect existing service…
          </Button>
          <Button
            disabled={loading || !services.length}
            onClick={() => {
              onSelected('');
              onDeploying(true);
            }}
          >
            <AddIcon />
            Deploy new
          </Button>
        </div>
      </header>
      {!inventory.length && !loading ? (
        <div className="flex items-center gap-4 rounded-xl border border-dashed p-6">
          <ServerIcon className="size-7 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">No managed services on {hostLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Deploy a service or connect one you already run.
            </p>
          </div>
        </div>
      ) : null}
      {groups.map((group) => {
        const rows = inventory.filter((service) => groupFor(service) === group.id);
        if (!rows.length) return null;
        return (
          <Collapsible
            key={group.id}
            open={!collapsed[group.id]}
            onOpenChange={(open) =>
              setCollapsed((previous) => ({ ...previous, [group.id]: !open }))
            }
            className="rounded-xl border"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-4 text-left">
              <h3 className="text-sm font-semibold">
                {group.label} <span className="ml-2 text-muted-foreground">{rows.length}</span>
              </h3>
              <ChevronDownIcon
                aria-hidden="true"
                className={`size-4 transition-transform ${collapsed[group.id] ? '' : 'rotate-180'}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="divide-y border-t">
              {rows.map((service) => (
                <div key={service.id} className="flex flex-wrap items-center gap-3 p-4">
                  <ManagedServiceLogo service={service} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{service.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{hostLabel}</p>
                    <VerificationState service={service} />
                  </div>
                  <ManagedServiceState service={service} />
                  {operations[service.id] ? (
                    <span role="status" className="text-xs text-muted-foreground">
                      Operation in progress
                    </span>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Manage ${service.label}`}
                    onClick={() => {
                      onDeploying(false);
                      onSelected(service.id);
                    }}
                  >
                    Manage
                  </Button>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      <Dialog
        open={deploying || Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          onOpenAutoFocus={(event) => {
            if (!deploying) {
              event.preventDefault();
              dialog.current?.focus();
            }
          }}
          ref={dialog}
          tabIndex={-1}
        >
          <DialogHeader>
            <DialogTitle>
              {deploying
                ? current
                  ? `Set up ${current.label}`
                  : 'Deploy a service'
                : `Manage ${current?.label ?? 'service'}`}
            </DialogTitle>
            <DialogDescription>Execution host: {hostLabel}</DialogDescription>
          </DialogHeader>
          {deploying ? (
            <nav
              aria-label="Deployment steps"
              className="flex items-center gap-2 border-b pb-3 text-xs text-muted-foreground"
            >
              <span>1 · Host: {hostLabel}</span>
              <span aria-hidden="true">›</span>
              <span className={!current ? 'font-semibold text-foreground' : ''}>2 · Service</span>
              <span aria-hidden="true">›</span>
              <span className={current ? 'font-semibold text-foreground' : ''}>
                3 · Configure & install
              </span>
            </nav>
          ) : null}
          {deploying && !current ? (
            <div className="space-y-5">
              {groups.map((group) => (
                <section key={group.id}>
                  <h3 className="mb-2 text-sm font-semibold">{group.label}</h3>
                  <div className="space-y-2">
                    {services
                      .filter((service) => groupFor(service) === group.id)
                      .map((service) => (
                        <button
                          key={service.id}
                          aria-label={
                            inventory.some((row) => row.id === service.id)
                              ? `Manage ${service.label}`
                              : service.variants.some((row) => row.compatible)
                                ? `Set up ${service.label}`
                                : `Review ${service.label} requirements`
                          }
                          className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => {
                            onSelected(service.id);
                            if (inventory.some((row) => row.id === service.id)) onDeploying(false);
                          }}
                        >
                          <ManagedServiceLogo service={service} />
                          <span className="flex-1">
                            <span className="font-medium">{service.label}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {service.description}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {inventory.some((row) => row.id === service.id)
                              ? 'Manage'
                              : service.variants.some((row) => row.compatible)
                                ? 'Set up'
                                : 'Requirements'}
                          </span>
                        </button>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          ) : current ? (
            <>
              {deploying ? (
                <Button size="sm" variant="ghost" className="w-fit" onClick={() => onSelected('')}>
                  <ArrowLeftIcon />
                  Choose another service
                </Button>
              ) : null}
              {renderService(current, deploying)}
            </>
          ) : (
            <p role="status">Loading service…</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
