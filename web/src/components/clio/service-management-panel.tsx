import type { GpuFact, InfrastructureOperation, ManagedServiceDefinition } from '@clio/core/v3';
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ServiceConfirmSlot, ServiceFooterSlot } from './service-footer-slot';
import { Link } from 'react-router-dom';
import {
  ActivityIcon,
  HardDriveIcon,
  PlayIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  SquareIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ConfigureIcon, DeleteIcon, RefreshIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';
import { StatusIndicator } from './primitives/status-indicator';
import { TextTabs } from './primitives/text-tabs';
import { InfoTip } from './info-tip';
import { InstallExpectation } from './install-expectation';
import { EffectiveParameters, OwnedResources } from './managed-service-parameters';
import { ManagedServiceForm } from './managed-service-form';
import { ServiceInstallationMethod } from './service-installation-method';
import { OperationProgress } from './operation-progress';
import { managedServiceStatus } from '@/lib/managed-service-status';
import { engineId } from './managed-service-gpus';
import { ServiceConfirmDialog } from './service-management-confirm-dialog';
import { ServiceFacts, ServiceStorageFacts } from './service-management-facts';
import { portOf, serviceAbout, STATUS_TONE } from './service-management-model';
import type {
  ServiceAction,
  ServiceActionFeedback,
  ServiceActionOptions,
} from './service-management-types';

export type {
  ServiceAction,
  ServiceActionFeedback,
  ServiceActionOptions,
} from './service-management-types';

/** Definition-driven setup and resource management with separate lifecycle verbs. */
export function ManagedServiceCard({
  activeAction,
  connectionAction,
  connectionStatus,
  configuration,
  onAction,
  onCancel,
  onConfiguration,
  onResetConfiguration,
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
  gpus,
}: {
  activeAction?: ServiceAction;
  connectionAction?: {
    blockedReason?: string;
    label: string;
    onSelect?: () => void;
    pending?: boolean;
    connected?: boolean;
    to?: string;
  };
  connectionStatus?: ReactNode;
  configuration: Record<string, string>;
  onAction: (action: ServiceAction, options?: ServiceActionOptions) => void;
  onCancel?: () => void;
  onConfiguration: (field: string, value: string) => void;
  onResetConfiguration?: () => void;
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
  /** The host's GPUs (facts.gpus); absent or empty keeps the plain device fields. */
  gpus?: GpuFact[];
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
  const native = service.variants.some(
    (row) => row.id === variant && row.install_type === 'native_uv',
  );
  const monitoring = service.category === 'monitoring';
  const engine = engineId(service);
  const llama = engine === 'llama_cpp';
  const retainsData = native || monitoring;
  const installed =
    Boolean(service.observation?.installed) ||
    service.state === 'running' ||
    service.state === 'stopped';
  const recorded = (service.owned_resources ?? []).length > 0;
  const serviceStatus = managedServiceStatus(service);
  const compatible = service.variants.some((item) => item.id === variant && item.compatible);
  const fields = service.configuration_fields.filter(
    (field) => !field.variants?.length || field.variants.includes(variant),
  );
  const modelProblem = llama
    ? variant === 'native-windows-cpu' && !native
      ? !configuration.model_path?.trim()
        ? 'Choose a GGUF model file on this computer.'
        : undefined
      : Boolean(configuration.model_path?.trim()) === Boolean(configuration.hf_model?.trim())
        ? 'Choose either a GGUF file or a Hugging Face model.'
        : undefined
    : undefined;
  const missing =
    fields.some((field) => field.required && !configuration[field.id]?.trim()) ||
    (native &&
      monitoring &&
      configuration.database_mode === 'site' &&
      !configuration.database_settings_path?.trim()) ||
    Boolean(modelProblem);
  const modelPackageOnly = llama || (native && engine === 'ollama');
  const missingInstallation = modelPackageOnly
    ? fields.some(
        (field) =>
          field.required &&
          !['model', 'model_path', 'hf_model'].includes(field.id) &&
          !configuration[field.id]?.trim(),
      )
    : missing;
  const activeTab = tab ?? localTab;
  const editing = setup || (!installed && !recorded);
  const footerSlot = useContext(ServiceFooterSlot);
  const panelId = useId();
  const loadedLogs = useRef(false);
  useEffect(() => {
    if (!editing && activeTab === 'logs' && !activeAction && !loadedLogs.current) {
      loadedLogs.current = true;
      onAction('logs');
    }
  }, [editing, activeTab, activeAction, onAction]);
  const selectTab = (value: string) => {
    setLocalTab(value);
    onTab?.(value);
  };
  const changed = Object.entries(configuration).some(
    ([key, value]) => value !== (service.configuration[key] ?? ''),
  );
  const labels: Record<ServiceAction, string> = {
    install: 'Install',
    start: 'Start',
    status: 'Check status',
    logs: 'View logs',
    stop: 'Stop',
    reinstall: changed ? 'Apply configuration' : llama ? 'Reinstall runtime' : 'Reinstall',
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
      disabled={disabledFor(action)}
      onClick={() => run(action)}
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
      installationOnly={modelPackageOnly && editing}
      showIntroduction={!llama || editing}
      showMethod={!editing}
      gpus={gpus}
    />
  );
  const disabledFor = (action: ServiceAction) =>
    Boolean(activeAction) ||
    (!compatible && ['install', 'reinstall', 'start'].includes(action)) ||
    (missingInstallation && ['install', 'reinstall'].includes(action)) ||
    (missing && action === 'start' && (llama || !installed));
  const run = (action: ServiceAction) =>
    ['uninstall', 'delete_data', 'reinstall'].includes(action) ? confirm(action) : onAction(action);
  // Setup's Install sits in the hosting dialog's footer, right of Cancel, as in the spec.
  const setFooterConfirm = useContext(ServiceConfirmSlot);
  const runInstall = useRef(run);
  useEffect(() => {
    runInstall.current = run;
  });
  const installLabel = activeAction === 'install' ? progressLabels.install : labels.install;
  const installDisabled = disabledFor('install');
  useEffect(() => {
    if (!setFooterConfirm || !editing) return;
    setFooterConfirm({
      label: installLabel,
      disabled: installDisabled,
      onConfirm: () => runInstall.current('install'),
    });
    return () => setFooterConfirm(undefined);
  }, [setFooterConfirm, editing, installLabel, installDisabled]);
  /** A lifecycle verb as an icon with its name on hover, a spinner while it runs. */
  const actIcon = (action: ServiceAction, icon: ReactNode, label = labels[action]) => (
    <IconButton
      disabled={disabledFor(action)}
      icon={activeAction === action ? <Spinner aria-hidden="true" /> : icon}
      key={action}
      label={activeAction === action ? progressLabels[action] : label}
      onClick={() => run(action)}
    />
  );
  const running = service.state === 'running';
  const port = portOf(service.connection_url);
  const statusLabel =
    running && port ? `${serviceStatus.label} on port ${port}` : serviceStatus.label;
  const lifecycle = editing ? null : (
    <>
      {running && service.supports_stop ? actIcon('stop', <SquareIcon aria-hidden="true" />) : null}
      {!running && installed ? actIcon('start', <PlayIcon aria-hidden="true" />) : null}
      {installed ? actIcon('reinstall', <RetryIcon aria-hidden="true" />) : null}
      {installed || (recorded && service.observation?.phase !== 'not_installed')
        ? actIcon('uninstall', <DeleteIcon aria-hidden="true" />)
        : null}
    </>
  );
  const about = serviceAbout(service, variant);
  return (
    <article
      aria-label={`${service.label} management`}
      className={editing ? 'min-w-0 space-y-5' : 'min-w-0 space-y-3'}
    >
      {editing ? (
        <>
          <ServiceInstallationMethod service={service} variant={variant} onVariant={onVariant} />
          {compatible ? form : null}
          {compatible && modelProblem && !llama ? (
            <p className="text-sm text-muted-foreground">{modelProblem}</p>
          ) : null}
          {setFooterConfirm ? null : <div className="flex gap-2">{act('install')}</div>}
        </>
      ) : (
        <>
          <div className="flex h-8 min-w-0 items-stretch border-b border-border">
            <TextTabs
              className="flex-1"
              compact
              controls={panelId}
              label={`${service.label} management tabs`}
              onValueChange={selectTab}
              tabs={[
                { value: 'status', label: 'Status', icon: <ActivityIcon aria-hidden="true" /> },
                {
                  value: 'configuration',
                  label: 'Configuration',
                  icon: <ConfigureIcon aria-hidden="true" />,
                },
                { value: 'logs', label: 'Logs', icon: <ScrollTextIcon aria-hidden="true" /> },
                { value: 'storage', label: 'Storage', icon: <HardDriveIcon aria-hidden="true" /> },
              ]}
              value={activeTab as 'status'}
            />
            <InfoTip className="size-7 self-center" label={`About ${service.label}`}>
              {about}
            </InfoTip>
          </div>
          {installed && changed ? (
            <div className="flex min-h-[26px] min-w-0 flex-wrap items-center gap-2 text-meta text-warning">
              <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Unapplied changes</span>
              {onResetConfiguration ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(activeAction)}
                  onClick={onResetConfiguration}
                >
                  Discard changes
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={disabledFor('reinstall')}
                onClick={() => confirm('reinstall')}
              >
                Apply configuration
              </Button>
            </div>
          ) : null}
          <div className="space-y-3" id={panelId} role="tabpanel">
            {activeTab === 'status' ? (
              <>
                <div className="flex min-h-[26px] min-w-0 items-center gap-2">
                  <StatusIndicator
                    className="min-w-0 truncate text-foreground"
                    label={statusLabel}
                    tone={STATUS_TONE[serviceStatus.kind]}
                  />
                  <span className="ml-auto flex shrink-0 items-center gap-0.5">
                    {serviceStatus.action === 'install' && !installed ? act('install') : null}
                    {running && monitoring
                      ? actIcon('verify', <ShieldCheckIcon aria-hidden="true" />)
                      : null}
                    {actIcon('status', <RefreshIcon aria-hidden="true" />)}
                    <IconButton
                      icon={<ScrollTextIcon aria-hidden="true" />}
                      label="View logs"
                      onClick={() => selectTab('logs')}
                    />
                  </span>
                </div>
                {serviceStatus.reason ? (
                  <p className="text-meta text-warning">{serviceStatus.reason}</p>
                ) : null}
                {llama && installed && !running ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Runtime installed. Choose a model to serve.
                    </p>
                    {form}
                    {modelProblem ? (
                      <p role="status" className="text-sm text-muted-foreground">
                        {modelProblem}
                      </p>
                    ) : null}
                  </>
                ) : null}
                <ServiceFacts
                  monitoring={monitoring}
                  running={running}
                  service={service}
                  variant={variant}
                />
                {connectionStatus}
                {connectionAction ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {connectionAction.to ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={connectionAction.to}>{connectionAction.label}</Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          connectionAction.pending || Boolean(connectionAction.blockedReason)
                        }
                        onClick={connectionAction.onSelect}
                      >
                        {connectionAction.pending ? <Spinner aria-hidden="true" /> : null}
                        {connectionAction.label}
                      </Button>
                    )}
                  </div>
                ) : null}
                {connectionAction?.blockedReason ? (
                  <p role="alert" className="text-sm text-destructive">
                    {connectionAction.blockedReason}
                  </p>
                ) : null}
              </>
            ) : activeTab === 'configuration' ? (
              <>
                {form}
                {installed ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      disabled={Boolean(activeAction) || !compatible || missingInstallation}
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
                  </div>
                ) : (
                  act('install')
                )}
                <EffectiveParameters
                  rows={service.effective_parameters ?? []}
                  serviceLabel={service.label}
                />
              </>
            ) : activeTab === 'logs' ? (
              <>
                <div className="flex min-h-[26px] items-center gap-2 text-meta text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">Recent logs on {hostLabel}</span>
                  <IconButton
                    disabled={Boolean(activeAction)}
                    icon={
                      activeAction === 'logs' ? (
                        <Spinner aria-hidden="true" />
                      ) : (
                        <RefreshIcon aria-hidden="true" />
                      )
                    }
                    label={activeAction === 'logs' ? 'Refreshing…' : 'Refresh logs'}
                    onClick={() => onAction('logs')}
                  />
                </div>
                {result?.action === 'logs' ? (
                  <pre
                    aria-label={`${service.label} recent logs`}
                    aria-live="polite"
                    className="clio-scrollbar max-h-80 overflow-auto rounded-md border border-border p-3 font-mono text-xs leading-5 whitespace-pre-wrap"
                  >
                    {result.text}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground" role="status">
                    Reading recent logs from {hostLabel}…
                  </p>
                )}
              </>
            ) : (
              <>
                <ServiceStorageFacts hostLabel={hostLabel} service={service} />
                <OwnedResources
                  rows={service.owned_resources ?? []}
                  serviceLabel={service.label}
                  retained={retainsData}
                />
                {retainsData &&
                recorded &&
                !installed &&
                service.observation?.phase === 'not_installed' ? (
                  <div className="flex flex-wrap gap-2">{act('delete_data')}</div>
                ) : null}
              </>
            )}
          </div>
          {footerSlot ? (
            createPortal(lifecycle, footerSlot)
          ) : (
            <div className="flex items-center gap-0.5">{lifecycle}</div>
          )}
        </>
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
      <ServiceConfirmDialog
        changed={changed}
        confirmation={confirmation}
        expectation={expectation}
        fromScratch={fromScratch}
        hostLabel={hostLabel}
        labels={labels}
        llama={llama}
        onConfirm={() => {
          if (confirmation) {
            onAction(confirmation, fromScratch ? { fromScratch: true } : undefined);
          }
          setConfirmation(undefined);
          setFromScratch(false);
        }}
        onDismiss={() => setConfirmation(undefined)}
        retainsData={retainsData}
        service={service}
      />
    </article>
  );
}
