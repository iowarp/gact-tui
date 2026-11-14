import type { InfrastructureInventory } from '@clio/core/v3';
import { useState, type ReactNode } from 'react';
import {
  BoxIcon,
  LaptopIcon,
  LayersIcon,
  LoaderCircleIcon,
  PlugIcon,
  ServerIcon,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { vocab } from '@/lib/brand-vocabulary';
import { AddIcon } from '@/lib/icon-vocabulary';
import { withAddressBreaks } from '@/lib/address-breaks';
import type { SshHost } from '@/lib/ssh-hosts';
import { computerConnectionLabel } from '@/lib/infrastructure-service-labels';
import { InfrastructureHostInspection } from './infrastructure-host-inspection';
import { InfraList, InfraRow, type InfraStatus } from './infrastructure-row';
import { InfraRowMenu } from './infrastructure-row-menu';
import { InfraRowChevron, InfraRowToggle, InfraRowActions } from './infrastructure-row-toggle';
import { ComputerConnectionContent } from './managed-service-host-selector';
import { InfoTip } from './info-tip';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { t, ph } from '@lingui/core/macro';

/** The words and mark for a computer's connection; never the colour alone. */
function connectionStatus(local: boolean, state: string): InfraStatus {
  if (local) return { tone: 'success', label: t`Connected` };
  const label = computerConnectionLabel(state);
  if (state === 'connected') return { tone: 'success', label };
  if (state === 'connecting' || state === 'reconnecting') return { tone: 'running', label };
  if (state === 'awaiting_input' || state === 'reauthentication_required')
    return { tone: 'waiting', label };
  if (state === 'failed') return { tone: 'error', label };
  return { tone: 'idle', label };
}

/**
 * The connected agent's own health (`children`), then one row per computer
 * with the same direct actions for local and remote computers.
 */
export function InfrastructureHosts({
  data,
  children,
  onSelect,
  onConnectComputer,
  pending = false,
  error,
  localAttention = [],
}: {
  data: InfrastructureInventory;
  /** Supporting services on the local computer that need attention, by name. */
  localAttention?: string[];
  children?: ReactNode;
  onSelect: (id: string) => void;
  onConnectComputer?: (host: SshHost) => Promise<unknown>;
  pending?: boolean;
  error?: string;
}) {
  const [connectOpen, setConnectOpen] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {children}
      <InfraList
        heading={t`Computers`}
        headingAction={
          <>
            <InfoTip label={t`About computers`}>
              {onConnectComputer
                ? t`Local is the connected ${ph({ agent: vocab.agent })} computer. Other computers run services for this agent through Desktop SSH. Adding one does not switch your agent connection.`
                : t`Local is the connected ${ph({ agent: vocab.agent })} computer. Other computers run services for this agent through Desktop SSH. Adding one does not switch your agent connection. Add SSH computers in the Desktop app.`}
            </InfoTip>
            {onConnectComputer ? (
              <IconButton
                icon={<AddIcon />}
                label={t`Add computer`}
                onClick={() => setConnectOpen(true)}
                size="sm"
              />
            ) : null}
          </>
        }
        hover={52}
        meta={0}
      >
        {data.targets
          .filter((host) => host.kind !== 'direct')
          .map((host) => (
            <ComputerRow
              key={host.id}
              label={host.kind === 'local' ? t`Local` : host.label}
              id={host.id}
              local={host.kind === 'local'}
              address={
                host.ssh?.host ||
                (host.kind === 'local'
                  ? t`Connected ${ph({ agent: vocab.agent })}`
                  : t`Saved computer`)
              }
              status={connectionStatus(host.kind === 'local', host.transport_state)}
              attention={host.kind === 'local' ? localAttention : []}
              onInspect={() => onSelect(host.id)}
              onReconnect={
                host.ssh && onConnectComputer && host.transport_state !== 'connected'
                  ? () =>
                      onConnectComputer({
                        id: host.id,
                        label: host.label,
                        profile: host.ssh?.profile,
                        host: host.ssh?.host,
                        user: host.ssh?.user,
                        port: host.ssh?.port ?? 22,
                        jumpHosts: host.ssh?.jump_hosts,
                        identityFile: host.ssh?.identity_file,
                        platform: host.ssh?.platform,
                        installRoot: host.install_root,
                      })
                  : undefined
              }
              pending={pending}
            />
          ))}
      </InfraList>
      {error ? (
        <StateView kind="error" size="row" title={t`Could not connect this computer: ${error}`} />
      ) : null}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        {onConnectComputer ? (
          <ComputerConnectionContent
            pending={pending}
            error={error}
            onConnect={onConnectComputer}
            onClose={() => setConnectOpen(false)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function ComputerRow({
  id,
  label,
  local,
  address,
  status,
  attention,
  onInspect,
  onReconnect,
  pending,
}: {
  id: string;
  label: string;
  local: boolean;
  address: string;
  status: InfraStatus;
  attention: string[];
  onInspect: () => void;
  onReconnect?: () => Promise<unknown>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = local ? LaptopIcon : ServerIcon;
  const target = encodeURIComponent(id);
  return (
    <InfraRow
      actions={
        <InfraRowMenu
          actions={[
            {
              icon: <LayersIcon />,
              label: t`Services on ${label}`,
              to: `/infrastructure/services?target=${target}`,
            },
            {
              icon: <BoxIcon />,
              label: t`Models on ${label}`,
              to: `/infrastructure/models?target=${target}`,
            },
          ]}
          label={t`More for ${label}`}
        />
      }
      className="cursor-pointer"
      description={
        attention.length ? (
          <span className="text-warning-foreground" title={attention.join(', ')}>
            {t`Needs attention: ${ph({ services: attention.join(', ') })}.`}
          </span>
        ) : (
          address
        )
      }
      details={open ? <InfrastructureHostInspection targetId={id} /> : undefined}
      icon={<Icon />}
      onClick={() => {
        if (!open) onInspect();
        setOpen(!open);
      }}
      primaryAction={
        onReconnect ? (
          <InfraRowActions>
            <IconButton
              disabled={pending}
              icon={
                pending ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <PlugIcon />
              }
              label={t`Reconnect`}
              onClick={() => void onReconnect().catch(() => undefined)}
              size="sm"
            />
          </InfraRowActions>
        ) : (
          <InfraRowChevron expanded={open} />
        )
      }
      status={status}
      title={
        <InfraRowToggle expanded={open} label={t`${label} details`}>
          {withAddressBreaks(label)}
        </InfraRowToggle>
      }
    />
  );
}
