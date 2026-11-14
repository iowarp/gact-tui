import type { GpuFact, ManagedServiceDefinition } from '@clio/core/v3';
import {
  CpuIcon,
  DownloadIcon,
  FileTextIcon,
  HardDriveIcon,
  LinkIcon,
  MonitorIcon,
  PlayIcon,
  PlugIcon,
  SquareIcon,
  UnlinkIcon,
} from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { vocab } from '@/lib/brand-vocabulary';
import { AddIcon, ConfigureIcon, ManageIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { managedServiceStatus } from '@/lib/managed-service-status';
import { withAddressBreaks } from '@/lib/address-breaks';
import { InfraRow, type InfraStatus } from './infrastructure-row';
import { InfraRowMenu } from './infrastructure-row-menu';
import { deploymentDevices } from './managed-service-gpus';
import { SERVICE_GROUPS } from './managed-service-groups';
import { VerificationState } from './managed-service-identity';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { MenuRow } from './primitives/menu-row';
import { StateView } from './primitives/state-view';
import type { ManagedServiceCard, ServiceActionFeedback } from './service-management-panel';
import { t, ph } from '@lingui/core/macro';

export type ServiceConnection = ComponentProps<typeof ManagedServiceCard>['connectionAction'];
export type ServiceRowAction = 'start' | 'stop' | 'status';
/** The management panel's tabs a row menu can open directly. */
export type ServicePanelTab = 'status' | 'configuration' | 'logs' | 'storage';

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

function rowStatus(service: ManagedServiceDefinition, working: boolean): InfraStatus {
  const status = managedServiceStatus(service);
  if (status.kind === 'starting' || status.kind === 'installing')
    return { tone: 'running', label: status.label };
  if (working) return { tone: 'running', label: t`Working` };
  if (status.kind === 'running') return { tone: 'success', label: status.label };
  if (status.kind === 'stopped') return { tone: 'idle', label: status.label };
  if (status.kind === 'not_installed' && status.reason)
    return { tone: 'warning', label: status.label };
  return { tone: 'idle', label: status.label };
}

function servicePort(service: ManagedServiceDefinition): string | undefined {
  if (service.connection_url) {
    try {
      const port = new URL(service.connection_url).port;
      if (port) return port;
    } catch {
      // A bare host or socket path has no port to show.
    }
  }
  return service.configuration.port || undefined;
}

function installedAs(service: ManagedServiceDefinition): string {
  const variant = service.variants.find((row) => row.id === service.recommended_variant);
  if (!variant || !service.owned_resources.length) return '';
  return [variant.label, variant.version].filter(Boolean).join(' ');
}

function serviceSummary(service: ManagedServiceDefinition): string {
  if (service.configuration.model) return service.configuration.model;
  return installedAs(service) || service.description;
}

/** One managed service: state, port, a pinned lifecycle verb and the rest behind hover. */
export function ManagedServiceInventoryRow({
  service,
  hostLabel,
  gpus,
  connection,
  operation,
  busy,
  feedback,
  canAddInstance,
  addInstanceForm,
  onAddInstance,
  onManage,
  onOpenTab,
  onRun,
}: {
  service: ManagedServiceDefinition;
  hostLabel: string;
  gpus: GpuFact[];
  connection?: ServiceConnection;
  /** The id of an operation running on this service. */
  operation?: string;
  busy: boolean;
  feedback?: ServiceActionFeedback;
  canAddInstance: boolean;
  /** The open "Add instance" name field, shown under the row. */
  addInstanceForm?: ReactNode;
  onAddInstance: () => void;
  onManage: () => void;
  onOpenTab: (tab: ServicePanelTab) => void;
  onRun?: (action: ServiceRowAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = managedServiceStatus(service);
  const working = busy || Boolean(operation);
  const devices = deploymentDevices(service, { gpus });
  const port = servicePort(service);
  const canStop = status.kind === 'running' && service.supports_stop;
  const lifecycle:
    | { label: string; icon: ReactNode; onClick: () => void; checksStatus?: boolean }
    | undefined =
    status.action === 'install' && !operation
      ? {
          label: t`Install ${ph({ label: service.label })}`,
          icon: <DownloadIcon />,
          onClick: onManage,
        }
      : onRun && canStop
        ? {
            label: t`Stop ${ph({ label: service.label })}`,
            icon: <SquareIcon />,
            onClick: () => onRun('stop'),
          }
        : onRun && status.action === 'start'
          ? {
              label: t`Start ${ph({ label: service.label })}`,
              icon: <PlayIcon />,
              onClick: () => onRun('start'),
            }
          : onRun
            ? {
                label: t`Check ${ph({ label: service.label })} status`,
                checksStatus: true,
                icon: <RefreshIcon />,
                onClick: () => onRun('status'),
              }
            : undefined;
  const facts: KeyValueItem[] = [
    { label: t`Computer`, icon: <MonitorIcon />, value: hostLabel },
    ...(service.connection_url
      ? [
          {
            label: t`Address`,
            icon: <LinkIcon />,
            value: service.connection_url,
            mono: true,
            title: service.connection_url,
          },
        ]
      : []),
    ...(service.configuration.model
      ? [{ label: t`Model`, icon: <CpuIcon />, value: service.configuration.model, mono: true }]
      : []),
    ...(service.definition_version
      ? [
          {
            label: t`Version`,
            icon: <HardDriveIcon />,
            value: service.definition_version,
            mono: true,
          },
        ]
      : []),
    ...(connection?.connected !== undefined
      ? [
          {
            label: t`Agent connection`,
            icon: <PlugIcon />,
            value: connection.connected
              ? t`Connected to ${ph({ agent: vocab.agent })}`
              : t`Not connected to ${ph({ agent: vocab.agent })}`,
            title: t`Connection makes this service available to ${ph({ agent: vocab.agent })}. Its runtime can be stopped separately.`,
          },
        ]
      : []),
  ];
  const error = feedback?.error ? feedback.text : undefined;
  const showDetails = expanded || Boolean(error) || Boolean(addInstanceForm);
  const connectionItem = connection?.to ? (
    <DropdownMenuItem asChild>
      <Link to={connection.to}>
        <MenuRow icon={<LinkIcon />} label={connection.label} />
      </Link>
    </DropdownMenuItem>
  ) : connection?.onSelect ? (
    <DropdownMenuItem
      disabled={connection.pending || Boolean(connection.blockedReason)}
      onSelect={connection.onSelect}
      title={connection.blockedReason}
    >
      <MenuRow
        description={connection.blockedReason}
        icon={connection.connected ? <UnlinkIcon /> : <LinkIcon />}
        label={connection.label}
      />
    </DropdownMenuItem>
  ) : null;
  return (
    <InfraRow
      actions={
        <InfraRowMenu
          actions={[
            {
              icon: <ManageIcon />,
              label: t`Manage ${ph({ label: service.label })}`,
              onSelect: onManage,
            },
          ]}
          label={t`More actions for ${ph({ label: service.label })}`}
          menu={
            <>
              {connectionItem}
              {canAddInstance ? (
                <DropdownMenuItem onSelect={onAddInstance}>
                  <MenuRow icon={<AddIcon />} label={t`Add named instance`} />
                </DropdownMenuItem>
              ) : null}
              {connectionItem || canAddInstance ? <DropdownMenuSeparator /> : null}
              {onRun && !lifecycle?.checksStatus ? (
                <DropdownMenuItem disabled={working} onSelect={() => onRun('status')}>
                  <MenuRow icon={<RefreshIcon />} label={t`Check status`} />
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => onOpenTab('configuration')}>
                <MenuRow icon={<ConfigureIcon />} label={t`Configure`} />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenTab('logs')}>
                <MenuRow icon={<FileTextIcon />} label={t`View logs`} />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenTab('storage')}>
                <MenuRow icon={<HardDriveIcon />} label={t`Storage and removal`} />
              </DropdownMenuItem>
            </>
          }
        />
      }
      className="cursor-pointer"
      description={
        <>
          <span title={service.description}>{status.reason ?? serviceSummary(service)}</span>
          {devices ? (
            <span className="ml-2" title={t`The GPUs this deployment may use`}>
              {devices}
            </span>
          ) : null}
        </>
      }
      details={
        showDetails ? (
          <>
            {error ? (
              <StateView
                action={{ label: t`View logs`, onClick: () => onOpenTab('logs') }}
                kind="error"
                size="row"
                title={error}
              />
            ) : null}
            {addInstanceForm}
            {expanded ? (
              <>
                <KeyValueGrid items={facts} />
                <VerificationState service={service} />
              </>
            ) : null}
          </>
        ) : undefined
      }
      icon={<ServiceGroupIcon category={service.category} />}
      meta={
        port ? (
          <span className="text-muted-foreground" title={t`Port ${port}`}>
            {t`port ${port}`}
          </span>
        ) : undefined
      }
      onClick={() => setExpanded((open) => !open)}
      primaryAction={
        lifecycle ? (
          <span onClick={stop}>
            <IconButton
              disabled={working}
              icon={lifecycle.icon}
              label={working ? t`Working…` : lifecycle.label}
              onClick={lifecycle.onClick}
              size="sm"
            />
          </span>
        ) : null
      }
      status={rowStatus(service, working)}
      title={
        <button
          aria-expanded={expanded}
          className="max-w-full truncate text-left outline-none focus-visible:underline @max-[480px]/infra:break-words @max-[480px]/infra:whitespace-normal"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((open) => !open);
          }}
          onKeyDown={(event) => {
            // Space starts or stops the service in focus; Enter still opens its details.
            if (event.key !== ' ' || !onRun || working || !(canStop || status.action === 'start'))
              return;
            event.preventDefault();
            onRun(canStop ? 'stop' : 'start');
          }}
          type="button"
        >
          {withAddressBreaks(service.label)}
        </button>
      }
    />
  );
}

function ServiceGroupIcon({ category }: { category: ManagedServiceDefinition['category'] }) {
  const Icon = SERVICE_GROUPS.find((group) => group.id === category)?.icon ?? CpuIcon;
  return <Icon aria-hidden="true" />;
}
