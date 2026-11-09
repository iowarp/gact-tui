import type { AgentEntry, Session, Workspace } from '@clio/core/v3';
import { ArchiveIcon, SlidersHorizontalIcon, UserRoundIcon } from 'lucide-react';
import { IconButton, NamedTooltip } from '@/components/clio/primitives/icon-button';
import { HeldKeyBadge } from '@/components/clio/primitives/key-chip';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Sidebar, SidebarContent, SidebarFooter, SidebarRail } from '@/components/ui/sidebar';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import { useConnectionAvailabilities } from '@/hooks/use-connection-availability';
import { useKnownConnections } from '@/hooks/use-known-connections';
import type { ConnectionSettings } from '@/lib/connection';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useMenuAction } from '@/tauri/menu-actions';
import { ClioArchivedSessionsDialog } from './archived-sessions-dialog';
import { ClioAttentionCenter, ClioAttentionNotifier } from './attention-center';
import { NavigationHeader } from './navigation-header';
import { ClioResourceDialogs, type ResourceActions, type ResourceTarget } from './resource-dialogs';
import { WorkspaceEditorDialog } from './workspace-editor-dialog';
import { WorkspaceNavigation } from './workspace-navigation';
import { downloadSessionExport } from './session-export-download';
import { newConversationRoute } from '@/lib/workspace-route-memory';
import type { SessionAttention } from '@/lib/session-attention';

export interface ClioNavigationProps {
  endpoint: string;
  workspaces: readonly Workspace[];
  sessions: readonly Session[];
  activeWorkspaceId: string;
  activeSessionId: string;
  actions: ResourceActions;
  /** Installed agents, to name the agent each conversation runs. */
  agents: readonly AgentEntry[];
  onOpenWorkspaceFiles?: () => void;
  attentions: Readonly<Record<string, SessionAttention>>;
}

export function ClioNavigation({
  endpoint,
  workspaces,
  sessions,
  activeWorkspaceId,
  activeSessionId,
  actions,
  agents,
  onOpenWorkspaceFiles,
  attentions,
}: ClioNavigationProps) {
  const location = useLocation();
  const { settings } = useConnectionSettings();
  const knownConnections = useKnownConnections();
  const activeConnection = useMemo(() => [{ ...settings, endpoint }], [endpoint, settings]);
  const activeAvailability = useConnectionAvailabilities(activeConnection);
  const connectionAvailabilities = useMemo(
    () => ({
      ...Object.fromEntries(
        knownConnections.map((connection) => [connection.endpoint, connection.availability]),
      ),
      ...activeAvailability,
    }),
    [activeAvailability, knownConnections],
  );
  const switchConnection = useSwitchConnection();
  const [createKind, setCreateKind] = useState<'workspace' | 'session' | null>(null);
  const [renameTarget, setRenameTarget] = useState<ResourceTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourceTarget | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [workspaceEditorId, setWorkspaceEditorId] = useState<string>();
  const importInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const draftMatch = useMatch('/workspaces/:workspaceId/new');
  // A new conversation is a draft in place; it becomes a row once it is sent.
  const openNewSession = (workspaceId = activeWorkspaceId) => {
    void navigate(newConversationRoute(workspaceId || 'ws_default'));
  };
  const downloadSession = async (
    sessionId: string,
    title: string,
    mode: import('@clio/core/v3').SessionExportMode,
  ) => downloadSessionExport(actions, settings.endpoint, sessionId, title, mode);
  const runNavigationAction = (action: () => Promise<void>, success: string) => {
    void action()
      .then(() => toast.success(success))
      .catch((reason: unknown) => {
        console.error('Navigation action failed', reason);
        toast.error(reason instanceof Error ? reason.message : String(reason), {
          duration: Infinity,
          closeButton: true,
        });
      });
  };
  const switchService = async (connection: ConnectionSettings) => {
    try {
      await switchConnection(connection);
    } catch (error) {
      toast.error('Could not switch agent service', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // 'import-session' and 'export-session' used to also be reachable via the
  // native File menu (removed — see menu_spec.rs's application-menu trim);
  // the direct paths below (the header's import button, per-session export)
  // already cover them, so no useMenuAction registration is needed for
  // either.
  const importSession = () => importInputRef.current?.click();
  useMenuAction('new-session', () => openNewSession());
  useShortcut('new-conversation-browser', () => openNewSession(), { allowInTextField: true });
  useShortcut('import-conversation', importSession, { allowInTextField: true });
  useShortcut('previous-conversation', () => stepConversation(-1), { allowInTextField: true });
  useShortcut('next-conversation', () => stepConversation(1), { allowInTextField: true });
  useEffect(() => {
    const open = () => openNewSession();
    window.addEventListener('clio:new-session', open);
    return () => window.removeEventListener('clio:new-session', open);
  });

  return (
    <>
      <ClioAttentionNotifier
        activeSessionId={activeSessionId}
        attentions={attentions}
        sessions={sessions}
      />
      <Sidebar collapsible="icon" contained>
        <nav aria-label="Workspace navigation" className="flex h-full min-w-0 flex-1 flex-col">
          <NavigationHeader
            activeLabel={settings.label}
            activeLocation={settings.location}
            attentionControl={
              <li className="shrink-0">
                <ClioAttentionCenter
                  activeSessionId={activeSessionId}
                  attentions={attentions}
                  sessions={sessions}
                />
              </li>
            }
            currentPath={location.pathname}
            connectionAvailabilities={connectionAvailabilities}
            endpoint={endpoint}
            onConnect={switchService}
            onImportSession={importSession}
            onNewSession={() => openNewSession()}
            connections={knownConnections}
          />
          <SidebarContent className="gap-0">
            <WorkspaceNavigation
              actions={actions}
              attentions={attentions}
              activeSessionId={activeSessionId}
              activeWorkspaceId={activeWorkspaceId}
              agents={agents}
              draftWorkspaceId={draftMatch?.params.workspaceId}
              onAction={runNavigationAction}
              onCreateSession={openNewSession}
              onDelete={setDeleteTarget}
              onDownloadSession={downloadSession}
              onEditWorkspace={setWorkspaceEditorId}
              onNewWorkspace={() => setCreateKind('workspace')}
              onOpenWorkspaceFiles={onOpenWorkspaceFiles}
              onRename={setRenameTarget}
              sessions={sessions}
              workspaces={workspaces}
            />
          </SidebarContent>
          <SidebarFooter className="flex-row items-center gap-1 border-t border-sidebar-border p-2 group-data-[collapsible=icon]:flex-col">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1 group-data-[collapsible=icon]:hidden">
              <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <UserRoundIcon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="truncate text-[13px]">Local profile</span>
            </div>
            <IconButton
              icon={<ArchiveIcon />}
              label="Archived conversations"
              onClick={() => setArchivedOpen(true)}
              tooltipSide="top"
            />
            <NamedTooltip label="Settings" shortcut="settings" side="top">
              <Link
                aria-label="Settings"
                className="relative grid size-7 shrink-0 place-items-center rounded-[6px] text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                state={{ endpoint, from: location.pathname }}
                to="/settings/general"
              >
                <SlidersHorizontalIcon aria-hidden="true" className="size-[15px]" />
                <HeldKeyBadge id="settings" placement="above" />
              </Link>
            </NamedTooltip>
          </SidebarFooter>
        </nav>
        <SidebarRail />
      </Sidebar>
      <input
        accept="application/json,.json"
        aria-label="Import session file"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          void file
            .text()
            .then((text) => JSON.parse(text) as unknown)
            .then((value) => actions.importSession(value))
            .then(() => toast.success('Session imported'))
            .catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : 'Session import failed'),
            );
        }}
        ref={importInputRef}
        type="file"
      />
      <ClioResourceDialogs
        actions={actions}
        activeWorkspaceId={activeWorkspaceId}
        agents={agents}
        createKind={createKind}
        deleteTarget={deleteTarget}
        onCreateKindChange={setCreateKind}
        onDeleteTargetChange={setDeleteTarget}
        onRenameTargetChange={setRenameTarget}
        renameTarget={renameTarget}
        workspaces={workspaces}
      />
      <ClioArchivedSessionsDialog
        onDelete={actions.deleteSession}
        onOpenChange={setArchivedOpen}
        onRestore={actions.restoreSession}
        open={archivedOpen}
        sessions={sessions}
        workspaces={workspaces}
      />
      {workspaceEditorId && workspaces.find((workspace) => workspace.id === workspaceEditorId) ? (
        <WorkspaceEditorDialog
          actions={actions}
          onClose={() => setWorkspaceEditorId(undefined)}
          workspace={workspaces.find((workspace) => workspace.id === workspaceEditorId)!}
        />
      ) : null}
    </>
  );
}

/** Opens the conversation above or below the current one, in the left bar's visible order. */
function stepConversation(step: -1 | 1) {
  const links = [
    ...document.querySelectorAll<HTMLAnchorElement>('[data-session-row] a[data-active]'),
  ];
  const current = links.findIndex((link) => link.dataset.active === 'true');
  const target = current < 0 ? links[step < 0 ? links.length - 1 : 0] : links[current + step];
  target?.click();
}
