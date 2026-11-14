import { useQuery, type QueryKey } from '@tanstack/react-query';
import { emptyAgentDelta, type AgentDelta, type WorkspaceReference } from '@clio/core/v3';
import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { connectionScope } from '@/lib/connection-scope';
import { serviceUnreachable } from '@/lib/connection-attempt';
import { ConnectedSourcePicker } from '@/components/clio/connected-source-picker';
import { SourceWorkOwnerContext } from '@/components/clio/source-work-owner';
import type { ObsidianChoice } from '@/components/clio/obsidian-source-form';
import { DraftAgentCompositionView } from '@/components/clio/agent-composition-view';
import { ClioAppShell } from '@/components/clio/app-shell';
import { ClioComposer } from '@/components/clio/composer';
import { agentDisplayName } from '@/lib/plugin-presentation';
import {
  DraftAgentChip,
  DraftCustomizeChip,
  DraftWorkspaceChip,
} from '@/components/clio/new-conversation-chips';
import {
  NewConversationBreadcrumb,
  NewConversationDraft,
} from '@/components/clio/new-conversation-draft';
import { ClioNavigation } from '@/components/clio/navigation';
import { listState } from '@/lib/list-state';
import { ClioDraftActions } from '@/components/clio/draft-actions';
import { TopBarEnd } from '@/components/clio/top-bar-end';
import { ClioDownloadsButton } from '@/components/clio/downloads-button';
import { ClioWorkbench, type ClioWorkbenchProps } from '@/components/clio/workbench';
import {
  WorkspaceActionAlerts,
  WorkspaceUnavailable,
  WorkspaceStatusStrip,
} from '@/components/clio/workspace-route-surfaces';
import {
  canUploadWorkspaceResources,
  canUseContextReferences,
} from '@/components/clio/workspace-route-state';
import {
  useComposerDraft,
  useComposerDraftValue,
  type ComposerDraft,
} from '@/hooks/use-composer-draft';
import { useSessionCommands } from '@/hooks/use-session-commands';
import { useConnectionIndicatorState } from '@/hooks/use-connection-indicator-state';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported } from '@/hooks/use-session-agent';
import { useSessionMutations } from '@/hooks/use-session-mutations';
import { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import { useModelCatalogStatus } from '@/hooks/use-model-catalog-status';
import { useQueryFetching } from '@/lib/query-notify';
import { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import { useWorkspaceWarmup } from '@/hooks/use-workspace-warmup';
import { newConversationRoute } from '@/lib/workspace-route-memory';
import { queryKeys } from '@/lib/query-keys';
import { DEFAULT_WORKSPACE_ID, workspaceName } from '@/lib/workspace-labels';
import { capitalize, vocab, welcomePlaceholder } from '@/lib/brand-vocabulary';
import { buildSessionAttentionMap } from '@/lib/session-attention';
import { useConnectionSettings } from '@/providers/connection-provider';
import { navigateComposerReference } from '@/lib/composer-reference-navigation';
import { openExternalUrlOrToast } from '@/tauri/external-url';
import { ph, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

/** An entry composer has no session identity, persistence, or session stream. */
export function NewConversationPage() {
  const { workspaceId = '' } = useParams();
  const { settings } = useConnectionSettings();
  return <WorkspaceDraft key={`${settings.endpoint}:${workspaceId}`} workspaceId={workspaceId} />;
}

/**
 * The workbench reads the Files fetch flag itself: each 5 s Files poll then
 * re-renders the workbench, not the whole draft page around it.
 */
function DraftWorkbench({
  filesKey,
  ...props
}: Omit<ClioWorkbenchProps, 'filesFetching'> & { filesKey: QueryKey }) {
  const filesFetching = useQueryFetching(filesKey);
  return <ClioWorkbench {...props} filesFetching={filesFetching} />;
}

type DraftComposerProps = Omit<
  ComponentProps<typeof ClioComposer>,
  'value' | 'onValueChange' | 'references' | 'onReferencesChange'
> & { draft: ComposerDraft };

/** Reads the draft text here, so a keystroke re-renders the composer and not the page. */
function DraftComposer({ draft, ...props }: DraftComposerProps) {
  const value = useComposerDraftValue(draft);
  return (
    <ClioComposer
      {...props}
      value={value}
      onValueChange={draft.onValueChange}
      references={draft.references}
      onReferencesChange={draft.onReferencesChange}
    />
  );
}

/**
 * What a draft takes with it when the "In" chip moves it to another workspace: the
 * route (and so the whole draft page) changes, so the person's model pick, agent and
 * text would otherwise be lost, and with no default model the next send is refused.
 */
interface MovedDraft {
  provider?: string;
  model?: string;
  agentRef?: string;
  text?: string;
}

function WorkspaceDraft({ workspaceId }: { workspaceId: string }) {
  const { settings } = useConnectionSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as {
    sourceConnection?: { scope: string; providerId: string; choice?: ObsidianChoice };
    movedDraft?: MovedDraft;
  } | null;
  const intent = routeState?.sourceConnection;
  const moved = routeState?.movedDraft;
  const carriedModel = moved?.provider && moved.model ? moved : undefined;
  const connectSource = intent?.scope === connectionScope(settings) ? intent : undefined;
  const connection = useConnectionIndicatorState();
  const repository = useRepository();
  const draft = useComposerDraft(workspaceId, { persist: false });
  const [filesViewActive, setFilesViewActive] = useState(false);
  const data = useWorkspaceData({
    contextTargetId: '',
    sessionId: '',
    workspaceId,
    filesViewActive,
  });
  const modelCatalogStatus = useModelCatalogStatus(data.modelCatalogStatus);
  const diffActions = useSessionDiffActions();
  const defaults = useQuery({
    queryKey: queryKeys.key('session-defaults', settings.endpoint),
    queryFn: ({ signal }) => repository.sessionDefaults(signal),
  });
  const provider =
    carriedModel?.provider ||
    defaults.data?.provider_id ||
    data.activeProvider ||
    data.capabilities.data?.active_model?.provider_id;
  const model =
    carriedModel?.model ||
    defaults.data?.model_id ||
    data.activeModel ||
    data.capabilities.data?.active_model?.model_id;
  const [agentChoice, setAgentChoice] = useState<string | undefined>(moved?.agentRef);
  const pickedModel = useRef<{ provider: string; model: string }>(undefined);
  useEffect(() => {
    // Once, on arrival: the moved draft's text, unless this workspace's draft has its own.
    if (moved?.text && !draft.readValue()) draft.onValueChange(moved.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the arrival state
  }, []);
  // Plugin changes made to the agent before the first message (the Agent tab).
  const [draftDelta, setDraftDelta] = useState<AgentDelta>(emptyAgentDelta);
  const draftChanges = draftDelta.add.length + draftDelta.remove.length;
  const { send, runDraftCommand, prepareFiles, discardFiles, openDraftBrowserPage, claimDraft } =
    useSessionMutations({
      activeProvider: provider,
      activeModel: model,
      sessionId: '',
      workspaceId,
      createOnSend: true,
      draftAgentRef: agentChoice || undefined,
      draftAgentDelta: draftDelta,
    });
  // Source work started here claims the draft as its conversation. Until the first
  // message it is still this draft, so the left bar keeps the one draft row for it.
  const [claimedId, setClaimedId] = useState('');
  const claimForSources = useMemo(
    () => async () => {
      const id = await claimDraft();
      setClaimedId(id);
      return id;
    },
    [claimDraft],
  );
  const { navigationActions } = useWorkspaceNavigationActions(workspaceId, '');
  const commands = useSessionCommands('', workspaceId);
  const sessions = useMemo(
    () => data.allSessions.data ?? data.sessions.data ?? [],
    [data.allSessions.data, data.sessions.data],
  );
  const attentions = useMemo(
    () => buildSessionAttentionMap(sessions, data.attentionInteractions),
    [sessions, data.attentionInteractions],
  );
  const workspace = data.workspaces.data?.find((item) => item.id === workspaceId);
  const {
    requests,
    revealWorkbench,
    openSubagent,
    openWorkspaceFile,
    openWorkspaceResource,
    openArtifact,
    openDiff,
  } = useWorkbenchNavigation({
    allSessions: sessions,
    workspaceId,
  });
  const openReference = async (reference: WorkspaceReference): Promise<void> => {
    try {
      const outcome = await navigateComposerReference({
        artifacts: [],
        diffs: [],
        openArtifact,
        openDiff,
        openExternal: openExternalUrlOrToast,
        openSession: (targetWorkspaceId, targetSessionId) =>
          void navigate(
            `/workspaces/${encodeURIComponent(targetWorkspaceId)}/sessions/${encodeURIComponent(targetSessionId)}`,
          ),
        openWorkspaceFile,
        openWorkspaceResource,
        reference,
        repository,
        resources: Object.fromEntries(
          (data.workspaceResources.data ?? []).map((item) => [item.id, item]),
        ),
        revealSession: () => revealWorkbench({ kind: 'session' }),
        sessionId: '',
        workspaceId,
      });
      if (outcome.status === 'unresolved')
        toast.error(t`Could not open reference`, { description: outcome.reason });
    } catch (error) {
      toast.error(t`Could not open reference`, {
        description:
          error instanceof Error ? error.message : t`Refresh the reference and try again.`,
      });
    }
  };
  const terminalActions = useWorkspaceTerminalActions(workspace?.path, revealWorkbench);
  const warmup = useWorkspaceWarmup(
    workspaceId,
    Boolean(
      workspace &&
        defaults.isSuccess &&
        data.capabilities.data?.capabilities.x_clio_workspace_warmup,
    ),
    defaults.data?.agent_ref,
  );
  // A warm-up that failed while the agent was unreachable is retried once it is
  // back, rather than showing the outage's error until the next 60 s refresh. Only
  // the return to live re-runs it: a refetch with no data resets the query to
  // pending, so retrying whenever it has failed would loop on a real failure.
  const warmupFailed = warmup.isError;
  const retryWarmup = warmup.refetch;
  const wasLive = useRef(connection === 'live');
  useEffect(() => {
    const back = connection === 'live' && !wasLive.current;
    wasLive.current = connection === 'live';
    if (back && warmupFailed) void retryWarmup();
  }, [connection, warmupFailed, retryWarmup]);
  const defaultRef = defaults.data?.default_agent_ref || defaults.data?.agent_ref || undefined;
  const draftRef = agentChoice || defaultRef || '';
  const openAgent = () => revealWorkbench({ kind: 'resources', section: 'agent' });
  const agentsSupported = useAgentPluginsSupported();
  // Only a first load that failed blocks the draft. A later refetch that fails (the agent
  // dropped) keeps the cached workspace on screen; the line under CLIO reports the drop.
  const loadError = (query: { data: unknown; error: Error | null }) =>
    query.data === undefined ? query.error : null;
  const error = loadError(data.workspaces) ?? loadError(data.capabilities) ?? loadError(defaults);
  const navigation = (
    <ClioNavigation
      activeSessionId=""
      activeWorkspaceId={workspaceId}
      actions={navigationActions}
      attentions={attentions}
      agents={data.installedAgents.data ?? []}
      endpoint={settings.endpoint}
      onOpenWorkspaceFiles={() => revealWorkbench({ kind: 'resources', section: 'files' })}
      sessions={sessions}
      draftSessionId={claimedId || undefined}
      workspaces={data.workspaces.data ?? []}
      workspacesState={listState(data.workspaces)}
    />
  );
  if (error || (!data.workspaces.isPending && !workspace)) {
    // The bars stay: the left bar still lists every other workspace and conversation.
    return (
      <ClioAppShell
        navigation={navigation}
        contextBar={
          <div className="min-w-0 truncate text-ui font-medium">
            {t`${ph({ workspace: capitalize(vocab.workspace) })} unavailable`}
          </div>
        }
        statusStrip={<WorkspaceStatusStrip activeWorkCount={0} stream={connection} />}
        workbench={<div aria-label={t`Workspace canvas`} className="h-full bg-background" />}
      >
        <WorkspaceUnavailable
          back={
            workspaceId === DEFAULT_WORKSPACE_ID
              ? undefined
              : { label: t`Back to Conversations`, to: newConversationRoute(DEFAULT_WORKSPACE_ID) }
          }
          error={error ?? undefined}
          onRetry={() => {
            void data.workspaces.refetch();
            void data.capabilities.refetch();
            void defaults.refetch();
          }}
          subject="workspace"
        />
      </ClioAppShell>
    );
  }
  const page = (
    <ClioAppShell
      navigation={navigation}
      contextBar={
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <NewConversationBreadcrumb
              workspaceId={workspace?.id}
              workspaceLabel={workspace ? workspaceName(workspace) : undefined}
            />
          </div>
          {/* The ⋯ ends the top bar, after the canvas icon, as on a conversation. */}
          <TopBarEnd>
            <ClioDraftActions
              disabled={!workspace || send.isPending}
              onOpen={(section) => revealWorkbench({ kind: 'resources', section })}
              onOpenSystemTerminal={terminalActions.onOpenSystemTerminal}
            />
          </TopBarEnd>
          <ClioDownloadsButton />
        </div>
      }
      statusStrip={<WorkspaceStatusStrip activeWorkCount={0} stream={connection} />}
      workbenchReveal={requests}
      workbench={
        <DraftWorkbench
          filesKey={data.workspaceFilesKey}
          workspaceId={workspaceId}
          sessionId=""
          files={data.workspaceFiles.data?.entries ?? []}
          filesError={data.workspaceFiles.error?.message}
          filesPending={data.workspaceFiles.isPending}
          filesTruncated={data.workspaceFiles.data?.truncated ?? false}
          filesNextOffset={data.workspaceFiles.data?.next_offset}
          onFilesViewActiveChange={setFilesViewActive}
          onRefreshFiles={() => void data.workspaceFiles.refetch()}
          resources={data.workspaceResources.data ?? []}
          resourcesError={data.workspaceResources.error?.message}
          resourcesPending={data.workspaceResources.isPending}
          artifacts={[]}
          diffs={[]}
          sessionView={
            <p className="p-6 text-sm text-muted-foreground">
              {t`Session activity appears after you send your first message.`}
            </p>
          }
          agentView={
            draftRef ? (
              <DraftAgentCompositionView
                draft={{ ref: draftRef, delta: draftDelta }}
                onChange={(next) => {
                  if (next.ref !== draftRef) setAgentChoice(next.ref);
                  setDraftDelta(next.delta);
                }}
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                {t`The default agent has nothing to change here. Choose an agent next to “with” to customize its plugins, prompt and tools.`}
              </p>
            )
          }
          onUndoDiff={(sessionId, workspaceId, changeId) =>
            diffActions.undo.mutateAsync({ sessionId, workspaceId, changeId })
          }
          diffActionError={diffActions.undoError?.message}
          diffActionPending={diffActions.undoPending}
          onOpenSubagent={openSubagent}
          onOpenTerminal={terminalActions.onOpenTerminal}
          onOpenDraftBrowserPage={openDraftBrowserPage}
          requests={requests}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col justify-center overflow-y-auto px-4 py-8 sm:px-8">
        <WorkspaceActionAlerts
          notice={
            // A failed send is reported once, by the composer's own toast with a
            // plain reason and Retry; it is not repeated here as raw HTTP text.
            // A failed warm-up is no action of the person's, so it is not "That action
            // didn't run": the row says what failed and that sending still works.
            // While the agent is unreachable the left bar already says so; a warm-up
            // that failed for the same reason is not a separate failure. The probe can
            // read live for a while after a drop, and for a frame before the re-run
            // after recovery, so an unreachable failure never shows here.
            warmup.error &&
            !serviceUnreachable(warmup.error) &&
            connection === 'live' &&
            !warmup.isFetching
              ? t`Tools could not be prepared in advance: ${ph({ reason: warmup.error.message.replace(/\.+$/, '') })}. You can still send a message.`
              : undefined
          }
        />
        <NewConversationDraft
          setup={
            <>
              <Trans>
                <span>In</span>{' '}
                <DraftWorkspaceChip
                  workspaces={data.workspaces.data ?? []}
                  workspaceId={workspaceId}
                  disabled={send.isPending}
                  onSelect={(id) => {
                    const pick =
                      pickedModel.current ?? (provider && model ? { provider, model } : {});
                    const movedDraft: MovedDraft = {
                      ...pick,
                      agentRef: agentChoice,
                      text: draft.readValue(),
                    };
                    void navigate(newConversationRoute(id), { replace: true, state: { movedDraft } });
                  }}
                />{' '}
                <span>with</span>{' '}
                <DraftAgentChip
                  agents={data.installedAgents.data}
                  agentsError={data.installedAgents.error?.message}
                  pending={data.installedAgents.isPending && agentsSupported !== false}
                  agentRef={draftRef}
                  defaultRef={defaultRef}
                  changes={draftChanges}
                  disabled={send.isPending}
                  onSelect={(ref) => {
                    setAgentChoice(ref);
                    setDraftDelta(emptyAgentDelta);
                  }}
                  onManageAgents={openAgent}
                />
              </Trans>
              {agentsSupported !== false ? (
                <DraftCustomizeChip
                  changes={draftChanges}
                  disabled={send.isPending}
                  onCustomize={openAgent}
                />
              ) : null}
            </>
          }
        >
          <DraftComposer
            draft={draft}
            autoFocus
            attachments={canUploadWorkspaceResources(data.capabilities.data?.capabilities)}
            contextReferences={canUseContextReferences(data.capabilities.data?.capabilities)}
            capabilitiesPending={data.capabilities.isPending}
            disabled={send.isPending || runDraftCommand.isPending}
            sending={send.isPending}
            connecting={!workspace || defaults.isPending}
            state={send.isPending || runDraftCommand.isPending ? 'queued' : 'completed'}
            commands={commands.commands}
            commandsState={commands.commandsState}
            onCommand={async (value) => {
              await runDraftCommand.mutateAsync(value);
            }}
            provider={provider}
            model={model}
            onModelChange={(option) => {
              pickedModel.current = { provider: option.providerId, model: option.id };
            }}
            modelOptions={data.modelOptions}
            modelCatalogStatus={modelCatalogStatus}
            configuredEffort={data.configuredEffort}
            effort={defaults.data?.effort}
            executionMode={
              defaults.data?.mode === 'plan'
                ? 'plan'
                : defaults.data?.mode === 'architect'
                  ? 'deep_research'
                  : 'execute'
            }
            confirmationPolicy={
              defaults.data?.approval_mode === 'unknown' ? 'ask' : defaults.data?.approval_mode
            }
            onRetryModelCatalog={() => void data.providerCatalog.refetch()}
            onPrepareFiles={prepareFiles}
            onDiscardFiles={discardFiles}
            onOpenReference={(reference) => void openReference(reference)}
            onOpenResource={openWorkspaceResource}
            onSubmit={async (value) => {
              await send.mutateAsync(value);
            }}
            resources={data.workspaceResources.data ?? []}
            variant="welcome"
            placeholder={welcomePlaceholder(
              draftRef && data.installedAgents.data
                ? agentDisplayName(draftRef, data.installedAgents.data)
                : undefined,
            )}
            workspaceId={workspaceId}
          />
        </NewConversationDraft>
      </div>
      {connectSource && workspace && (
        <ConnectedSourcePicker
          workspaceId={workspaceId}
          open
          initialProviderId={connectSource.providerId}
          initialObsidianChoice={connectSource.choice}
          onOpenChange={(open) => {
            if (!open) void navigate(location.pathname, { replace: true, state: null });
          }}
        />
      )}
    </ClioAppShell>
  );
  return <SourceWorkOwnerContext value={claimForSources}>{page}</SourceWorkOwnerContext>;
}
