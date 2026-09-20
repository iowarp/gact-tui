import type {
  ManagedServiceActionInput,
  ManagedServiceDefinition,
} from '@/tauri/infrastructure-setup';
import { ExternalLinkIcon, TriangleAlertIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ClioStatus } from '@/components/clio/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import type { ReactNode } from 'react';

export type ServiceAction = ManagedServiceActionInput['action'];
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
  onConfiguration,
  onVariant,
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
  onConfiguration: (field: string, value: string) => void;
  onVariant: (value: string) => void;
  result?: ServiceActionFeedback;
  service: ManagedServiceDefinition;
  variant: string;
}) {
  const compatible = service.variants.filter((item) => item.compatible);
  const installed = service.state === 'running' || service.state === 'stopped';
  const operable = installed || compatible.length > 0;
  const incompatibilityReasons = Array.from(
    new Set(service.variants.filter((item) => !item.compatible).map((item) => item.reason)),
  );
  const missing = service.configuration_fields.some(
    (field) => field.required && !configuration[field.id]?.trim(),
  );
  const actions: ServiceAction[] =
    service.state === 'running'
      ? ['status', 'logs', ...(service.supports_stop ? (['stop'] as const) : [])]
      : service.state === 'stopped'
        ? ['start', 'status', 'logs']
        : ['install'];

  return (
    <article className="grid gap-5 py-6 lg:grid-cols-[minmax(12rem,0.72fr)_minmax(0,1.28fr)]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold">{service.label}</h3>
          <ServiceState compatible={Boolean(compatible.length)} state={service.state} />
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
              <a
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                href="https://docs.docker.com/desktop/"
                rel="noreferrer"
                target="_blank"
              >
                Docker Desktop guide <ExternalLinkIcon aria-hidden="true" className="size-3" />
              </a>
            ) : null}
          </div>
        ) : null}

        {compatible.length && service.state !== 'running'
          ? service.configuration_fields.map((field) =>
              field.options?.length ? (
                <Select
                  key={field.id}
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
                  key={field.id}
                  label={`${service.label} ${field.label}`}
                  onChange={(value) => onConfiguration(field.id, value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={configuration[field.id] ?? ''}
                />
              ) : (
                <Input
                  aria-label={`${service.label} ${field.label}`}
                  key={field.id}
                  onChange={(event) => onConfiguration(field.id, event.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={configuration[field.id] ?? ''}
                />
              ),
            )
          : null}

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
                disabled={Boolean(activeAction) || !variant || (name === 'start' && missing)}
                key={name}
                onClick={() => onAction(name)}
                size="sm"
                variant={name === 'start' ? 'default' : 'outline'}
              >
                {activeAction === name ? <Spinner aria-hidden="true" /> : null}
                {activeAction === name ? actionProgressLabel(name) : actionLabel(name)}
              </Button>
            ))}
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
  };
  return labels[action];
}
