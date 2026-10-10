import type {
  InfrastructureOperation,
  ManagedServiceDefinition,
  ServiceActionInput,
} from '@clio/core/v3';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { InfoTip } from './info-tip';
import { InstallExpectation } from './install-expectation';
import { ServiceAccessLine } from './managed-service-access';
import { EffectiveParameters, OwnedResources } from './managed-service-parameters';
import { ManagedServiceForm } from './managed-service-form';
import { ManagedServiceReceipt } from './managed-service-receipt';
import { OperationProgress } from './operation-progress';
import {
  ManagedServiceLogo,
  ManagedServiceState,
  VerificationState,
} from './managed-service-identity';

export type ServiceAction = ServiceActionInput['action'];
export type ServiceActionFeedback = {
  action: ServiceAction;
  error?: boolean;
  text: string;
  /** The finished operation, whose steps, reuse notes and log stay viewable. */
  operationId?: string;
};
export type ServiceActionOptions = {
  /** Bypass every reuse check for this install (`install.from_scratch`). */
  fromScratch?: boolean;
};

/** Definition-driven setup and resource management with separate lifecycle verbs. */
export function ManagedServiceCard({
  activeAction,
  connectionAction,
  connectionStatus,
  configuration,
  onAction,
  onCancel,
  onConfiguration,
  onVariant,
  operation,
  progress,
  result,
  service,
  variant,
  tab,
  onTab,
  targetId,
  hostLabel = 'this execution host',
  setup = false,
}: {
  activeAction?: ServiceAction;
  connectionAction?: {
    blockedReason?: string;
    label: string;
    onSelect?: () => void;
    pending?: boolean;
    to?: string;
  };
  connectionStatus?: ReactNode;
  configuration: Record<string, string>;
  onAction: (action: ServiceAction, options?: ServiceActionOptions) => void;
  onCancel?: () => void;
  onConfiguration: (field: string, value: string) => void;
  onVariant: (value: string) => void;
  /** The running operation, when CLIO reported one: its live progress is shown. */
  operation?: { id: string; initial?: InfrastructureOperation };
  progress?: string;
  result?: ServiceActionFeedback;
  service: ManagedServiceDefinition;
  variant: string;
  tab?: string;
  onTab?: (value: string) => void;
  targetId?: string;
  hostLabel?: string;
  setup?: boolean;
}) {
  const [localTab, setLocalTab] = useState('status');
  const [confirmation, setConfirmation] = useState<ServiceAction>();
  const [fromScratch, setFromScratch] = useState(false);
  /** Seconds the last finished install took when it reused nothing (a measured expectation). */
  const [lastInstallSeconds, setLastInstallSeconds] = useState<number>();
  const confirm = (action: ServiceAction, scratch = false) => {
    setFromScratch(scratch);
    setConfirmation(action);
  };
  const installing = activeAction === 'install' || activeAction === 'reinstall';
  const expectation = { thing: service.label, lastSeconds: lastInstallSeconds };
  const native = variant.startsWith('native-cuda');
  const monitoring = service.category === 'monitoring';
  const retainsData = native || monitoring;
  const installed =
    Boolean(service.observation?.installed) ||
    service.state === 'running' ||
    service.state === 'stopped';
  const recorded = (service.owned_resources ?? []).length > 0;
  const compatible = service.variants.some((item) => item.id === variant && item.compatible);
  const fields = service.configuration_fields.filter(
    (field) => !field.variants?.length || field.variants.includes(variant),
  );
  const missing = fields.some((field) => field.required && !configuration[field.id]?.trim());
  const activeTab = tab ?? localTab;
  const selectTab = (value: string) => {
    setLocalTab(value);
    onTab?.(value);
  };
  const editing = setup || (!installed && !recorded);
  const changed = Object.entries(configuration).some(
    ([key, value]) => value !== (service.configuration[key] ?? ''),
  );
  const labels: Record<ServiceAction, string> = {
    install: 'Install',
    start: 'Start',
    status: 'Check status',
    logs: 'View logs',
    stop: 'Stop',
    reinstall: 'Apply configuration',
    uninstall: retainsData ? 'Remove runtime' : 'Uninstall',
    delete_data: 'Delete retained data',
    verify: 'Verify setup',
  };
  const progressLabels: Record<ServiceAction, string> = {
    install: 'Installing…',
    start: 'Starting…',
    status: 'Checking…',
    logs: 'Loading logs…',
    stop: 'Stopping…',
    reinstall: 'Applying…',
    uninstall: 'Removing…',
    delete_data: 'Deleting retained data…',
    verify: 'Verifying…',
  };
  const act = (action: ServiceAction) => (
    <Button
      key={action}
      size="sm"
      variant={['install', 'start', 'verify'].includes(action) ? 'default' : 'outline'}
      disabled={
        Boolean(activeAction) ||
        (!compatible && ['install', 'reinstall', 'start'].includes(action)) ||
        (missing && ['install', 'reinstall'].includes(action))
      }
      onClick={() =>
        ['uninstall', 'delete_data', 'reinstall'].includes(action)
          ? confirm(action)
          : onAction(action)
      }
    >
      {activeAction === action ? <Spinner aria-hidden="true" /> : null}
      {activeAction === action ? progressLabels[action] : labels[action]}
    </Button>
  );
  const form = (
    <ManagedServiceForm
      service={service}
      configuration={configuration}
      variant={variant}
      onVariant={onVariant}
      onConfiguration={onConfiguration}
      targetId={targetId}
      hostLabel={hostLabel}
    />
  );
  return (
    <article aria-label={`${service.label} management`} className="min-w-0 space-y-5">
      <header className="flex items-start gap-3">
        <ManagedServiceLogo service={service} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{service.label}</h3>
            <ManagedServiceState service={service} />
            <VerificationState service={service} />
            <InfoTip label={`About ${service.label}`}>
              {service.description}
              {native
                ? ' Install prepares the pinned environment. Start loads the model. Removal retains models and evidence.'
                : ''}
            </InfoTip>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Runs on {hostLabel}</p>
        </div>
      </header>
      {editing ? (
        <>
          {form}
          {!compatible ? (
            <p role="status" className="text-sm text-destructive">
              Not available on this target.{' '}
              {service.variants.find((row) => row.id === variant)?.reason ||
                service.variants[0]?.reason}
            </p>
          ) : null}
          <div className="flex gap-2">{act('install')}</div>
        </>
      ) : (
        <Tabs value={activeTab} onValueChange={selectTab}>
          <TabsList
            className="w-full justify-start overflow-x-auto overflow-y-hidden"
            aria-label={`${service.label} management tabs`}
          >
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
          </TabsList>
          <TabsContent value="status" className="space-y-4 pt-3">
            {connectionStatus}
            {service.connection_url && service.state === 'running' ? (
              <p className="break-all font-mono text-xs text-muted-foreground">
                {service.connection_url}
              </p>
            ) : null}
            {service.access ? <ServiceAccessLine access={service.access} /> : null}
            <div className="flex flex-wrap gap-2">
              {service.state === 'running' ? (
                <>
                  {monitoring ? act('verify') : null}
                  {service.supports_stop ? act('stop') : null}
                </>
              ) : installed ? (
                act('start')
              ) : retainsData && service.observation?.phase === 'not_installed' ? (
                act('install')
              ) : null}
              {act('status')}
              {connectionAction?.to ? (
                <Button asChild size="sm">
                  <Link to={connectionAction.to}>{connectionAction.label}</Link>
                </Button>
              ) : connectionAction ? (
                <Button
                  size="sm"
                  disabled={connectionAction.pending || Boolean(connectionAction.blockedReason)}
                  onClick={connectionAction.onSelect}
                >
                  {connectionAction.pending ? <Spinner aria-hidden="true" /> : null}
                  {connectionAction.label}
                </Button>
              ) : null}
            </div>
            {connectionAction?.blockedReason ? (
              <p role="alert" className="text-sm text-destructive">
                {connectionAction.blockedReason}
              </p>
            ) : null}
            <ManagedServiceReceipt service={service} />
          </TabsContent>
          <TabsContent value="configuration" className="space-y-5 pt-3">
            {form}
            {installed ? (
              <div className="flex flex-wrap items-center gap-2">
                {act('reinstall')}
                <Button
                  disabled={Boolean(activeAction) || !compatible || missing}
                  onClick={() => confirm('reinstall', true)}
                  size="sm"
                  variant="outline"
                >
                  Reinstall from scratch
                </Button>
                <InfoTip label="About applying service configuration">
                  Applying configuration stops and replaces this runtime. Verify setup again
                  afterward. Keep using the existing configuration until you apply your edits.
                </InfoTip>
                {changed ? (
                  <span className="text-xs text-muted-foreground">Unapplied changes</span>
                ) : null}
              </div>
            ) : (
              act('install')
            )}
            <EffectiveParameters
              rows={service.effective_parameters ?? []}
              serviceLabel={service.label}
            />
          </TabsContent>
          <TabsContent value="logs" className="space-y-3 pt-3">
            {act('logs')}
            {result?.action === 'logs' ? (
              <section aria-label={`${service.label} recent logs`} className="rounded-lg border">
                <p className="border-b p-3 text-xs font-medium">Recent logs</p>
                <pre
                  aria-live="polite"
                  className="clio-scrollbar max-h-80 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-5"
                >
                  {result.text}
                </pre>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">Load recent logs from {hostLabel}.</p>
            )}
          </TabsContent>
          <TabsContent value="storage" className="space-y-4 pt-3">
            {service.configuration['storage.service_directory'] ? (
              <div>
                <p className="text-xs text-muted-foreground">Service data on {hostLabel}</p>
                <p className="break-all font-mono text-sm">
                  {service.configuration['storage.service_directory']}
                </p>
              </div>
            ) : null}
            {service.observation?.evidence_directory ? (
              <div>
                <p className="text-xs text-muted-foreground">Retained evidence</p>
                <p className="break-all font-mono text-sm">
                  {service.observation.evidence_directory}
                </p>
              </div>
            ) : null}
            {service.configuration['storage.container_images'] ? (
              <div>
                <p className="text-xs text-muted-foreground">Container images on {hostLabel}</p>
                <p className="break-all font-mono text-sm">
                  {service.configuration['storage.container_images']}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Download scratch space</p>
                <p className="break-all font-mono text-sm">
                  {service.configuration['storage.container_downloads']}
                </p>
              </div>
            ) : null}
            <OwnedResources
              rows={service.owned_resources ?? []}
              serviceLabel={service.label}
              retained={retainsData}
            />
            <div className="flex flex-wrap gap-2">
              {installed || (recorded && service.observation?.phase !== 'not_installed')
                ? act('uninstall')
                : null}
              {retainsData &&
              recorded &&
              !installed &&
              service.observation?.phase === 'not_installed'
                ? act('delete_data')
                : null}
            </div>
          </TabsContent>
        </Tabs>
      )}
      {activeAction && operation ? (
        <OperationProgress
          expectation={installing ? expectation : undefined}
          fallbackProgress={progress}
          initial={operation.initial}
          key={operation.id}
          onCancel={onCancel}
          operationId={operation.id}
          title={`${service.label} ${labels[activeAction].toLowerCase()}`}
        />
      ) : activeAction ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <p aria-live="polite" role="status" className="text-sm text-muted-foreground">
              {progress || progressLabels[activeAction]}
            </p>
            {onCancel ? (
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel operation
              </Button>
            ) : null}
          </div>
          {installing ? <InstallExpectation {...expectation} /> : null}
        </div>
      ) : result?.operationId && ['install', 'reinstall'].includes(result.action) ? (
        <OperationProgress
          key={result.operationId}
          onReinstallFromScratch={
            compatible && !missing
              ? (finished) => {
                  setLastInstallSeconds(
                    finished?.state === 'succeeded' && !finished.reused?.length
                      ? finished.elapsed_seconds
                      : undefined,
                  );
                  confirm(installed ? 'reinstall' : 'install', true);
                }
              : undefined
          }
          operationId={result.operationId}
          title={`${service.label} ${labels[result.action].toLowerCase()}`}
        />
      ) : null}
      {result && result.action !== 'logs' ? (
        <p
          role={result.error ? 'alert' : 'status'}
          aria-live="polite"
          className={
            result.error
              ? 'border-l-2 border-destructive pl-3 text-sm text-destructive'
              : 'border-l-2 border-primary/50 pl-3 text-sm text-muted-foreground'
          }
        >
          {result.text}
        </p>
      ) : null}
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {fromScratch
                ? `Reinstall ${service.label} from scratch?`
                : confirmation === 'delete_data'
                ? `Delete retained ${service.label} data?`
                : confirmation === 'reinstall'
                  ? `Apply ${service.label} configuration?`
                  : `Remove ${service.label} runtime?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {fromScratch
                ? 'This installs again without reusing anything already on the host: images are pulled, environments rebuilt and models downloaded again. It can take much longer.'
                : confirmation === 'delete_data'
                ? 'This permanently deletes this deployment’s databases, environment cache, logs and captured evidence. Separately downloaded models are retained.'
                : confirmation === 'reinstall'
                  ? 'This stops and reinstalls the runtime on the selected host. Existing verification expires; run Verify setup again afterward.'
                  : retainsData
                    ? 'Stop and remove the runtime, retaining its databases, models, logs and evidence.'
                    : 'Stop and remove this deployment and the resources listed under Storage.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {fromScratch || confirmation === 'reinstall' ? (
            <InstallExpectation {...expectation} />
          ) : null}
          <p className="break-all font-mono text-xs">
            {hostLabel} {service.configuration['storage.service_directory']}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {confirmation === 'delete_data' ? 'Keep data' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmation) {
                  onAction(confirmation, fromScratch ? { fromScratch: true } : undefined);
                }
                setConfirmation(undefined);
                setFromScratch(false);
              }}
            >
              {fromScratch
                ? 'Reinstall from scratch'
                : confirmation
                  ? labels[confirmation]
                  : 'Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
