import type { ManagedServiceDefinition, ModelAcquisition } from '@clio/core/v3';
import { useRef, type ReactNode, type ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { PlugIcon, ServerIcon, ArrowLeftIcon } from 'lucide-react';
import { ManagedServiceCard, type ServiceActionFeedback } from './service-management-panel';
import { AddIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ManagedServiceLogo,
  ManagedServiceState,
  VerificationState,
} from './managed-service-identity';
import { InfoTip } from './info-tip';
import { ServiceMethodAvailability } from './service-installation-method';

const groups = [
  { id: 'model_runtime', label: 'Inference' },
  { id: 'monitoring', label: 'Monitoring and provenance' },
  { id: 'scientific_service', label: 'Web research' },
  { id: 'remote_access', label: 'Remote execution' },
] as const;
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
  onConnectExisting,
  operations,
  loading,
  unavailable = false,
  connectionFor,
  onRun,
  busyService,
  feedback = {},
  model,
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
  unavailable?: boolean;
  connectionFor?: (
    service: ManagedServiceDefinition,
  ) => ComponentProps<typeof ManagedServiceCard>['connectionAction'];
  onRun?: (service: ManagedServiceDefinition, action: 'start' | 'stop') => void;
  busyService?: string;
  feedback?: Record<string, ServiceActionFeedback>;
  model?: ModelAcquisition;
}) {
  const dialog = useRef<HTMLDivElement>(null);
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
          <h2 className="text-sm font-semibold">Services on {hostLabel}</h2>
          <InfoTip label="About service management">
            Manage resources already installed on the selected computer. Install service creates an
            owned runtime. Connect existing attaches a service that you manage elsewhere.
          </InfoTip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onConnectExisting} disabled={!onConnectExisting}>
            <PlugIcon />
            Connect existing service…
          </Button>
          <Button
            disabled={loading || unavailable || !services.length}
            onClick={() => {
              onSelected('');
              onDeploying(true);
            }}
          >
            <AddIcon />
            Install service
          </Button>
        </div>
      </header>
      {!inventory.length && !loading && !unavailable ? (
        <div className="flex items-center gap-4 border-y py-6">
          <ServerIcon className="size-7 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">No managed services on {hostLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Install a service or connect one you already run.
            </p>
          </div>
        </div>
      ) : null}
      {groups.map((group) => {
        const rows = inventory.filter((service) => groupFor(service) === group.id);
        if (!rows.length) return null;
        return (
          <section key={group.id}>
            <h3 className="text-xs font-medium text-muted-foreground">
              {group.label} · {rows.length}
            </h3>
            <div className="divide-y border-b">
              {rows.map((service) => {
                const connection = connectionFor?.(service);
                return (
                  <div key={service.id} className="flex flex-wrap items-center gap-3 py-4">
                    <ManagedServiceLogo service={service} />
                    <div className="min-w-0 flex-1">
                      <button
                        className="font-medium hover:underline underline-offset-4"
                        onClick={() => {
                          onDeploying(false);
                          onSelected(service.id);
                        }}
                      >
                        {service.label}
                      </button>
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                      {feedback[service.id]?.error ? (
                        <p role="alert" className="text-xs text-destructive">
                          {feedback[service.id].text}
                        </p>
                      ) : null}
                      <VerificationState service={service} />
                    </div>
                    <ManagedServiceState service={service} />
                    {connection?.connected !== undefined ? (
                      <span
                        className="text-xs text-muted-foreground"
                        title={`Connection makes this service available to ${vocab.agent}. Its runtime can be stopped separately.`}
                      >
                        {connection.connected
                          ? `Connected to ${vocab.agent}`
                          : `Not connected to ${vocab.agent}`}
                      </span>
                    ) : null}
                    {service.id === 'searxng' ? (
                      <span
                        className="text-xs text-muted-foreground"
                        title={`The local ${vocab.agent} uses its built-in SearXNG automatically. A remote SearXNG installation is not automatically selected for this agent.`}
                      >
                        {targetId === 'local'
                          ? 'Built-in search engine'
                          : `Not connected to ${vocab.agent}`}
                      </span>
                    ) : null}
                    {connection?.to ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={connection.to}>{connection.label}</Link>
                      </Button>
                    ) : connection?.onSelect ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={connection.pending || Boolean(connection.blockedReason)}
                        title={connection.blockedReason}
                        onClick={connection.onSelect}
                      >
                        {connection.label}
                      </Button>
                    ) : null}
                    {onRun &&
                    (service.state === 'running'
                      ? service.supports_stop
                      : service.state === 'stopped') ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyService === service.id || Boolean(operations[service.id])}
                        onClick={() =>
                          onRun(service, service.state === 'running' ? 'stop' : 'start')
                        }
                      >
                        {busyService === service.id
                          ? 'Working…'
                          : service.state === 'running'
                            ? 'Stop'
                            : 'Start'}
                      </Button>
                    ) : null}
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
                );
              })}
            </div>
          </section>
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
            {deploying && !current ? (
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
                          .filter((service) => groupFor(service) === group.id)
                          .map((service) => (
                            <button
                              key={service.id}
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
  if (service.id === 'llama_cpp' && !model.file_path?.endsWith('.gguf'))
    return 'llama.cpp needs a GGUF file. This download does not identify one.';
  if (service.id === 'ollama') return 'Import these files into Ollama before serving them there.';
  if (service.id === 'model_router')
    return 'The router connects running model servers; it does not load downloaded files.';
  return undefined;
}
