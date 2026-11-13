import { inTauri } from '@/lib/transport/tauri-runtime';
import { installerRequestedLlamaCpp } from '@/lib/installer-infrastructure';
import {
  INSTALL_FROM_SCRATCH_KEY,
  type ServiceActionInput,
  type ManagedServiceDefinition,
  type ProvenanceConnectionInput,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CpuIcon, LinkIcon, PlugIcon } from 'lucide-react';
import { RefreshButton } from './refresh-button';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfrastructureState } from '@/hooks/use-infrastructure-state';
import { useInfrastructureTargetSelection } from '@/hooks/use-infrastructure-target-selection';
import { useRegisterInfrastructureTarget } from '@/hooks/use-register-infrastructure-target';
import { useManagedOperations } from '@/hooks/use-managed-operations';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AddIcon, InfoIcon } from '@/lib/icon-vocabulary';
import { useRepository } from '@/hooks/use-repository';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { vocab } from '@/lib/brand-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ToolsSettings } from './settings-tools';
import {
  ManagedServiceCard,
  type ServiceAction,
  type ServiceActionFeedback,
} from './managed-service-card';
import { ManagedServiceHostSelector } from './managed-service-host-selector';
import { ManagedServiceHostFacts } from './managed-service-host-facts';
import type { SshTransportStatus } from '@/tauri/ssh-infrastructure-transport';
import { SshAuthentication } from './managed-service-target';
import { InfraTabActions } from './infrastructure-tab-actions';
import { DialogFrame } from './primitives/dialog-frame';
import { MenuRow } from './primitives/menu-row';
import { SplitButton } from './primitives/split-button';
import { StateView } from './primitives/state-view';
import { useShownByPage } from './infrastructure-reachability';
import {
  configurationForVariant,
  modelRuntimeServer,
  targetLabel,
  waitForOperation,
} from './managed-service-target-utils';
import { ManagedServiceInventory } from './managed-service-inventory';
import { engineId, servicesWithInstances } from './managed-service-gpus';
import { t, ph } from '@lingui/core/macro';

/** Desktop controls for CLIO-managed providers and supporting resources. */
export function ManagedServices({
  connectedAgentLocation,
  onConnectExistingService,
  onConnectProvenance,
}: {
  connectedAgentLabel?: string;
  connectedAgentLocation?: string;
  onConnectExistingService?: () => void;
  onConnectProvenance?: (input: ProvenanceConnectionInput) => void;
}) {
  const desktop = inTauri();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { isManagedConnection, settings } = useConnectionSettings();
  const targets = useQuery({
    queryKey: ['infrastructure-targets', settings.endpoint],
    queryFn: ({ signal }) => repository.infrastructureTargets(signal),
    staleTime: 30_000,
  });
  const {
    target,
    targetId,
    sshHost,
    transportStatus,
    selectTarget,
    setTarget,
    setTargetId,
    setSshHost,
    setTransportStatus,
  } = useInfrastructureTargetSelection(targets.data ?? []);
  const [deploying, setDeploying] = useInfrastructureState(
    settings.endpoint,
    `${targetId}:deploying`,
    false,
  );
  const [hostDetailsOpen, setHostDetailsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
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
  // Named instances set up here (`vllm@spotter` -> `vllm`) until CLIO reports them.
  const [instances, setInstances] = useInfrastructureState<Record<string, string>>(
    settings.endpoint,
    `${targetId}:instances`,
    {},
  );
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
  // The latest operation per service, kept past its end for the failure view.
  const lastOperations = useRef<Record<string, string>>({});
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
  const visitedTargetLink = useRef('');
  const canManageSshTargets = desktop && isManagedConnection;
  const executionHostLabel =
    target === 'local'
      ? t`Local`
      : targets.data?.find((row) => row.id === targetId)?.label || targetLabel(target, sshHost);
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
  useEffect(() => {
    const linkKey = `${settings.endpoint}:${requestedTarget}`;
    if (!requestedTarget || visitedTargetLink.current === linkKey) return;
    if (!targets.data?.some((row) => row.id === requestedTarget)) return;
    visitedTargetLink.current = linkKey;
    selectTarget(requestedTarget);
  }, [settings.endpoint, requestedTarget, targets.data, selectTarget]);
  const registerTarget = useRegisterInfrastructureTarget();
  const connectComputer = async (host: NonNullable<typeof sshHost>) => {
    const { registered, status } = await registerTarget.mutateAsync(host);
    setTarget('ssh');
    setSshHost(host);
    setTargetId(registered.id);
    setTransportStatus(status);
  };
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
  const catalogErrorShownByPage = useShownByPage(catalog.error);
  const action = useMutation({
    mutationFn: async ({ service_id, ...body }: ServiceActionInput & { service_id: string }) => {
      // The service id is the URL path; CLIO's action contract forbids extra body keys.
      const operation = await repository.runManagedServiceAction(service_id, body);
      lastOperations.current[service_id] = operation.id;
      setOperationIds((rows) => ({ ...rows, [service_id]: operation.id }));
      // The inventory follows operations closely only once it sees this one.
      void queryClient.invalidateQueries({
        queryKey: ['infrastructure-inventory', settings.endpoint],
      });
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
          operationId: result.id,
          text:
            result.action === 'status'
              ? t`Status refreshed.`
              : result.action === 'logs'
                ? result.logs.trim() || t`No recent log output.`
                : result.action === 'install'
                  ? t`Install completed. View logs for the server output.`
                  : result.action === 'reinstall'
                    ? t`Reinstall completed. View logs for the server output.`
                    : result.action === 'start'
                      ? t`Start completed. View logs for the server output.`
                      : result.action === 'uninstall'
                        ? t`Runtime removal completed. Inspect storage for retained data.`
                        : result.action === 'delete_data'
                          ? t`Retained deployment data deleted.`
                          : t`${ph({ action: result.action })} completed.`,
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
          operationId: lastOperations.current[input.service_id],
          error: true,
          text: error instanceof Error ? error.message : String(error),
        },
      }));
    },
  });
  useEffect(() => {
    const key = `${settings.endpoint}:${targetId}:${requestedModel}`;
    if (!requestedModel || requestedTarget !== targetId || appliedModelLink.current === key) return;
    const selected = modelSelection.data?.models.find(
      (row) => row.id === requestedModel && row.state === 'ready',
    );
    if (!selected || modelSelection.data?.unavailable_reason) return;
    appliedModelLink.current = key;
    setSelectedProvider('');
    setDeploying(true);
    setConfiguration((current) => ({
      ...current,
      llama_cpp: {
        ...current.llama_cpp,
        model_path: selected.file_path?.endsWith('.gguf') ? selected.file_path : '',
        hf_model: '',
      },
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
  // `?service=<id>` (Overview's Install / Start links) opens that service's panel once.
  const requestedService = searchParams.get('service');
  const appliedServiceLink = useRef('');
  useEffect(() => {
    const key = `${settings.endpoint}:${targetId}:${requestedService}`;
    if (!requestedService || (requestedTarget ?? 'local') !== targetId) return;
    if (appliedServiceLink.current === key) return;
    if (!catalog.data?.services.some((row) => row.id === requestedService)) return;
    appliedServiceLink.current = key;
    setDeploying(false);
    setSelectedProvider(requestedService);
  }, [
    catalog.data,
    requestedService,
    requestedTarget,
    settings.endpoint,
    targetId,
    setSelectedProvider,
    setDeploying,
  ]);
  const services = servicesWithInstances(catalog.data?.services ?? [], instances);
  const gpus = catalog.data?.facts.gpus ?? [];
  // The installer banner follows observed installation state across navigation.
  const llamaCppService = services.find((service) => service.id === 'llama_cpp');
  const llamaCppInstalled =
    llamaCppService?.state === 'running' || llamaCppService?.state === 'stopped';

  const connectionFor = (
    service: ManagedServiceDefinition,
  ): ComponentProps<typeof ManagedServiceCard>['connectionAction'] => {
    const agentConnectionUrl = service.connection_url;
    const configuredModelServer = agentConnectionUrl
      ? modelRuntimeServer(savedServers.servers.data, engineId(service), agentConnectionUrl)
      : undefined;
    return service.category === 'monitoring' && service.state === 'running' && onConnectProvenance
      ? {
          label: t`Connect`,
          blockedReason:
            targetId !== 'local'
              ? t`Connect to the ${ph({ agent: vocab.agent })} on this execution host to configure its local provenance settings.`
              : undefined,
          onSelect: () =>
            onConnectProvenance({
              service_id: service.id === 'flowcept' ? 'flowcept' : 'cmf',
              label: service.label,
              url: agentConnectionUrl ?? service.connection_url ?? '',
              ...(service.id === 'flowcept'
                ? { settings_path: service.configuration.flowcept_settings ?? '' }
                : {}),
            }),
        }
      : service.category === 'model_runtime' &&
          agentConnectionUrl &&
          (configuredModelServer ||
            (service.state === 'running' && (!service.observation || service.observation.serving)))
        ? configuredModelServer
          ? {
              label: savedServers.remove.isPending ? t`Disconnecting…` : t`Disconnect`,
              connected: true,
              pending: savedServers.remove.isPending,
              onSelect: () => savedServers.remove.mutate(configuredModelServer.id),
            }
          : {
              label: savedServers.save.isPending ? t`Connecting…` : t`Connect`,
              connected: false,
              pending: savedServers.save.isPending,
              onSelect: () =>
                savedServers.save.mutate({
                  address: agentConnectionUrl,
                  label: `${service.label} (${executionHostLabel})`,
                  presetId: engineId(service),
                }),
            }
        : undefined;
  };
  const renderService = (service: ManagedServiceDefinition, setup = false) => {
    return (
      <ManagedServiceCard
        gpus={gpus}
        setup={setup}
        hostLabel={executionHostLabel}
        targetId={targetId}
        tab={tabs[service.id] ?? 'status'}
        onTab={(value) => setTabs((current) => ({ ...current, [service.id]: value }))}
        activeAction={
          action.isPending && action.variables?.service_id === service.id
            ? action.variables.action
            : (runningOperations[service.id]?.action as ServiceAction | undefined)
        }
        configuration={{ ...service.configuration, ...configuration[service.id] }}
        key={`${targetId}:${service.id}`}
        onAction={(requestedAction, options) => {
          const applying = requestedAction === 'install' || requestedAction === 'reinstall';
          const variant = applying
            ? (variants[service.id] ?? service.recommended_variant)
            : service.recommended_variant;
          action.mutate({
            service_id: service.id,
            target_id: targetId,
            action: requestedAction,
            variant_id: variant,
            configuration: {
              ...configurationForVariant(
                applying
                  ? { ...service.configuration, ...configuration[service.id] }
                  : service.configuration,
                service.parameters ?? [],
                variant,
              ),
              // One operation only: CLIO never persists it.
              ...(applying && options?.fromScratch ? { [INSTALL_FROM_SCRATCH_KEY]: 'true' } : {}),
            },
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
        onResetConfiguration={() => setConfiguration(({ [service.id]: _discard, ...rest }) => rest)}
        onVariant={(value) => setVariants((current) => ({ ...current, [service.id]: value }))}
        connectionAction={connectionFor(service)}
        operation={
          operationIds[service.id] || runningOperations[service.id]?.id
            ? {
                id: operationIds[service.id] || runningOperations[service.id].id,
                initial: runningOperations[service.id],
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

  const transportState =
    transportStatus?.state ??
    targets.data?.find((row) => row.id === targetId)?.transport_state ??
    'state_unknown';
  const mcpComputerLabel =
    connectedAgentLocation || targets.data?.find((item) => item.kind === 'local')?.label;
  const startInstall = () => {
    setSelectedProvider('');
    setDeploying(true);
  };
  const serviceVariants = (
    <>
      {onConnectExistingService ? (
        <DropdownMenuItem onSelect={onConnectExistingService}>
          <MenuRow icon={<LinkIcon />} label={t`Connect an existing service`} />
        </DropdownMenuItem>
      ) : null}
      {onConnectExistingService ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem onSelect={() => setMcpOpen(true)}>
        <MenuRow icon={<PlugIcon />} label={t`MCP services`} submenu />
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setHostDetailsOpen(true)}>
        <MenuRow icon={<InfoIcon />} label={t`Computer details`} submenu />
      </DropdownMenuItem>
    </>
  );

  return (
    <section aria-label={t`Services`} className="flex min-w-0 flex-col gap-3 pt-2">
      <InfraTabActions
        fold={{
          label: t`More service actions`,
          verb: (
            <SplitButton
              icon={<AddIcon />}
              label={t`Install service`}
              menuLabel={t`More ways to add a service`}
              onClick={startInstall}
              showLabel
              variant="default"
            >
              {serviceVariants}
            </SplitButton>
          ),
          menu: (
            <>
              <DropdownMenuItem onSelect={startInstall}>
                <MenuRow icon={<AddIcon />} label={t`Install service`} />
              </DropdownMenuItem>
              {serviceVariants}
            </>
          ),
        }}
      >
        <ManagedServiceHostSelector
          targets={targets.data ?? []}
          targetId={targetId}
          canAdd={canManageSshTargets}
          sshHost={sshHost}
          pending={registerTarget.isPending}
          error={registerTarget.error?.message}
          onSelect={(id) => {
            selectTarget(id);
            setSearchParams(
              (previous) => {
                const params = new URLSearchParams(previous);
                params.set('target', id);
                params.delete('model');
                return params;
              },
              { replace: true },
            );
          }}
          onSshHost={connectComputer}
        />
      </InfraTabActions>
      {target === 'ssh' && transportState !== 'connected' ? (
        <StateView
          action={
            sshHost && canManageSshTargets && !registerTarget.isPending
              ? {
                  label: t`Reconnect`,
                  onClick: () => void connectComputer(sshHost).catch(() => undefined),
                }
              : undefined
          }
          kind="unavailable"
          size="row"
          title={`${executionHostLabel}: ${transportStateLabel(transportState)}`}
        />
      ) : null}
      {transportStatus?.prompt && transportStatus.state !== 'connected' ? (
        <SshAuthentication prompt={transportStatus.prompt} sessionId={transportStatus.session_id} />
      ) : null}
      {catalog.isPending && catalog.fetchStatus === 'fetching' ? (
        <StateView
          detail={
            target === 'ssh'
              ? t`Checking the SSH connection, operating system, Docker, runtimes, acceleration, and existing ${ph({ agent: vocab.agent })} services.`
              : t`Checking the operating system, Docker, local runtimes, acceleration, and existing ${ph({ agent: vocab.agent })} services.`
          }
          kind="loading"
          size="panel"
          title={
            target === 'ssh'
              ? t`Connecting to ${ph({ host: targetLabel(target, sshHost) })}`
              : t`Inspecting this computer`
          }
        />
      ) : null}
      {target === 'ssh' && !catalog.data && catalog.fetchStatus === 'idle' && !catalog.error ? (
        <StateView
          kind="unavailable"
          size="panel"
          title={t`Connect ${executionHostLabel} through Desktop to inspect and manage its services.`}
        />
      ) : null}
      {catalog.error && !catalogErrorShownByPage ? (
        <StateView
          action={{ label: t`Try again`, onClick: () => void catalog.refetch() }}
          detail={catalog.error.message}
          kind="error"
          size="panel"
          title={t`Could not inspect ${executionHostLabel}`}
        />
      ) : null}
      {installerLlamaCpp.data && !llamaCppInstalled ? (
        <StateView
          action={{
            label: t`Finish setup`,
            onClick: () => {
              setSelectedProvider('llama_cpp');
              setDeploying(true);
            },
          }}
          icon={CpuIcon}
          kind="unavailable"
          size="row"
          title={t`Finish setting up your local model runtime`}
        />
      ) : null}
      <ManagedServiceInventory
        endpoint={settings.endpoint}
        hostLabel={executionHostLabel}
        services={services.filter((row) => row.category !== 'remote_access' || target === 'ssh')}
        selected={selectedProvider}
        onSelected={setSelectedProvider}
        deploying={deploying}
        onDeploying={setDeploying}
        renderService={renderService}
        onOpenTab={(id, tab) => setTabs((current) => ({ ...current, [id]: tab }))}
        operations={{
          ...Object.fromEntries(Object.entries(runningOperations).map(([id, row]) => [id, row.id])),
          ...operationIds,
        }}
        model={modelSelection.data?.models.find((row) => row.id === requestedModel)}
        connectionFor={connectionFor}
        onRun={(service, requestedAction) =>
          action.mutate({
            service_id: service.id,
            target_id: targetId,
            action: requestedAction,
            variant_id: service.recommended_variant,
            configuration: service.configuration,
          })
        }
        busyService={action.isPending ? action.variables?.service_id : undefined}
        gpus={gpus}
        onAddInstance={(base, name) => {
          const id = `${base.id}@${name}`;
          setInstances((current) => ({ ...current, [id]: base.id }));
          setDeploying(true);
          setSelectedProvider(id);
        }}
        feedback={results}
        loading={catalog.isFetching}
        unavailable={!catalog.data || Boolean(catalog.error)}
      />
      <DialogFrame
        className="w-[clamp(360px,52vw,720px)]"
        description={
          mcpComputerLabel
            ? t`Model Context Protocol services the ${ph({ agent: vocab.agent })} on ${mcpComputerLabel} uses.`
            : t`Model Context Protocol services the ${ph({ agent: vocab.agent })} on this computer uses.`
        }
        icon={<PlugIcon />}
        onOpenChange={setMcpOpen}
        open={mcpOpen}
        title={t`MCP services`}
      >
        <div className="clio-scrollbar max-h-[60dvh] overflow-y-auto">
          <ToolsSettings embedded computerLabel={mcpComputerLabel} />
        </div>
      </DialogFrame>
      <DialogFrame
        description={executionHostLabel}
        icon={<InfoIcon />}
        onOpenChange={setHostDetailsOpen}
        open={hostDetailsOpen}
        secondary={
          <RefreshButton
            label={t`Inspect again`}
            refreshing={catalog.isFetching}
            onRefresh={() => catalog.refetch()}
            size="sm"
            variant="ghost"
          />
        }
        title={t`Computer details`}
      >
        {catalog.data ? (
          <ManagedServiceHostFacts facts={catalog.data.facts} />
        ) : (
          <StateView kind="empty" size="row" title={t`Not inspected yet`} />
        )}
      </DialogFrame>
    </section>
  );
}
function transportStateLabel(state: SshTransportStatus['state']): string {
  return {
    connected: t`Connected`,
    reconnecting: t`Reconnecting`,
    reauthentication_required: t`Reauthentication required`,
    disconnected: t`Disconnected`,
    state_unknown: t`State unknown`,
  }[state];
}
