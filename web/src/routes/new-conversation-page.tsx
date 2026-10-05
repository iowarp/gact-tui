import { useQuery } from '@tanstack/react-query';
import type { WorkspaceReference } from '@clio/core/v3';
import { toast } from 'sonner';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClioAppShell } from '@/components/clio/app-shell';
import { ClioComposer } from '@/components/clio/composer';
import { ClioConversationWelcome } from '@/components/clio/conversation-welcome';
import { ClioNavigation } from '@/components/clio/navigation';
import { ClioWorkbench } from '@/components/clio/workbench';
import {
  WorkspaceActionAlerts,
  WorkspaceUnavailable,
} from '@/components/clio/workspace-route-surfaces';
import {
  canUploadWorkspaceResources,
  canUseContextReferences,
} from '@/components/clio/workspace-route-state';
import { useComposerDraft } from '@/hooks/use-composer-draft';
import { useDesktopTitleSync } from '@/hooks/use-desktop-title-sync';
import { useRepository } from '@/hooks/use-repository';
import { useSessionMutations } from '@/hooks/use-session-mutations';
import { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import { useWorkspaceWarmup } from '@/hooks/use-workspace-warmup';
import { newConversationRoute } from '@/lib/workspace-route-memory';
import { queryKeys } from '@/lib/query-keys';
import { buildSessionAttentionMap } from '@/lib/session-attention';
import { useConnectionSettings } from '@/providers/connection-provider';
import { navigateComposerReference } from '@/lib/composer-reference-navigation';
import { openExternalUrlOrToast } from '@/tauri/external-url';

/** An entry composer has no session identity, persistence, or session stream. */
export function NewConversationPage() {
  const { workspaceId = '' } = useParams();
  const { settings } = useConnectionSettings();
  return <WorkspaceDraft key={`${settings.endpoint}:${workspaceId}`} workspaceId={workspaceId} />;
}

function WorkspaceDraft({ workspaceId }: { workspaceId: string }) {
  const { settings } = useConnectionSettings();
  const navigate = useNavigate();
  const repository = useRepository();
  const draft = useComposerDraft(workspaceId, { persist: false });
  const [filesViewActive, setFilesViewActive] = useState(false);
  const data = useWorkspaceData({
    contextTargetId: '',
    sessionId: '',
    workspaceId,
    filesViewActive,
  });
  const diffActions = useSessionDiffActions();
  const defaults = useQuery({
    queryKey: queryKeys.key('session-defaults', settings.endpoint),
    queryFn: ({ signal }) => repository.sessionDefaults(signal),
  });
  const provider =
    defaults.data?.provider_id ||
    data.activeProvider ||
    data.capabilities.data?.active_model?.provider_id;
  const model =
    defaults.data?.model_id || data.activeModel || data.capabilities.data?.active_model?.model_id;
  const { send, prepareFiles, discardFiles } = useSessionMutations({
    activeProvider: provider,
    activeModel: model,
    sessionId: '',
    workspaceId,
    createOnSend: true,
  });
  const { navigationActions } = useWorkspaceNavigationActions(workspaceId, '');
  const sessions = data.allSessions.data ?? data.sessions.data ?? [];
  const workspace = data.workspaces.data?.find((item) => item.id === workspaceId);
  const {
    activeRequest,
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
        toast.error('Could not open reference', { description: outcome.reason });
    } catch (error) {
      toast.error('Could not open reference', {
        description:
          error instanceof Error ? error.message : 'Refresh the reference and try again.',
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
    defaults.data?.blueprint_id,
  );
  useDesktopTitleSync({ workspace: workspace?.display_name, session: 'New conversation' });
  const error = data.workspaces.error ?? data.capabilities.error ?? defaults.error;
  if (error || (!data.workspaces.isPending && !workspace)) {
    return (
      <WorkspaceUnavailable
        error={error?.message ?? 'This workspace is unavailable.'}
        onRetry={() => {
          void data.workspaces.refetch();
          void data.capabilities.refetch();
          void defaults.refetch();
        }}
      />
    );
  }
  return (
    <ClioAppShell
      navigation={
        <ClioNavigation
          activeSessionId=""
          activeWorkspaceId={workspaceId}
          actions={navigationActions}
          attentions={buildSessionAttentionMap(sessions, data.attentionInteractions)}
          blueprints={data.agentBlueprints.data ?? []}
          endpoint={settings.endpoint}
          onOpenWorkspaceFiles={() => revealWorkbench({ kind: 'resources', section: 'files' })}
          sessions={sessions}
          workspaces={data.workspaces.data ?? []}
        />
      }
      contextBar={
        <label className="flex items-center gap-2 text-sm">
          <span>New conversation in</span>
          <select
            aria-label="Conversation workspace"
            className="min-w-0 rounded-md border border-border bg-background px-2 py-1"
            value={workspaceId}
            disabled={send.isPending}
            onChange={(event) =>
              void navigate(newConversationRoute(event.target.value), { replace: true })
            }
          >
            {(data.workspaces.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </label>
      }
      statusStrip={null}
      workbenchRevealKey={activeRequest?.key}
      workbench={
        <ClioWorkbench
          workspaceId={workspaceId}
          sessionId=""
          files={data.workspaceFiles.data?.entries ?? []}
          filesError={data.workspaceFiles.error?.message}
          filesPending={data.workspaceFiles.isPending}
          filesFetching={data.workspaceFiles.isFetching}
          filesTruncated={data.workspaceFiles.data?.truncated ?? false}
          onFilesViewActiveChange={setFilesViewActive}
          onRefreshFiles={() => void data.workspaceFiles.refetch()}
          resources={data.workspaceResources.data ?? []}
          resourcesError={data.workspaceResources.error?.message}
          resourcesPending={data.workspaceResources.isPending}
          blueprints={data.agentBlueprints.data ?? []}
          blueprintsError={data.agentBlueprints.error?.message}
          blueprintsPending={data.agentBlueprints.isPending}
          artifacts={[]}
          diffs={[]}
          sessionView={
            <p className="p-6 text-sm text-muted-foreground">
              Session activity appears after you send your first message.
            </p>
          }
          onApplyDiff={(sessionId, workspaceId, path) =>
            diffActions.apply.mutateAsync({ sessionId, workspaceId, path })
          }
          onRejectDiff={(sessionId, workspaceId, path) =>
            diffActions.reject.mutateAsync({ sessionId, workspaceId, path })
          }
          diffActionError={(diffActions.apply.error ?? diffActions.reject.error)?.message}
          diffActionPending={diffActions.apply.isPending || diffActions.reject.isPending}
          onOpenSubagent={openSubagent}
          onOpenTerminal={terminalActions.onOpenTerminal}
          requestedOpen={activeRequest}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col justify-center overflow-y-auto px-4 py-8 sm:px-8">
        <WorkspaceActionAlerts
          actionError={
            send.error?.message ??
            (warmup.error
              ? `Tools could not be prepared in advance: ${warmup.error.message}. You can still send a message.`
              : undefined)
          }
        />
        <ClioConversationWelcome disabled={send.isPending} onSelectPrompt={draft.onValueChange}>
          <ClioComposer
            attachments={canUploadWorkspaceResources(data.capabilities.data?.capabilities)}
            contextReferences={canUseContextReferences(data.capabilities.data?.capabilities)}
            disabled={!workspace || defaults.isPending || send.isPending}
            state={send.isPending ? 'queued' : 'completed'}
            provider={provider}
            model={model}
            modelOptions={data.modelOptions}
            modelCatalogStatus={data.modelCatalogStatus}
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
            value={draft.value}
            onValueChange={draft.onValueChange}
            references={draft.references}
            onReferencesChange={draft.onReferencesChange}
            variant="welcome"
            workspaceId={workspaceId}
          />
        </ClioConversationWelcome>
      </div>
    </ClioAppShell>
  );
}
