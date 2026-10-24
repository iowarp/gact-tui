import { useQuery } from '@tanstack/react-query';
import { useInfrastructureTargetSelection } from '@/hooks/use-infrastructure-target-selection';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfrastructureActivity } from './infrastructure-activity';
import { InfrastructureHosts } from './infrastructure-hosts';
import { SshAuthentication } from './managed-service-target';
import { ManagedServiceHostSelector } from './managed-service-host-selector';
import { HostStorageSettings } from './host-storage-settings';
import { ModelAcquisitions } from './model-acquisition';
import { InfrastructureOverview, InfrastructureHostInspection } from './infrastructure-overview';
import { useRegisterInfrastructureTarget } from '@/hooks/use-register-infrastructure-target';
import { inTauri } from '@/lib/transport/tauri-runtime';
import type { SshHost } from '@/lib/ssh-hosts';

/** Inventory is independent from deployment forms and survives navigation. */
export function InfrastructureInventory({
  section,
  children,
  overview,
  localAttention,
}: {
  section: 'overview' | 'models' | 'activity' | 'hosts';
  children?: ReactNode;
  /** Hosts: what on the connected agent's own computer needs attention. */
  localAttention?: string[];
  overview?: Omit<ComponentProps<typeof InfrastructureOverview>, 'data' | 'targetId' | 'onTarget'>;
}) {
  const repository = useRepository();
  const { settings, isManagedConnection } = useConnectionSettings();
  const [storageOpen, setStorageOpen] = useState(false);
  const inventory = useQuery({
    queryKey: ['infrastructure-inventory', settings.endpoint],
    queryFn: ({ signal }) => repository.infrastructureInventory(signal),
    refetchInterval: 5000,
  });
  const {
    targetId,
    transportStatus,
    connectionError,
    selectTarget: setTargetId,
    setTargetId: rememberTargetId,
    setSshHost,
    setTarget,
    setTransportStatus,
  } = useInfrastructureTargetSelection(inventory.data?.targets ?? []);
  const registerTarget = useRegisterInfrastructureTarget();
  const canConnectComputer = inTauri() && isManagedConnection;
  const connectComputer = async (host: SshHost) => {
    const { registered, status } = await registerTarget.mutateAsync(host);
    setTarget('ssh');
    setSshHost(host);
    rememberTargetId(registered.id);
    setTransportStatus(status);
    setParams({ target: registered.id }, { replace: true });
  };
  const [params, setParams] = useSearchParams();
  const requestedTarget = params.get('target');
  useEffect(() => {
    if (
      requestedTarget &&
      requestedTarget !== targetId &&
      inventory.data?.targets.some((host) => host.id === requestedTarget)
    )
      setTargetId(requestedTarget);
  }, [requestedTarget, targetId, inventory.data?.targets, setTargetId]);
  if (inventory.error)
    return (
      <p role="alert" className="mt-6 text-destructive">
        {inventory.error.message}
      </p>
    );
  if (!inventory.data)
    return (
      <p role="status" className="mt-6 text-muted-foreground">
        Loading infrastructure…
      </p>
    );
  const data = inventory.data;
  if (section === 'models')
    return (
      <div className="mt-6 space-y-6">
        <ManagedServiceHostSelector
          targets={data.targets}
          targetId={targetId}
          canAdd={canConnectComputer}
          onSshHost={connectComputer}
          pending={registerTarget.isPending}
          error={registerTarget.error?.message}
          onSelect={(id) => {
            setTargetId(id);
            setParams({ target: id }, { replace: true });
          }}
        />
        {connectionError ? (
          <p role="alert" className="text-sm text-destructive">
            {connectionError}
          </p>
        ) : null}
        {transportStatus?.prompt && transportStatus.state !== 'connected' ? (
          <SshAuthentication
            prompt={transportStatus.prompt}
            sessionId={transportStatus.session_id}
          />
        ) : null}
        <ModelAcquisitions
          key={`models:${targetId}`}
          targetId={targetId}
          hostLabel={
            targetId === 'local'
              ? 'Local'
              : data.targets.find((host) => host.id === targetId)?.label || targetId
          }
        />
        <details
          className="border-t pt-4"
          open={storageOpen}
          onToggle={(event) => setStorageOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-medium">Storage settings</summary>
          {storageOpen ? (
            <div className="mt-4">
              <HostStorageSettings key={targetId} targetId={targetId} />
            </div>
          ) : null}
        </details>
      </div>
    );
  if (section === 'activity') return <InfrastructureActivity data={data} />;
  if (section === 'hosts')
    return (
      <InfrastructureHosts
        data={data}
        onSelect={setTargetId}
        onConnectComputer={canConnectComputer ? connectComputer : undefined}
        pending={registerTarget.isPending}
        error={registerTarget.error?.message}
        localAttention={localAttention}
      >
        {children}
        <InfrastructureHostInspection targetId="local" />
      </InfrastructureHosts>
    );
  return (
    <InfrastructureOverview {...overview} data={data} targetId={targetId} onTarget={setTargetId} />
  );
}
