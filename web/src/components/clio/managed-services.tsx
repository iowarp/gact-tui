import { inTauri } from '@/lib/transport/tauri-runtime';
import { installerRequestedLlamaCpp } from '@/lib/installer-infrastructure';
import type {
  McpUserConfiguration,
  RelayStatus,
  ServiceActionInput,
  ManagedServiceDefinition,
} from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CpuIcon, LaptopIcon, ServerIcon } from 'lucide-react';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfrastructureState } from '@/hooks/use-infrastructure-state';
import { useManagedOperations } from '@/hooks/use-managed-operations';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { RadioGroup } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useRepository } from '@/hooks/use-repository';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { vocab } from '@/lib/brand-vocabulary';
import type { SshHost } from '@/lib/ssh-hosts';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AgentServicesOverview } from './agent-services-overview';
import {
  ManagedServiceCard,
  type ServiceAction,
  type ServiceActionFeedback,
} from './managed-service-card';
import { WebSearchServiceConnection } from './web-search-service-connection';
import { webSearchConnectionMatchesTarget } from './web-search-configuration';
import { SshHostPicker } from './ssh-host-picker';
import {
  attachInfrastructureSshTransport,
  sshTransportStatus,
  type SshStateEvent,
  type SshTransportStatus,
} from '@/tauri/ssh-infrastructure-transport';
import {
  InspectionProgress,
  SshAuthentication,
  TargetChoice,
  type ManagedTargetKind,
} from './managed-service-target';
import {
  configurationForVariant,
  modelRuntimeInModels,
  targetLabel,
  targetMatchesHost,
  waitForOperation,
} from './managed-service-target-utils';
import { ManagedServiceHostFacts } from './managed-service-host-facts';
import { ManagedServiceInventory } from './managed-service-inventory';

type Target = ManagedTargetKind;
/** Desktop controls for CLIO-managed providers and supporting resources. */
export function ManagedServices({
  onConnectWebSearch,
  onDisconnectWebSearch,
  webSearchConnected = false,
  webSearchConnection,
  webSearchConnecting = false,
  webSearchDisconnecting = false,
  connectedAgentLabel,
  connectedAgentLocation,
  onConnectExistingService,
  onManageWebSearch,
  onManageRelay,
  relayStatus,
}: {
  onConnectWebSearch?: (remoteUrl: string) => void;
  onDisconnectWebSearch?: () => void;
  webSearchConnected?: boolean;
  webSearchConnection?: McpUserConfiguration;
  webSearchConnecting?: boolean;
  webSearchDisconnecting?: boolean;
  connectedAgentLabel?: string;
  connectedAgentLocation?: string;
  onConnectExistingService?: () => void;
  onManageWebSearch?: () => void;
  onManageRelay?: () => void;
  relayStatus?: RelayStatus;
}) {
  const desktop = inTauri();
  const repository = useRepository();
  const { isManagedConnection, settings } = useConnectionSettings();
  const [target, setTarget] = useInfrastructureState<Target>(
    settings.endpoint,
    'target-kind',
    'local',
  );
  const [targetId, setTargetId] = useInfrastructureState(settings.endpoint, 'target-id', 'local');
  const [sshHost, setSshHost] = useInfrastructureState<SshHost | undefined>(
    settings.endpoint,
    'ssh-host',
    undefined,
  );
  const [transportStatus, setTransportStatus] = useInfrastructureState<
    SshTransportStatus | undefined
  >(settings.endpoint, 'transport', undefined);
  const [deploying, setDeploying] = useInfrastructureState(
    settings.endpoint,
    `${targetId}:deploying`,
    false,
  );
  const [hostDetailsOpen, setHostDetailsOpen] = useInfrastructureState(
    settings.endpoint,
    'host-details-open',
    false,
  );
  const [tabs, setTabs] = useInfrastructureState<Record<string, string>>(
    settings.endpoint,
    `${targetId}:service-tabs`,
    {},
  );
  const [selectedProvider, setSelectedProvider] = useInfrastructureState(
    settings.endpoint,
    `${targetId}:provider`,
    '',
  );
  const [variants, setVariants] = useInfrastructureState<Record<string, string>>(
    settings.endpoint,
    `${targetId}:variants`,
    {},
  );
  const [configuration, setConfiguration] = useInfrastructureState<
    Record<string, Record<string, string>>
  >(settings.endpoint, `${targetId}:configuration`, {});
  const [results, setResults] = useInfrastructureState<Record<string, ServiceActionFeedback>>(
    settings.endpoint,
    `${targetId}:results`,
    {},
  );
  const savedServers = useSavedServers();
  const runningOperations = useManagedOperations(settings.endpoint, targetId);
  const [progress, setProgress] = useInfrastructureState<Record<string, string>>(
    settings.endpoint,
    `${targetId}:progress`,
    {},
  );
  const [operationIds, setOperationIds] = useInfrastructureState<Record<string, string>>(
    settings.endpoint,
    `${targetId}:operations`,
    {},
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTarget = searchParams.get('target');
  const requestedModel = searchParams.get('model');
  const appliedModelLink = useRef('');
  const modelSelection = useQuery({
    enabled: Boolean(requestedModel && requestedTarget === targetId),
    queryKey: ['model-inventory', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.modelInventory(targetId, signal),
    retry: false,
  });
  useEffect(() => {
    const key = `${settings.endpoint}:${targetId}:${requestedModel}`;
    if (!requestedModel || requestedTarget !== targetId || appliedModelLink.current === key) return;
    const selected = modelSelection.data?.models.find(
      (row) => row.id === requestedModel && row.state === 'ready',
    );
    if (!selected || modelSelection.data?.unavailable_reason) return;
    appliedModelLink.current = key;
    setSelectedProvider('vllm');
    setDeploying(true);
    setConfiguration((current) => ({
      ...current,
      vllm: {
        ...current.vllm,
        model: selected.destination,
        model_revision: selected.revision || '',
      },
    }));
  }, [
    modelSelection.data,
    requestedModel,
    requestedTarget,
    settings.endpoint,
    targetId,
    setSelectedProvider,
    setDeploying,
    setConfiguration,
  ]);
  const visitedTargetLink = useRef('');
  const canManageSshTargets = desktop && isManagedConnection;
  // The NSIS installer's Infrastructure page records a llama.cpp request as a
  // PREFERENCE only — it never installs a runtime itself. When set, this
  // finishes that intent by pointing the user at the model-runtime controls
  // already on this page instead of leaving the choice stranded.
  const installerLlamaCpp = useQuery({
    enabled: desktop,
    queryKey: ['installer-options', 'llama-cpp-requested'],
    queryFn: installerRequestedLlamaCpp,
    staleTime: Infinity,
  });
  const targets = useQuery({
    queryKey: ['infrastructure-targets', settings.endpoint],
    queryFn: ({ signal }) => repository.infrastructureTargets(signal),
    staleTime: 30_000,
  });
  useEffect(() => {
    const linkKey = `${settings.endpoint}:${requestedTarget}`;
    if (!requestedTarget || visitedTargetLink.current === linkKey) return;
    const selected = targets.data?.find((row) => row.id === requestedTarget);
    if (!selected || selected.kind === 'direct') return;
    visitedTargetLink.current = linkKey;
    setTargetId(selected.id);
    setTarget(selected.kind);
    setTransportStatus(undefined);
    setSshHost(
      selected.ssh
        ? {
            id: selected.id,
            label: selected.label,
            profile: selected.ssh.profile,
            host: selected.ssh.host,
            user: selected.ssh.user,
            port: selected.ssh.port,
            jumpHosts: selected.ssh.jump_hosts,
            identityFile: selected.ssh.identity_file,
            platform: selected.ssh.platform,
            installRoot: selected.install_root,
          }
        : undefined,
    );
  }, [
    settings.endpoint,
    requestedTarget,
    targets.data,
    targetId,
    setTargetId,
    setTarget,
    setTransportStatus,
    setSshHost,
  ]);
  const registerTarget = useMutation({
    mutationFn: async (host: SshHost) => {
      const definition = {
        kind: 'ssh' as const,
        label: host.label,
        install_root: host.installRoot,
        ssh: {
          profile: host.profile ?? '',
          host: host.host ?? '',
          user: host.user ?? '',
          port: host.port,
          identity_file: host.identityFile ?? '',
          jump_hosts: host.jumpHosts ?? [],
          platform: host.platform ?? 'auto',
        },
      };
      // Right after a reload the targets query may not have answered yet; asking
      // again here keeps a host from being registered twice (ares, ares-2, ...).
      const known = targets.data ?? (await repository.infrastructureTargets());
      const existing = known.find((candidate) => targetMatchesHost(candidate, host));
      if (existing) return repository.updateInfrastructureTarget(existing.id, definition);
      return repository.createInfrastructureTarget(definition);
    },
    onSuccess: async (registered) => {
      setTargetId(registered.id);
      const status = await attachInfrastructureSshTransport(
        settings.endpoint,
        settings.token,
        registered,
      );
      setTransportStatus(status);
      await repository.setInfrastructureTransportState(registered.id, status.state);
      await targets.refetch();
    },
  });
  const transportSessionId = transportStatus?.session_id;
  useEffect(() => {
    if (!transportSessionId) return;
    let active = true;
    const cleanup: Array<() => void> = [];
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      cleanup.push(
        await listen<SshStateEvent>('clio:ssh-transport-state', ({ payload }) => {
          if (!active || payload.session_id !== transportSessionId) return;
          setTransportStatus((current) =>
            current ? { ...current, state: payload.state, prompt: payload.prompt } : current,
          );
          void repository.setInfrastructureTransportState(targetId, payload.state);
          if (payload.state === 'connected') {
            void repository.infrastructureTargets().then(async (rows) => {
              const current = rows.find((row) => row.id === targetId);
              if (!current) return;
              const status = await attachInfrastructureSshTransport(
                settings.endpoint,
                settings.token,
                current,
              );
              if (active) setTransportStatus(status);
            });
          }
        }),
      );
      const snapshot = await sshTransportStatus(transportSessionId);
      if (active) setTransportStatus(snapshot);
    });
    return () => {
      active = false;
      cleanup.forEach((stop) => stop());
    };
  }, [
    repository,
    settings.endpoint,
    settings.token,
    targetId,
    transportSessionId,
    setTransportStatus,
  ]);
  const catalog = useQuery({
    enabled:
      target === 'local' ||
      Boolean(
        sshHost &&
          targetId !== 'local' &&
          (transportStatus?.state === 'connected' ||
            targets.data?.find((row) => row.id === targetId)?.transport_state === 'connected'),
      ),
    queryKey: ['managed-service-catalog', settings.endpoint, targetId],
    refetchInterval: Object.keys(runningOperations).length ? 3000 : false,
    queryFn: ({ signal }) => repository.managedServiceCatalog(targetId, signal),
    retry: false,
    staleTime: 30_000,
  });
  const action = useMutation({
    mutationFn: async ({ service_id, ...body }: ServiceActionInput & { service_id: string }) => {
      // The service id is the URL path; CLIO's action contract forbids extra body keys.
      const operation = await repository.runManagedServiceAction(service_id, body);
      setOperationIds((rows) => ({ ...rows, [service_id]: operation.id }));
      try {
        return await waitForOperation(repository, operation, undefined, (current) =>
          setProgress((rows) => ({ ...rows, [service_id]: current.progress })),
        );
      } finally {
        setProgress(({ [service_id]: _done, ...rows }) => rows);
        setOperationIds(({ [service_id]: _done, ...rows }) => rows);
      }
    },
    onMutate: (input) => {
      setResults((current) => {
        const next = { ...current };
        delete next[input.service_id];
        return next;
      });
    },
    onSuccess: async (result) => {
      setResults((current) => ({
        ...current,
        [result.service_id]: {
          action: result.action as ServiceAction,
          text:
            result.action === 'status'
              ? 'Status refreshed.'
              : result.action === 'logs'
                ? result.logs.trim() || 'No recent log output.'
                : ['install', 'reinstall', 'start'].includes(result.action)
                  ? `${result.action[0].toUpperCase()}${result.action.slice(1)} completed. View logs for the server output.`
                  : result.action === 'uninstall'
                    ? 'Runtime removal completed. Inspect storage for retained data.'
                    : result.action === 'delete_data'
                      ? 'Retained deployment data deleted.'
                      : `${result.action} completed.`,
        },
      }));
      if (['install', 'reinstall'].includes(result.action)) setDeploying(false);
      await catalog.refetch();
    },
    onError: (error, input) => {
      setResults((current) => ({
        ...current,
        [input.service_id]: {
          action: input.action as ServiceAction,
          error: true,
          text: error instanceof Error ? error.message : String(error),
        },
      }));
    },
  });
  const services = catalog.data?.services ?? [];
  // The installer banner follows observed installation state across navigation.
  const llamaCppService = services.find((service) => service.id === 'llama_cpp');
  const llamaCppInstalled =
    llamaCppService?.state === 'running' || llamaCppService?.state === 'stopped';

  const renderService = (service: ManagedServiceDefinition, setup = false) => {
    const agentConnectionUrl = service.connection_url;
    const webSearchTargetConnected =
      service.id === 'web_search' &&
      webSearchConnectionMatchesTarget(webSearchConnected, webSearchConnection, agentConnectionUrl);
    return (
      <ManagedServiceCard
        setup={setup}
        hostLabel={targetLabel(target, sshHost)}
        targetId={targetId}
        tab={tabs[service.id] ?? 'status'}
        onTab={(value) => setTabs((current) => ({ ...current, [service.id]: value }))}
        activeAction={
          action.isPending && action.variables?.service_id === service.id
            ? action.variables.action
            : (runningOperations[service.id]?.action as ServiceAction | undefined)
        }
        configuration={{ ...service.configuration, ...configuration[service.id] }}
        connectionStatus={
          service.id === 'web_search' && service.state === 'running' ? (
            <WebSearchServiceConnection
              connecting={action.isPending === false && webSearchConnecting}
              connection={webSearchConnection}
              targetUrl={agentConnectionUrl}
            />
          ) : undefined
        }
        key={service.id}
        onAction={(requestedAction) => {
          const applying = requestedAction === 'install' || requestedAction === 'reinstall';
          const variant = applying
            ? (variants[service.id] ?? service.recommended_variant)
            : service.recommended_variant;
          action.mutate({
            service_id: service.id,
            target_id: targetId,
            action: requestedAction,
            variant_id: variant,
            configuration: configurationForVariant(
              applying
                ? { ...service.configuration, ...configuration[service.id] }
                : service.configuration,
              service.parameters ?? [],
              variant,
            ),
          });
        }}
        onCancel={
          operationIds[service.id] || runningOperations[service.id]?.id
            ? () =>
                void repository.cancelInfrastructureOperation(
                  operationIds[service.id] || runningOperations[service.id].id,
                )
            : undefined
        }
        onConfiguration={(field, value) =>
          setConfiguration((current) => ({
            ...current,
            [service.id]: { ...current[service.id], [field]: value },
          }))
        }
        onVariant={(value) => setVariants((current) => ({ ...current, [service.id]: value }))}
        connectionAction={
          service.category === 'model_runtime' &&
          service.state === 'running' &&
          (!service.observation || service.observation.serving) &&
          agentConnectionUrl
            ? modelRuntimeInModels(savedServers.servers.data, service.id, agentConnectionUrl)
              ? { label: 'Open in Models', to: '/settings/providers' }
              : {
                  label: savedServers.save.isPending ? 'Adding to Models…' : 'Use in Models',
                  pending: savedServers.save.isPending,
                  onSelect: () =>
                    savedServers.save.mutate({
                      address: agentConnectionUrl,
                      label: `${service.label} (${targetLabel(target, sshHost)})`,
                      presetId: service.id,
                    }),
                }
            : service.id === 'web_search' && service.state === 'running'
              ? {
                  label: webSearchTargetConnected
                    ? webSearchDisconnecting
                      ? 'Disconnecting…'
                      : 'Disconnect'
                    : webSearchConnecting
                      ? 'Connecting…'
                      : `Connect to ${vocab.agent}`,
                  onSelect: webSearchTargetConnected
                    ? onDisconnectWebSearch
                    : !agentConnectionUrl
                      ? undefined
                      : () => onConnectWebSearch?.(agentConnectionUrl),
                  pending: webSearchTargetConnected ? webSearchDisconnecting : webSearchConnecting,
                  blockedReason: undefined,
                }
              : undefined
        }
        progress={progress[service.id] || runningOperations[service.id]?.progress}
        result={results[service.id]}
        service={service}
        variant={variants[service.id] ?? service.recommended_variant}
      />
    );
  };

  return (
    <section aria-labelledby="agent-services-title" className="mt-6 space-y-6">
      <AgentServicesOverview
        agentLabel={connectedAgentLabel}
        agentLocation={connectedAgentLocation}
        relay={relayStatus}
        webSearch={webSearchConnection}
        webSearchConnected={webSearchConnected}
        onManageWebSearch={onManageWebSearch}
        onManageRelay={onManageRelay}
      />
      <details
        className="rounded-xl border p-4"
        open={hostDetailsOpen}
        onToggle={(event) => setHostDetailsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium">
          Execution host · {targetLabel(target, sshHost)}{' '}
          <span className="ml-2 text-xs font-normal text-muted-foreground">Change or inspect</span>
        </summary>
        <div className="mt-4 space-y-4">
          {targets.data?.some((row) => row.kind === 'ssh') ? (
            <Field>
              <FieldLabel htmlFor="managed-known-host">Registered execution host</FieldLabel>
              <Select
                value={targetId}
                onValueChange={(value) =>
                  setSearchParams(
                    (previous) => {
                      const next = new URLSearchParams(previous);
                      next.set('target', value);
                      next.delete('model');
                      return next;
                    },
                    { replace: true },
                  )
                }
              >
                <SelectTrigger id="managed-known-host">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.data
                    .filter((row) => row.kind !== 'direct')
                    .map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.label}
                        {row.kind === 'ssh' ? ` · ${transportStateLabel(row.transport_state)}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {canManageSshTargets || !targets.data?.some((row) => row.kind === 'ssh') ? (
            <RadioGroup
              className={`grid gap-2 ${canManageSshTargets ? 'sm:grid-cols-2' : ''}`}
              onValueChange={(value) => {
                const next = value as Target;
                setTarget(next);
                if (next === 'local') {
                  setTargetId('local');
                  setSshHost(undefined);
                }
                setSearchParams(
                  (previous) => {
                    const params = new URLSearchParams(previous);
                    params.delete('target');
                    params.delete('model');
                    return params;
                  },
                  { replace: true },
                );
              }}
              value={target}
            >
              <TargetChoice
                description={
                  canManageSshTargets
                    ? 'Install and run services on this computer'
                    : `Install and run services beside this ${vocab.agent}`
                }
                icon={LaptopIcon}
                label={canManageSshTargets ? 'This computer' : `This ${vocab.agent}’s computer`}
                selected={target === 'local'}
                value="local"
              />
              {canManageSshTargets ? (
                <TargetChoice
                  description={`Let ${vocab.agent} manage a computer reached through Desktop SSH`}
                  icon={ServerIcon}
                  label="Another computer…"
                  selected={target === 'ssh'}
                  value="ssh"
                />
              ) : null}
            </RadioGroup>
          ) : null}
          {target === 'ssh' && canManageSshTargets ? (
            <Field>
              <FieldLabel>Saved SSH host</FieldLabel>
              <SshHostPicker
                onChange={(host) => {
                  setSshHost(host);
                  if (host) registerTarget.mutate(host);
                }}
                value={sshHost}
              />
              {registerTarget.error ? (
                <p className="text-xs text-destructive">{registerTarget.error.message}</p>
              ) : null}
              {sshHost ? (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span
                    className={
                      transportStatus?.state === 'connected'
                        ? 'text-success'
                        : transportStatus?.state === 'reauthentication_required'
                          ? 'text-warning'
                          : 'text-muted-foreground'
                    }
                    role="status"
                  >
                    {registerTarget.isPending
                      ? 'Reconnecting'
                      : transportStateLabel(
                          transportStatus?.state ??
                            targets.data?.find((item) => item.id === targetId)?.transport_state ??
                            'state_unknown',
                        )}
                  </span>
                  {transportStatus &&
                  ['disconnected', 'state_unknown'].includes(transportStatus.state) ? (
                    <Button
                      onClick={() => registerTarget.mutate(sshHost)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Connect
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {transportStatus?.prompt && transportStatus.state !== 'connected' ? (
                <SshAuthentication
                  prompt={transportStatus.prompt}
                  sessionId={transportStatus.session_id}
                />
              ) : null}
            </Field>
          ) : null}

          {catalog.data ? <ManagedServiceHostFacts facts={catalog.data.facts} /> : null}
          <Button
            disabled={catalog.isFetching}
            onClick={() => catalog.refetch()}
            size="sm"
            variant="outline"
          >
            {catalog.isFetching ? <Spinner aria-hidden="true" /> : <RefreshIcon />}Inspect again
          </Button>
        </div>
      </details>
      {catalog.isPending && catalog.fetchStatus === 'fetching' ? (
        <InspectionProgress host={sshHost} target={target} />
      ) : null}
      {catalog.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not inspect {targetLabel(target, sshHost)}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{catalog.error.message}</p>
            <Button onClick={() => catalog.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {installerLlamaCpp.data && !llamaCppInstalled ? (
        <Alert>
          <CpuIcon aria-hidden="true" />
          <AlertTitle>Finish setting up your local model runtime</AlertTitle>
          <AlertDescription>
            <Button
              onClick={() => {
                setSelectedProvider('llama_cpp');
                setDeploying(true);
              }}
              size="sm"
              variant="outline"
            >
              Finish setup
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ManagedServiceInventory
        endpoint={settings.endpoint}
        targetId={targetId}
        hostLabel={targetLabel(target, sshHost)}
        services={services.filter((row) => row.category !== 'remote_access' || target === 'ssh')}
        selected={selectedProvider}
        onSelected={setSelectedProvider}
        deploying={deploying}
        onDeploying={setDeploying}
        renderService={renderService}
        onConnectExisting={onConnectExistingService}
        operations={{
          ...Object.fromEntries(Object.entries(runningOperations).map(([id, row]) => [id, row.id])),
          ...operationIds,
        }}
        loading={catalog.isFetching}
      />
    </section>
  );
}

function transportStateLabel(state: SshTransportStatus['state']): string {
  return {
    connected: 'Connected',
    reconnecting: 'Reconnecting',
    reauthentication_required: 'Reauthentication required',
    disconnected: 'Disconnected',
    state_unknown: 'State unknown',
  }[state];
}
