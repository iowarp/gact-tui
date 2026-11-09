import { useMutation, useQuery } from '@tanstack/react-query';
import { CableIcon, CircleAlertIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ClioStatus } from '@/components/clio/status';
import { SettingsSectionHeading as SectionHeading } from '@/components/clio/settings-section-heading';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/clio/settings-frame';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRepository } from '@/hooks/use-repository';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import { useKnownConnections, type KnownConnection } from '@/hooks/use-known-connections';
import { vocab } from '@/lib/brand-vocabulary';
import { DeleteIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

export function ConnectionsSettings() {
  const repository = useRepository();
  const { settings, forget } = useConnectionSettings();
  const knownConnections = useKnownConnections();
  const switchConnection = useSwitchConnection();
  const connectionSwitch = useMutation({
    mutationFn: (connection: KnownConnection) =>
      switchConnection(connection, { navigateToWorkspace: false }),
  });
  const capabilities = useQuery({
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const degradations = capabilities.data?.degradations ?? [];
  const connectionState = capabilities.isPending
    ? 'connecting'
    : capabilities.isError
      ? 'offline'
      : degradations.length
        ? 'degraded'
        : 'healthy';
  const limitationLabels = degradations.map((degradation) => degradation.reason);

  return (
    <div className="grid gap-6">
      <SectionHeading
        description="Choose where your workspace runs and manage known services."
        title={`${vocab.agent} connections`}
      />
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Current connection</FrameTitle>
          <FrameDescription>
            The app reconnects to the most recently used address when it opens.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-wrap items-center gap-4">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <CableIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {settings.label || new URL(settings.endpoint).host}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">{settings.endpoint}</p>
            {limitationLabels.length ? (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>Some features are unavailable on this connection.</span>
              </div>
            ) : null}
          </div>
          <ClioStatus
            detail={
              capabilities.isError
                ? 'This agent could not be reached.'
                : limitationLabels.length
                  ? 'Open Unavailable features to see what this service provides.'
                  : undefined
            }
            label={
              connectionState === 'healthy'
                ? 'Connected'
                : connectionState === 'degraded'
                  ? 'Limited'
                  : undefined
            }
            value={connectionState}
          />
        </FramePanel>
        {limitationLabels.length ? (
          <details className="text-sm">
            <summary className="w-fit cursor-pointer rounded py-1 text-muted-foreground hover:text-foreground focus-visible:outline-ring">
              Unavailable features ({limitationLabels.length})
            </summary>
            <ul className="mt-2 grid list-disc gap-2 pl-5 text-sm leading-5 text-muted-foreground">
              {limitationLabels.map((reason, index) => (
                <li key={`${index}-${reason}`}>{reason}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <FrameFooter className="items-start">
          <Button asChild size="sm" variant="outline">
            <Link to="/?intent=connect">Add or test a service</Link>
          </Button>
        </FrameFooter>
      </Frame>
      <Frame spacing="lg">
        <FrameHeader>
          <FrameTitle>Known services</FrameTitle>
          <FrameDescription>
            Connect to another service or remove a remembered address from this device.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-1 p-2">
          {knownConnections.map((connection) => {
            const active = connection.endpoint === settings.endpoint;
            return (
              <div
                className="flex min-w-0 items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:border-border hover:bg-accent/50 focus-within:border-ring"
                key={connection.endpoint}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {connection.label || new URL(connection.endpoint).host}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {connection.endpoint}
                  </p>
                </div>
                {active ? <Badge variant="secondary">Current</Badge> : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`Service actions for ${connection.label || connection.endpoint}`}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <MoreIcon aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem
                      disabled={
                        active ||
                        connectionSwitch.isPending ||
                        connection.availability.state === 'unavailable'
                      }
                      onSelect={() => connectionSwitch.mutate(connection)}
                    >
                      <CableIcon aria-hidden="true" /> Connect
                    </DropdownMenuItem>
                    {connection.source === 'recent' ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={active}
                          onSelect={() => void forget(connection.endpoint)}
                          variant="destructive"
                        >
                          <DeleteIcon aria-hidden="true" /> Forget on this device
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {knownConnections.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No known services yet.</p>
          ) : null}
          {connectionSwitch.error ? (
            <p className="p-3 text-sm text-destructive sm:col-span-2">
              {connectionSwitch.error.message}
            </p>
          ) : null}
        </FramePanel>
      </Frame>
    </div>
  );
}
