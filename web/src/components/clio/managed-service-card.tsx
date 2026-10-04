import type { ManagedServiceDefinition, ServiceActionInput } from '@clio/core/v3';
import { ExternalLinkIcon, TriangleAlertIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ClioStatus } from '@/components/clio/status';
import { ExternalLink } from '@/components/ui/external-link';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useState, type ReactNode } from 'react';
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
import { ServiceAccessChoice, ServiceAccessLine } from './managed-service-access';
import {
  EffectiveParameters,
  OwnedResources,
  ServerParametersForm,
} from './managed-service-parameters';

export type ServiceAction = ServiceActionInput['action'];
export type ServiceActionFeedback = {
  action: ServiceAction;
  error?: boolean;
  text: string;
};

/** One managed service with installation, connection, and lifetime controls. */
export function ManagedServiceCard({
  activeAction,
  connectionAction,
  connectionStatus,
  configuration,
  onAction,
  onCancel,
  onConfiguration,
  onVariant,
  progress,
  result,
  service,
  variant,
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
  onAction: (action: ServiceAction) => void;
  onCancel?: () => void;
  onConfiguration: (field: string, value: string) => void;
  onVariant: (value: string) => void;
  progress?: string;
  result?: ServiceActionFeedback;
  service: ManagedServiceDefinition;
  variant: string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const compatible = service.variants.filter((item) => item.compatible);
  const native = variant.startsWith('native-cuda');
  const monitoring = service.category === 'monitoring';
  const retainsData = native || monitoring;
  const observation = service.observation;
  const installed = service.state === 'running' || service.state === 'stopped';
  // A record whose server is in no known state (an interrupted deploy, a
  // container removed outside CLIO) still owns things: offer uninstall.
  const recorded = (service.owned_resources ?? []).length > 0;
  const operable = installed || recorded || compatible.length > 0;
  const incompatibilityReasons = Array.from(
    new Set(service.variants.filter((item) => !item.compatible).map((item) => item.reason)),
  );
  const fields = service.configuration_fields.filter(
    (field) => !field.variants?.length || field.variants.includes(variant),
  );
  const missing = fields.some((field) => field.required && !configuration[field.id]?.trim());
  const actions: ServiceAction[] =
    service.state === 'running'
      ? [
          'status',
          'logs',
          ...(monitoring ? (['verify'] as const) : []),
          ...(service.supports_stop ? (['stop'] as const) : []),
          'reinstall',
          'uninstall',
        ]
      : service.state === 'stopped'
        ? ['start', 'status', 'logs', 'reinstall', 'uninstall']
        : recorded && retainsData && observation?.phase === 'not_installed'
          ? ['install', 'logs', 'delete_data']
          : recorded
            ? ['status', 'logs', 'uninstall']
            : ['install'];

  return (
    <article className="grid gap-5 py-6 lg:grid-cols-[minmax(12rem,0.72fr)_minmax(0,1.28fr)]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold">{service.label}</h3>
          {observation ? (
            <ClioStatus
              label={
                observation.serving
                  ? 'Serving'
                  : observation.phase === 'installing'
                    ? 'Installing'
                    : observation.running
                      ? 'Starting'
                      : observation.installed
                        ? 'Installed · stopped'
                        : observation.phase === 'not_installed'
                          ? 'Runtime removed'
                          : observation.phase
              }
              value={observation.serving ? 'healthy' : 'degraded'}
            />
          ) : (
            <ServiceState compatible={Boolean(compatible.length)} state={service.state} />
          )}
          {native ? (
            <InfoTip label="About native runtime lifecycle">
              Install prepares the pinned environment. Start loads the selected model. Removing the
              runtime retains downloaded models, logs and captured evidence.
            </InfoTip>
          ) : null}
        </div>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{service.description}</p>
        {service.connection_url ? (
          <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
            {service.connection_url}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        {connectionStatus}
        {compatible.length && service.state !== 'running' ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              Installation options
            </summary>
            <Select onValueChange={onVariant} value={variant}>
              <SelectTrigger aria-label={`${service.label} version`} className="mt-2 max-w-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {compatible.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label} · {item.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </details>
        ) : !installed ? (
          <div className="border-l-2 border-destructive py-1 pl-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <TriangleAlertIcon aria-hidden="true" className="size-4" /> Not available on this
              target
            </p>
            {incompatibilityReasons.map((reason) => (
              <p className="mt-1 text-xs text-destructive/90" key={reason}>
                {reason}
              </p>
            ))}
            {incompatibilityReasons.some((reason) => reason.includes('Docker')) ? (
              <ExternalLink
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                href="https://docs.docker.com/desktop/"
              >
                Docker Desktop guide <ExternalLinkIcon aria-hidden="true" className="size-3" />
              </ExternalLink>
            ) : null}
          </div>
        ) : null}

        {compatible.length &&
        service.state !== 'running' &&
        !installed &&
        (!recorded || observation?.phase === 'not_installed')
          ? fields.map((field) => (
              <Field key={field.id}>
                <FieldLabel>{field.label}</FieldLabel>
                {field.options?.length ? (
                  <Select
                    onValueChange={(value) => onConfiguration(field.id, value)}
                    value={configuration[field.id]}
                  >
                    <SelectTrigger aria-label={`${service.label} ${field.label}`}>
                      <SelectValue placeholder={field.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.id === 'model_path' ? (
                  <ModelFileField
                    label={`${service.label} ${field.label}`}
                    onChange={(value) => onConfiguration(field.id, value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={configuration[field.id] ?? ''}
                  />
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
            ))
          : null}

        {compatible.length && !installed && !recorded ? (
          <ServiceAccessChoice
            configuration={configuration}
            onConfiguration={onConfiguration}
            service={service}
          />
        ) : null}

        {installed && service.access ? <ServiceAccessLine access={service.access} /> : null}

        {compatible.length && !installed && !recorded ? (
          <ServerParametersForm
            onChange={onConfiguration}
            parameters={service.parameters ?? []}
            serviceLabel={service.label}
            values={configuration}
            variant={variant}
          />
        ) : null}

        {service.state === 'running' ? (
          <EffectiveParameters
            rows={service.effective_parameters ?? []}
            serviceLabel={service.label}
          />
        ) : null}
        {installed || recorded ? (
          <OwnedResources
            rows={service.owned_resources ?? []}
            serviceLabel={service.label}
            retained={retainsData}
          />
        ) : null}
        {retainsData && observation ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium">Deployment receipt</summary>
            <dl className="mt-3 grid gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Compatibility profile</dt>
                <dd className="break-all font-mono">{observation.definition_version}</dd>
              </div>
              {native ? (
                <div>
                  <dt className="text-muted-foreground">Model</dt>
                  <dd className="break-all font-mono">{service.configuration.model}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Evidence on this host</dt>
                <dd className="break-all font-mono">{observation.evidence_directory}</dd>
              </div>
              {monitoring ? (
                <div className="flex items-center gap-2">
                  <dt>Provenance</dt>
                  <dd>
                    {observation.provenance_ingesting ? 'Write/readback verified' : 'Not verified'}
                  </dd>
                  <InfoTip label="About provenance verification">
                    Verify setup writes a fresh test record and reads it back. CMF also checks input
                    and output artifact lineage. Restarting or changing configuration requires a
                    fresh check.
                  </InfoTip>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <dt>Attention</dt>
                  <dd>{observation.attention_verified ? 'Verified' : 'Not verified'}</dd>
                  <InfoTip label="About attention verification">
                    Installing the connector or serving a model does not verify attention. A fresh
                    inference must produce a validated capture and token mapping.
                  </InfoTip>
                </div>
              )}
            </dl>
          </details>
        ) : null}

        {connectionAction?.blockedReason ? (
          <div className="border-l-2 border-destructive py-1 pl-4 text-sm text-destructive">
            <p className="font-medium">This connection would not be reachable</p>
            <p className="mt-1 text-xs text-destructive/90">{connectionAction.blockedReason}</p>
          </div>
        ) : null}

        {operable ? (
          <div className="flex flex-wrap gap-2">
            {connectionAction?.to ? (
              <Button asChild size="sm">
                <Link to={connectionAction.to}>{connectionAction.label}</Link>
              </Button>
            ) : connectionAction?.onSelect ? (
              <Button
                disabled={connectionAction.pending}
                onClick={connectionAction.onSelect}
                size="sm"
              >
                {connectionAction.pending ? <Spinner aria-hidden="true" /> : null}
                {connectionAction.label}
              </Button>
            ) : connectionAction?.blockedReason ? (
              <Button disabled size="sm">
                {connectionAction.label}
              </Button>
            ) : null}
            {actions.map((name) => (
              <Button
                disabled={Boolean(activeAction) || !variant || (name === 'install' && missing)}
                key={name}
                onClick={() => (name === 'delete_data' ? setConfirmDelete(true) : onAction(name))}
                size="sm"
                variant={name === 'start' ? 'default' : 'outline'}
              >
                {activeAction === name ? <Spinner aria-hidden="true" /> : null}
                {activeAction === name
                  ? actionProgressLabel(name)
                  : name === 'uninstall' && retainsData
                    ? 'Remove runtime'
                    : actionLabel(name)}
              </Button>
            ))}
          </div>
        ) : null}

        {activeAction && progress ? (
          <div className="flex flex-wrap items-center gap-3">
            <p aria-live="polite" className="text-xs text-muted-foreground" role="status">
              {progress}
            </p>
            {onCancel ? (
              <Button onClick={onCancel} size="sm" type="button" variant="ghost">
                Cancel
              </Button>
            ) : null}
          </div>
        ) : null}

        {result?.action === 'logs' ? (
          <section aria-label={`${service.label} recent logs`} className="overflow-hidden border-y">
            <header className="flex items-center justify-between gap-3 border-b bg-muted/25 px-3 py-2">
              <p className="text-xs font-medium text-foreground">Recent logs</p>
              <p className="text-[11px] text-muted-foreground">Last 80 lines</p>
            </header>
            <pre
              aria-live="polite"
              className="clio-scrollbar max-h-72 min-h-20 overflow-auto whitespace-pre-wrap bg-background/60 p-3 font-mono text-xs leading-5 text-muted-foreground"
            >
              {result.text}
            </pre>
          </section>
        ) : result ? (
          <p
            aria-live="polite"
            className={
              result.error
                ? 'border-l-2 border-destructive py-1 pl-3 text-xs text-destructive'
                : 'border-l-2 border-primary/50 py-1 pl-3 text-xs text-muted-foreground'
            }
            role={result.error ? 'alert' : 'status'}
          >
            {result.text}
          </p>
        ) : null}
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete retained {service.label} data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this deployment’s databases, environment cache, logs and
              captured evidence on its execution host. Separately downloaded models are retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-all font-mono text-xs">
            {service.configuration['storage.service_directory']}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep data</AlertDialogCancel>
            <AlertDialogAction onClick={() => onAction('delete_data')}>
              Delete retained data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

function ServiceState({
  compatible,
  state,
}: {
  compatible: boolean;
  state: ManagedServiceDefinition['state'];
}) {
  if (state === 'running') return <ClioStatus label="Running" value="healthy" />;
  if (state === 'stopped') return <ClioStatus label="Stopped" value="degraded" />;
  if (!compatible) return <ClioStatus label="Unavailable here" value="unavailable" />;
  if (state === 'not_installed') return <ClioStatus label="Not installed" value="unavailable" />;
  return <ClioStatus label="Optional" value="unavailable" />;
}

function ModelFileField({
  label,
  onChange,
  placeholder,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  required: boolean;
  value: string;
}) {
  const choose = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: false,
      filters: [{ name: 'GGUF model', extensions: ['gguf'] }],
      multiple: false,
      title: 'Choose a GGUF model',
    });
    if (typeof selected === 'string') onChange(selected);
  };
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <Input
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
      <Button onClick={() => void choose()} type="button" variant="outline">
        Choose GGUF file
      </Button>
    </div>
  );
}

function actionLabel(action: ServiceAction): string {
  const labels: Record<ServiceAction, string> = {
    install: 'Install',
    start: 'Start',
    status: 'Check status',
    logs: 'View logs',
    stop: 'Stop',
    reinstall: 'Reinstall',
    uninstall: 'Uninstall',
    delete_data: 'Delete retained data',
    verify: 'Verify setup',
  };
  return labels[action];
}

function actionProgressLabel(action: ServiceAction): string {
  const labels: Record<ServiceAction, string> = {
    install: 'Installing…',
    start: 'Starting…',
    status: 'Checking…',
    logs: 'Loading logs…',
    stop: 'Stopping…',
    reinstall: 'Reinstalling…',
    uninstall: 'Uninstalling…',
    delete_data: 'Deleting retained data…',
    verify: 'Verifying…',
  };
  return labels[action];
}
