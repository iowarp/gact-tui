import { useQuery } from '@tanstack/react-query';
import { useInfrastructureTargetSelection } from '@/hooks/use-infrastructure-target-selection';
import { useSearchParams } from 'react-router-dom';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfrastructureActivity } from './infrastructure-activity';
import { InfrastructureHosts } from './infrastructure-hosts';
import { SshAuthentication } from './managed-service-target';
import { ManagedServiceHostSelector } from './managed-service-host-selector';
import { StateView } from './primitives/state-view';
import { ModelAcquisitions } from './model-acquisition';
import { InfrastructureOverview } from './infrastructure-overview';
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
  overview?: Omit<
    ComponentProps<typeof InfrastructureOverview>,
    'data' | 'targetId' | 'onReconnect' | 'reconnecting' | 'reconnectError'
  >;
}) {
  const repository = useRepository();
  const { settings, isManagedConnection } = useConnectionSettings();
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
      <StateView
        className="mt-2"
        kind="error"
        size="row"
        title="Infrastructure could not load"
        detail={inventory.error.message}
        action={{ label: 'Retry', onClick: () => void inventory.refetch() }}
      />
    );
  if (!inventory.data)
    return <StateView className="mt-2" kind="loading" size="row" title="Loading infrastructure…" />;
  const data = inventory.data;
  if (section === 'models')
    return (
      <div className="flex min-w-0 flex-col">
        {connectionError ? <StateView kind="error" size="row" title={connectionError} /> : null}
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
          hostSelector={
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
          }
        />
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
      </InfrastructureHosts>
    );
  return (
    <InfrastructureOverview
      {...overview}
      data={data}
      targetId={targetId}
      onReconnect={canConnectComputer ? connectComputer : undefined}
      reconnecting={registerTarget.isPending}
      reconnectError={registerTarget.error?.message}
    />
  );
}
