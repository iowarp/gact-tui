import type { AgentBlueprint, Session, Workspace } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIcon, NetworkIcon, Settings2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { createRepository } from '@/lib/connection';
import { recordById } from '@/lib/entities';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useMenuAction } from '@/tauri/menu-actions';
import { ClioArchivedSessionsDialog } from './archived-sessions-dialog';
import { NavigationHeader } from './navigation-header';
import { ClioResourceDialogs, type ResourceActions, type ResourceTarget } from './resource-dialogs';
import { WorkspaceEditorDialog } from './workspace-editor-dialog';
import { WorkspaceNavigation } from './workspace-navigation';

export interface ClioNavigationProps {
  endpoint: string;
  workspaces: readonly Workspace[];
  sessions: readonly Session[];
  activeWorkspaceId: string;
  activeSessionId: string;
  actions: ResourceActions;
  blueprints: readonly AgentBlueprint[];
  onOpenWorkspaceFiles?: () => void;
}

export function ClioNavigation({
  endpoint,
  workspaces,
  sessions,
  activeWorkspaceId,
  activeSessionId,
  actions,
  blueprints,
  onOpenWorkspaceFiles,
}: ClioNavigationProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { settings, connect, recents } = useConnectionSettings();
  const [createKind, setCreateKind] = useState<'workspace' | 'session' | null>(null);
  const [createWorkspaceId, setCreateWorkspaceId] = useState(activeWorkspaceId);
  const [renameTarget, setRenameTarget] = useState<ResourceTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourceTarget | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [workspaceEditorId, setWorkspaceEditorId] = useState<string>();
  const importInputRef = useRef<HTMLInputElement>(null);
  const activeSession = sessions.find((session) => session.id === activeSessionId);

  const openNewSession = (workspaceId = activeWorkspaceId) => {
    setCreateWorkspaceId(workspaceId);
    setCreateKind('session');
  };
  const downloadSession = async (sessionId: string, title: string) => {
    const value = await actions.exportSession(sessionId);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title.replace(/[^a-z0-9._-]+/giu, '-').replace(/^-|-$/gu, '') || 'session'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const runNavigationAction = (action: () => Promise<void>, success: string) => {
    void action()
      .then(() => toast.success(success))
      .catch((reason: unknown) =>
        toast.error(reason instanceof Error ? reason.message : String(reason)),
      );
  };
  const switchService = async (recent: (typeof recents)[number]) => {
    try {
      const repository = createRepository(recent);
      const [nextWorkspaces, nextSessions] = await Promise.all([
        repository.workspaces(),
        repository.allSessions(),
      ]);
      const workspacesById = new Map(
        nextWorkspaces.map((workspace) => [workspace.id, workspace]),
      );
      const target = nextSessions
        .filter((session) => workspacesById.has(session.workspace_id))
        .sort(
          (left, right) =>
            new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
        )[0];

      queryClient.setQueryData(['workspaces', recent.endpoint], nextWorkspaces);
      queryClient.setQueryData(['sessions', recent.endpoint, 'all'], nextSessions);
      if (target) {
        queryClient.setQueryData(
          ['sessions', recent.endpoint, target.workspace_id],
          nextSessions.filter((session) => session.workspace_id === target.workspace_id),
        );
      }
      useLiveStore.getState().reset();
      useLiveStore.getState().replaceSnapshots({
        sessions: recordById(nextSessions),
        workspaces: recordById(nextWorkspaces),
      });
      connect(recent);

      if (!target) {
        await navigate('/?intent=setup');
        return;
      }
      await navigate(
        `/workspaces/${encodeURIComponent(target.workspace_id)}/sessions/${encodeURIComponent(target.id)}`,
      );
    } catch (error) {
      toast.error('Could not switch agent service', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  useMenuAction('new-session', () => openNewSession());
  useMenuAction('import-session', () => importInputRef.current?.click());
  useMenuAction('export-session', () => {
    if (!activeSession) return toast.error('No active session to export');
    runNavigationAction(
      () => downloadSession(activeSession.id, activeSession.title),
      'Session export downloaded',
    );
  });
  useEffect(() => {
    const open = () => openNewSession();
    window.addEventListener('clio:new-session', open);
    return () => window.removeEventListener('clio:new-session', open);
  });

  return (
    <>
      <Sidebar collapsible="icon" contained>
        <nav aria-label="Workspace navigation" className="flex h-full min-w-0 flex-1 flex-col">
          <NavigationHeader
            activeLabel={settings.label}
            currentPath={location.pathname}
            endpoint={endpoint}
            onConnect={switchService}
            onImportSession={() => importInputRef.current?.click()}
            onNewSession={() => openNewSession()}
            onNewWorkspace={() => setCreateKind('workspace')}
            onOpenArchived={() => setArchivedOpen(true)}
            recentConnections={recents}
          />
          <SidebarContent>
            <WorkspaceNavigation
              actions={actions}
              activeSessionId={activeSessionId}
              activeWorkspaceId={activeWorkspaceId}
              blueprints={blueprints}
              onAction={runNavigationAction}
              onCreateSession={openNewSession}
              onDelete={setDeleteTarget}
              onDownloadSession={downloadSession}
              onEditWorkspace={setWorkspaceEditorId}
              onOpenWorkspaceFiles={onOpenWorkspaceFiles}
              onRename={setRenameTarget}
              sessions={sessions}
              workspaces={workspaces}
            />
            <SidebarGroup>
              <SidebarGroupLabel>Explore</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Runs">
                      <Link state={{ from: location.pathname }} to="/runs">
                        <ActivityIcon aria-hidden="true" />
                        <span>Runs</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Infrastructure">
                      <Link state={{ from: location.pathname }} to="/infrastructure">
                        <NetworkIcon aria-hidden="true" />
                        <span>Infrastructure</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Settings">
                  <Link state={{ from: location.pathname }} to="/settings/appearance">
                    <Settings2Icon aria-hidden="true" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
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
        activeWorkspaceId={createWorkspaceId || activeWorkspaceId}
        blueprints={blueprints}
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
