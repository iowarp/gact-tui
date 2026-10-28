import { refreshAfterMemoryRemoval } from '@/lib/memory-cache';
import { MEMORY_CATEGORIES, type MemoryDocument } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, UploadIcon, SearchIcon } from 'lucide-react';
import { MoreIcon, SettingsIcon } from '@/lib/icon-vocabulary';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { useSessionDirectory } from '@/hooks/use-session-directory';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { MemoryDocumentDialog, MemoryHistoryDialog } from './memory-document-dialog';
import { MemoryImportDialog } from './memory-import-dialog';
import { MemoryInbox } from './memory-inbox';
import { MemoryCreate } from './memory-create';
import { MEMORY_CATEGORY_LABELS } from './memory-presentation';
import { MemoryCreationLog } from './memory-creation-log';
import { RuntimeSettingsPanel } from './settings-runtime';
import { SettingsSectionHeading } from './settings-section-heading';
import { downloadBlob } from './surface-export';

const CATEGORY_LABELS = MEMORY_CATEGORY_LABELS;

function usageLabel(document: MemoryDocument) {
  const usage = document.usage;
  if (!usage || (!usage.read && !usage.loaded)) return 'Not used yet';
  const parts = [];
  if (usage.read) parts.push(`read ${usage.read}×`);
  if (usage.loaded) parts.push(`loaded ${usage.loaded}×`);
  return `${parts.join(', ')}${usage.last_read ? `; last ${usage.last_read.slice(0, 10)}` : ''}`;
}

function saveArchive(bytes: Uint8Array, scope: string) {
  const stem = scope === 'all' ? 'memory' : `memory-${scope.replaceAll('/', '-')}`;
  downloadBlob(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }), `${stem}.zip`);
}

function DocumentActions({
  document,
  onOpen,
  onHistory,
}: {
  document: MemoryDocument;
  onOpen: () => void;
  onHistory: () => void;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => repository.forgetMemoryDocument(document.name, document.sha),
    onSuccess: () => {
      void refreshAfterMemoryRemoval(client, document.name);
      toast.success(`Deleted ${document.slug}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const exportOne = useMutation({
    mutationFn: () => repository.exportMemory({ name: document.name }),
    onSuccess: (bytes) => saveArchive(bytes, document.name),
    onError: (error) => toast.error(error.message),
  });
  const [confirming, setConfirming] = useState(false);
  const live = document.facts.filter((fact) => fact.live).length;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={`Actions for ${document.slug}`} size="icon" variant="ghost">
            <MoreIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
          <DropdownMenuItem onSelect={onHistory}>History</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportOne.mutate()}>Export</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirming(true)} variant="destructive">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {document.slug}?</AlertDialogTitle>
            <AlertDialogDescription>
              {live === 1
                ? 'The agent forgets its fact and will not learn it again from past conversations.'
                : `The agent forgets its ${live} facts and will not learn them again from past conversations.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} variant="destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ScopeTable({
  documents,
  onOpen,
  onHistory,
}: {
  documents: MemoryDocument[];
  onOpen: (name: string) => void;
  onHistory: (name: string) => void;
}) {
  const categories = MEMORY_CATEGORIES.filter((category) =>
    documents.some((document) => document.category === category),
  );
  return (
    <div className="grid gap-4">
      {categories.map((category) => (
        <section aria-label={CATEGORY_LABELS[category]} className="grid gap-1" key={category}>
          {!['profile', 'preferences'].includes(category) ? (
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {CATEGORY_LABELS[category]}
            </h3>
          ) : null}
          <ul className="divide-y rounded-lg border">
            {documents
              .filter((document) => document.category === category)
              .map((document) => {
                const live = document.facts.filter((fact) => fact.live).length;
                return (
                  <li className="flex items-center gap-3 px-3 py-2" key={document.name}>
                    <button
                      className="grid min-w-0 flex-1 gap-0.5 text-left"
                      onClick={() => onOpen(document.name)}
                      type="button"
                    >
                      <span className="truncate text-sm font-medium">
                        {document.description || document.slug.replaceAll('-', ' ')}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {document.facts.find((fact) => fact.live)?.text}
                      </span>
                    </button>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {live} {live === 1 ? 'fact' : 'facts'}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                      {usageLabel(document)}
                    </span>
                    <DocumentActions
                      document={document}
                      onHistory={() => onHistory(document.name)}
                      onOpen={() => onOpen(document.name)}
                    />
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function scopeTitle(scope: string, workspaceNames: Map<string, string>) {
  if (scope === 'user') return 'Account';
  const id = scope.replace(/^project\//u, '');
  return workspaceNames.get(id) ?? id;
}

/** Long-term memory: what the agent keeps, what waits for review, import and export. */
export function MemorySettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [params, setParams] = useSearchParams();
  const [history, setHistory] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState('');
  const requestedTab = params.get('view') ?? 'memories';
  const tab = ['memories', 'review', 'create', 'log'].includes(requestedTab)
    ? requestedTab
    : 'memories';
  const setTab = (value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === 'memories') next.delete('view');
      else next.set('view', value);
      return next;
    });
  const opened = params.get('doc') ?? '';
  const open = (name: string, view?: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (name) next.set('doc', name);
      else next.delete('doc');
      next.delete('fact');
      if (view) next.set('view', view);
      return next;
    });
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
    onSuccess: (bytes) => saveArchive(bytes, 'all'),
    onError: (error) => toast.error(error.message),
  });
  const sessionHref = (sessionId: string) => {
    const session = sessions.get(sessionId);
    return session ? `/workspaces/${session.workspace_id}/sessions/${session.id}` : undefined;
  };
  const workspaceNames = new Map(
    (workspaces.data ?? []).map((workspace) => [workspace.id, workspace.name]),
  );
  const memoryScope = (name: string) =>
    scopeTitle(
      name.startsWith('user/') ? 'user' : name.split('/').slice(0, 2).join('/'),
      workspaceNames,
    );
  const scopes = [...new Set((documents.data ?? []).map((document) => document.scope))].sort(
    (a, b) => (a === 'user' ? -1 : b === 'user' ? 1 : a.localeCompare(b)),
  );
  const inbox = summary.data?.inbox ?? 0;
  const needle = filter.trim().toLowerCase();
  const filtered = (documents.data ?? []).filter(
    (document) =>
      !needle ||
      [
        document.slug,
        document.description,
        ...document.facts.filter((fact) => fact.live).map((fact) => fact.text),
      ].some((text) => text.toLowerCase().includes(needle)),
  );
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SettingsSectionHeading
          info="Saved facts and preferences the agent can use in later conversations. Background creation and review are controlled in Memory settings."
          title="Memory"
        />
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <SettingsIcon aria-hidden="true" /> Settings
              </Button>
            </DialogTrigger>
            <DialogContent
              className="sm:max-w-4xl"
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                if (event.target instanceof HTMLElement) event.target.focus();
              }}
            >
              <DialogTitle className="sr-only">Memory settings</DialogTitle>
              <DialogDescription className="sr-only">
                Configure memory creation, review, conversation recall and retention.
              </DialogDescription>
              <RuntimeSettingsPanel only="Memory" title="Memory settings" description="" />
            </DialogContent>
          </Dialog>
          <Button onClick={() => setImporting(true)} variant="outline">
            <UploadIcon aria-hidden="true" /> Import
          </Button>
          <Button
            disabled={exportAll.isPending || !documents.data?.length}
            onClick={() => exportAll.mutate()}
            variant="outline"
          >
            <DownloadIcon aria-hidden="true" /> Export
          </Button>
        </div>
      </div>
      {summary.data && !summary.data.enabled ? (
        <Alert>
          <AlertTitle>Memory is off</AlertTitle>
          <AlertDescription>
            Saved memories are kept. Open Settings to enable their use.
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-4">
        <TabsList
          style={{ height: 'auto' }}
          aria-label="Memory views"
          variant="line"
          className="grid h-auto w-full grid-cols-2 gap-y-2 border-b pb-2 sm:flex sm:justify-start"
        >
          <TabsTrigger
            value="memories"
            className="h-auto min-h-9 min-w-0 flex-none px-2 py-2 whitespace-normal sm:whitespace-nowrap"
          >
            Memories
          </TabsTrigger>
          <TabsTrigger
            value="review"
            className="h-auto min-h-9 min-w-0 flex-none px-2 py-2 whitespace-normal sm:whitespace-nowrap"
          >
            Memories under review{' '}
            <Badge aria-label={`${inbox} waiting`} variant="secondary">
              {inbox}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="create"
            className="h-auto min-h-9 min-w-0 flex-none px-2 py-2 whitespace-normal sm:whitespace-nowrap"
          >
            Create memories
          </TabsTrigger>
          <TabsTrigger
            value="log"
            className="h-auto min-h-9 min-w-0 flex-none px-2 py-2 whitespace-normal sm:whitespace-nowrap"
          >
            Memory creation log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="memories" className="grid gap-4 data-[state=inactive]:hidden">
          <div className="relative max-w-md">
            <SearchIcon
              aria-hidden="true"
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search memories"
              placeholder="Search memories"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="pl-8"
            />
          </div>
          {documents.isPending ? <Skeleton className="h-32 w-full" /> : null}
          {documents.error ? (
            <Alert variant="destructive">
              <AlertTitle>Memory unavailable</AlertTitle>
              <AlertDescription>{documents.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {documents.data && !documents.data.length ? (
            <p className="text-sm text-muted-foreground">
              No memories saved yet.{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setTab('create')}
              >
                Create a memory
              </button>{' '}
              or ask the agent to remember something in a conversation.
            </p>
          ) : null}
          <div className="grid gap-6">
            {scopes
              .filter((scope) => filtered.some((document) => document.scope === scope))
              .map((scope) => (
                <section
                  aria-label={scopeTitle(scope, workspaceNames)}
                  className="grid gap-2"
                  key={scope}
                >
                  <h2 className="text-sm font-semibold">{scopeTitle(scope, workspaceNames)}</h2>
                  <ScopeTable
                    documents={filtered.filter((document) => document.scope === scope)}
                    onHistory={setHistory}
                    onOpen={open}
                  />
                </section>
              ))}
          </div>
          {needle && documents.data?.length && !filtered.length ? (
            <p className="text-sm text-muted-foreground">No memories match “{filter.trim()}”.</p>
          ) : null}
        </TabsContent>
        <TabsContent value="review">
          <MemoryInbox
            onSessionIds={sessions.request}
            sessionHref={sessionHref}
            targetLabel={(name) =>
              `${memoryScope(name)}: ${name.split('/').at(-1)?.replaceAll('-', ' ')}`
            }
          />
        </TabsContent>
        <TabsContent value="create">
          <MemoryCreate
            workspaces={workspaces.data ?? []}
            workspacesLoading={workspaces.isPending}
            workspacesError={workspaces.error?.message}
            onRetryWorkspaces={() => void workspaces.refetch()}
            onCreated={(name) => {
              open(name, 'memories');
            }}
          />
        </TabsContent>
        <TabsContent value="log">
          <MemoryCreationLog
            sessionHref={sessionHref}
            onSessionIds={sessions.request}
            sessionTitle={(id) => sessions.get(id)?.title || 'Conversation not loaded'}
            targetLabel={(name) =>
              `${memoryScope(name)}: ${name.split('/').at(-1)?.replaceAll('-', ' ')}`
            }
          />
        </TabsContent>
      </Tabs>
      {opened ? (
        <MemoryDocumentDialog
          highlight={params.get('fact') ?? ''}
          scopeLabel={
            opened.startsWith('user/')
              ? 'Account memory'
              : `Workspace memory: ${memoryScope(opened)}`
          }
          name={opened}
          onOpenChange={(next) => (next ? undefined : open(''))}
          open
          onSessionIds={sessions.request}
          sessionHref={sessionHref}
        />
      ) : null}
      {history ? (
        <MemoryHistoryDialog
          name={history}
          onOpenChange={(next) => (next ? undefined : setHistory(undefined))}
          open
        />
      ) : null}
      <MemoryImportDialog
        onOpenChange={setImporting}
        open={importing}
        onStarted={() => setTab('log')}
        workspaces={workspaces.data ?? []}
        workspacesLoading={workspaces.isPending}
        workspacesError={workspaces.error?.message}
        onRetryWorkspaces={() => void workspaces.refetch()}
      />
    </div>
  );
}
