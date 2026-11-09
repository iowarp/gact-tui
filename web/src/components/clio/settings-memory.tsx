import type { MemoryDocument } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { useSessionDirectory } from '@/hooks/use-session-directory';
import { queryKeys } from '@/lib/query-keys';
import { useShortcut, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { defineShortcuts } from '@/lib/shortcuts/registry';
import { useConnectionSettings } from '@/providers/connection-provider';
import { MemoryCreate } from './memory-create';
import { MemoryCreationLog } from './memory-creation-log';
import {
  MemoryDeleteDialog,
  MemoryDocumentPane,
  type MemoryPaneTab,
} from './memory-document-dialog';
import { memoryErrorText, memoryScopeTitle, saveMemoryArchive } from './memory-document-helpers';
import { MemoryDocuments } from './memory-documents';
import { MemoryImportDialog } from './memory-import-dialog';
import { MemoryInbox } from './memory-inbox';
import { ListDetailLayout } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { ShortcutKeys } from './primitives/key-chip';
import { SegmentedControl } from './primitives/segmented-control';
import { StatusIndicator } from './primitives/status-indicator';
import { SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

const TABS = ['memories', 'review', 'create', 'log'] as const;
type Tab = (typeof TABS)[number];

const IMPORT_SHORTCUT = 'memory-import';
const SEARCH_SHORTCUT = 'memory-search';

/** Whether a workspace also reads account memory; one switch on the Memories tab. */
function AccountMemoryRow({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const key = ['memory', 'workspace-settings', workspaceId];
  const setting = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.workspaceMemory(workspaceId, signal),
  });
  const update = useMutation({
    mutationFn: (next: boolean) => repository.setWorkspaceMemory(workspaceId, next),
    onSuccess: (result) => client.setQueryData(key, result),
    onError: (error) => toast.error(memoryErrorText(error)),
  });
  const checked = update.isPending
    ? Boolean(update.variables)
    : (setting.data?.use_account_memory ?? false);
  return (
    <SettingsRow
      htmlFor="memory-use-account"
      info={`Facts about you that every workspace can use. This switch applies to ${workspaceName}.`}
      inlineControl
      note={
        setting.error ? `Could not read this setting. ${memoryErrorText(setting.error)}` : undefined
      }
      title="Use account memory"
    >
      <Switch
        checked={checked}
        disabled={setting.isPending || Boolean(setting.error) || update.isPending}
        id="memory-use-account"
        onCheckedChange={(next) => update.mutate(next)}
      />
    </SettingsRow>
  );
}

/** Long-term memory: what the agent keeps, what waits for review, import and export. */
export function MemorySettings({ workspaceId }: { workspaceId?: string } = {}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [params, setParams] = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [paneTab, setPaneTab] = useState<MemoryPaneTab>('facts');
  const [deleting, setDeleting] = useState<MemoryDocument>();
  const requested = params.get('view') ?? 'memories';
  const tab: Tab = (TABS as readonly string[]).includes(requested)
    ? (requested as Tab)
    : 'memories';
  const setTab = useCallback(
    (value: Tab) =>
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (value === 'memories') next.delete('view');
        else next.set('view', value);
        return next;
      }),
    [setParams],
  );
  const opened = params.get('doc') ?? '';
  const open = (name: string, view?: Tab, pane: MemoryPaneTab = 'facts') => {
    setPaneTab(pane);
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (name) next.set('doc', name);
      else next.delete('doc');
      next.delete('fact');
      if (view === 'memories') next.delete('view');
      else if (view) next.set('view', view);
      return next;
    });
  };
  const summary = useQuery({
    queryKey: ['memory', 'summary'],
    queryFn: ({ signal }) => repository.memorySummary(signal),
    refetchInterval: 15_000,
  });
  const documents = useQuery({
    queryKey: ['memory', 'documents', 'all'],
    queryFn: ({ signal }) => repository.memoryDocuments('all', signal),
  });
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint, 'memory'),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  // Sessions the memory views name, read by id as they are shown (never every session).
  const sessions = useSessionDirectory();
  const exportAll = useMutation({
    mutationFn: () => repository.exportMemory({ scope: 'all' }),
    onSuccess: (bytes) => saveMemoryArchive(bytes, 'all'),
    onError: (error) => toast.error(memoryErrorText(error)),
  });
  useEffect(
    () =>
      defineShortcuts([
        { id: IMPORT_SHORTCUT, name: 'Import memory', group: 'tab', keys: ['I'] },
        { id: SEARCH_SHORTCUT, name: 'Search memories', group: 'tab', keys: ['/'] },
      ]),
    [],
  );
  // The window's content pane holds focus when Settings opens on this page.
  const region = {
    get current() {
      return rootRef.current?.closest('[data-window-content]') ?? rootRef.current;
    },
  };
  useShortcut(IMPORT_SHORTCUT, () => setImporting(true), { enabled: !importing, region });
  const importKeys = useShortcutPresentation(IMPORT_SHORTCUT);
  useShortcut(SEARCH_SHORTCUT, () => searchRef.current?.focus(), {
    enabled: tab === 'memories' && !importing,
    region,
  });
  const sessionHref = (sessionId: string) => {
    const session = sessions.get(sessionId);
    return session ? `/workspaces/${session.workspace_id}/sessions/${session.id}` : undefined;
  };
  const workspaceNames = new Map(
    (workspaces.data ?? []).map((workspace) => [workspace.id, workspace.name]),
  );
  const scopeOf = (name: string) =>
    name.startsWith('user/') ? 'user' : name.split('/').slice(0, 2).join('/');
  const targetLabel = (name: string, description?: string) =>
    `${memoryScopeTitle(scopeOf(name), workspaceNames)}: ${description || name.split('/').at(-1)?.replaceAll('-', ' ')}`;
  // The account-memory switch belongs to a workspace: the open one, else the
  // first workspace that keeps memories.
  const candidates = (workspaces.data ?? []).filter((workspace) => workspace.id !== 'ws_global');
  const accountTarget =
    candidates.find((workspace) => workspace.id === workspaceId) ??
    candidates.find((workspace) =>
      documents.data?.some((document) => document.scope === `project/${workspace.id}`),
    ) ??
    candidates[0];
  const inbox = summary.data?.inbox ?? 0;
  const body = {
    memories: (
      <MemoryDocuments
        documents={documents.data}
        error={documents.error}
        onCreate={() => setTab('create')}
        onDelete={setDeleting}
        onOpen={(name, pane) => open(name, undefined, pane)}
        onRetry={() => void documents.refetch()}
        opened={opened}
        pending={documents.isPending}
        ref={searchRef}
        scope={params.get('scope') ?? undefined}
        workspaceNames={workspaceNames}
      />
    ),
    review: (
      <MemoryInbox
        onSessionIds={sessions.request}
        sessionHref={sessionHref}
        targetLabel={(proposal) => targetLabel(proposal.target, proposal.target_label)}
      />
    ),
    create: (
      <MemoryCreate
        onCreated={(name) => open(name, 'memories')}
        onRetryWorkspaces={() => void workspaces.refetch()}
        workspaces={workspaces.data ?? []}
        workspacesError={workspaces.error ? memoryErrorText(workspaces.error) : undefined}
        workspacesLoading={workspaces.isPending}
      />
    ),
    log: (
      <MemoryCreationLog
        onSessionIds={sessions.request}
        sessionHref={sessionHref}
        sessionTitle={(id) => sessions.get(id)?.title || 'Conversation not loaded'}
        targetLabel={(name) => targetLabel(name)}
      />
    ),
  }[tab];
  return (
    <div className="grid min-w-0" ref={rootRef}>
      <SettingsSectionHeading
        actions={
          <Button
            aria-keyshortcuts={importKeys?.aria}
            onClick={() => setImporting(true)}
            size="xs"
            variant="outline"
          >
            Import memory
            <ShortcutKeys id={IMPORT_SHORTCUT} variant="inline" />
          </Button>
        }
        info="Saved facts and preferences the agent can use in later conversations."
        title="Memory and instructions"
      />
      <div className="flex min-w-0 items-center gap-2 pb-1">
        <SegmentedControl
          className="min-w-0 overflow-hidden"
          label="Memory views"
          onValueChange={setTab}
          options={[
            { value: 'memories', label: 'Memories' },
            {
              value: 'review',
              label: 'Under review',
              badge: inbox ? (
                <span
                  aria-label={`${inbox} waiting`}
                  className="ml-1.5 inline-grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10.5px] leading-none font-semibold text-background tabular-nums"
                >
                  {inbox}
                </span>
              ) : undefined,
            },
            { value: 'create', label: 'Create memories' },
            { value: 'log', label: 'Creation log' },
          ]}
          value={tab}
        />
        <span className="flex-1" />
        <IconButton
          disabled={exportAll.isPending || !documents.data?.length}
          icon={<DownloadIcon />}
          label="Export all memory"
          onClick={() => exportAll.mutate()}
        />
      </div>
      {summary.data && !summary.data.enabled ? (
        <div className="flex min-w-0 items-center gap-2 py-2 text-[12.5px] text-muted-foreground">
          <StatusIndicator label="Memory is off" tone="stopped" />
          <span className="min-w-0 truncate">
            Saved memories are kept. Turn memory on under Create memories.
          </span>
        </div>
      ) : null}
      {tab === 'memories' && accountTarget ? (
        <AccountMemoryRow workspaceId={accountTarget.id} workspaceName={accountTarget.name} />
      ) : null}
      <ListDetailLayout
        detail={
          opened ? (
            <MemoryDocumentPane
              highlight={params.get('fact') ?? ''}
              name={opened}
              onClose={() => open('')}
              onDelete={setDeleting}
              onSessionIds={sessions.request}
              onTabChange={setPaneTab}
              scopeLabel={
                opened.startsWith('user/')
                  ? 'Account memory'
                  : `Workspace memory: ${memoryScopeTitle(scopeOf(opened), workspaceNames)}`
              }
              sessionHref={sessionHref}
              tab={paneTab}
            />
          ) : undefined
        }
        list={<div className="min-w-0 pr-0">{body}</div>}
      />
      <MemoryDeleteDialog
        document={deleting}
        onDeleted={(name) => (name === opened ? open('') : undefined)}
        onOpenChange={(next) => (next ? undefined : setDeleting(undefined))}
      />
      <MemoryImportDialog
        onOpenChange={setImporting}
        onRetryWorkspaces={() => void workspaces.refetch()}
        onStarted={() => setTab('log')}
        open={importing}
        workspaces={workspaces.data ?? []}
        workspacesError={workspaces.error ? memoryErrorText(workspaces.error) : undefined}
        workspacesLoading={workspaces.isPending}
      />
    </div>
  );
}
