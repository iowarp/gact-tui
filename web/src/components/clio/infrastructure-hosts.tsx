import type { InfrastructureInventory } from '@clio/core/v3';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDownIcon, CircleAlertIcon, LaptopIcon, ServerIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { vocab } from '@/lib/brand-vocabulary';
import { InfrastructureHostInspection } from './infrastructure-overview';
import { ComputerConnectionContent } from './managed-service-host-selector';
import { Dialog } from '@/components/ui/dialog';
import { InfoTip } from './info-tip';
import { AddIcon } from '@/lib/icon-vocabulary';
import type { SshHost } from '@/lib/ssh-hosts';
import { computerConnectionLabel } from '@/lib/infrastructure-service-labels';

/** The same computer row and direct actions for local and remote computers. */
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
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          Computers
          <InfoTip label="About computers">
            Local is the connected {vocab.agent} computer. Other computers run services for this
            agent through Desktop SSH. Adding one does not switch your agent connection.
          </InfoTip>
        </div>
        {onConnectComputer ? (
          <Button size="sm" onClick={() => setConnectOpen(true)}>
            <AddIcon />
            Add computer
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Add SSH computers in Desktop</span>
        )}
      </div>
      <div className="divide-y border-y">
        {data.targets
          .filter((host) => host.kind !== 'direct')
          .map((host) => (
            <ComputerRow
              key={host.id}
              label={host.kind === 'local' ? 'Local' : host.label}
              id={host.id}
              local={host.kind === 'local'}
              address={
                host.ssh?.host ||
                (host.kind === 'local' ? `Connected ${vocab.agent}` : 'Saved computer')
              }
              status={
                host.kind === 'local' ? 'Connected' : computerConnectionLabel(host.transport_state)
              }
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
            >
              {host.kind === 'local' ? (
                children
              ) : (
                <InfrastructureHostInspection targetId={host.id} />
              )}
            </ComputerRow>
          ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not connect this computer: {error}
        </p>
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
  children,
  onInspect,
  onReconnect,
  pending,
}: {
  id: string;
  label: string;
  local: boolean;
  address: string;
  status: string;
  attention: string[];
  children: ReactNode;
  onInspect: () => void;
  onReconnect?: () => Promise<unknown>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = local ? LaptopIcon : ServerIcon;
  return (
    <section className="py-4" aria-label={`${label} computer`}>
      <div className="flex flex-wrap items-center gap-3">
        <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{label}</h2>
          <p className="truncate text-xs text-muted-foreground">{address}</p>
          {attention.length ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-warning-foreground">
              <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>Needs attention: {attention.join(', ')}. Open Details for what to do.</span>
            </p>
          ) : null}
        </div>
        <Badge
          variant="outline"
          title="Connection to this computer. Services have their own run and connection states."
        >
          {status}
        </Badge>
        <div className="flex flex-wrap items-center gap-2 max-sm:basis-full max-sm:pl-8">
          {onReconnect ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void onReconnect().catch(() => undefined)}
            >
              {pending ? 'Connecting…' : 'Reconnect'}
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link
              aria-label={`Services on ${label}`}
              to={`/infrastructure/services?target=${encodeURIComponent(id)}`}
            >
              Services
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              aria-label={`Models on ${label}`}
              to={`/infrastructure/models?target=${encodeURIComponent(id)}`}
            >
              Models
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={open}
            aria-label={`${label} details`}
            onClick={() => {
              if (!open) onInspect();
              setOpen(!open);
            }}
          >
            Details <ChevronDownIcon className={open ? 'rotate-180' : ''} />
          </Button>
        </div>
      </div>
      {open ? <div className="mt-4 border-t pt-4">{children}</div> : null}
    </section>
  );
}
