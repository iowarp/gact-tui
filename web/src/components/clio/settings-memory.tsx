import { MEMORY_CATEGORIES, type MemoryDocument, type Session } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, UploadIcon } from 'lucide-react';
import { MoreIcon } from '@/lib/icon-vocabulary';
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
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { MemoryDocumentDialog, MemoryHistoryDialog } from './memory-document-dialog';
import { MemoryImportDialog } from './memory-import-dialog';
import { MemoryInbox } from './memory-inbox';
import { RuntimeSettingsPanel } from './settings-runtime';
import { PastSessionsSearch } from './settings-past-sessions';
import { ClioSettingsSection } from './settings-section';
import { SettingsSectionHeading } from './settings-section-heading';
import { downloadBlob } from './surface-export';

const CATEGORY_LABELS: Record<string, string> = {
  profile: 'Profile',
  preferences: 'Preferences',
  topics: 'Topics',
  areas: 'Areas of work',
  people: 'People',
  environments: 'Environments',
};

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
      void client.invalidateQueries({ queryKey: ['memory'] });
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
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {CATEGORY_LABELS[category]}
          </h3>
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
                      <span className="truncate text-sm font-medium">{document.slug}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {document.description}
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
export function MemorySettings({ initialSessionId }: { initialSessionId?: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [params, setParams] = useSearchParams();
  const [history, setHistory] = useState<string>();
  const [importing, setImporting] = useState(false);
  const opened = params.get('doc') ?? '';
  const open = (name: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (name) next.set('doc', name);
      else next.delete('doc');
      next.delete('fact');
      return next;
    });
  const summary = useQuery({
    queryKey: ['memory', 'summary'],
    queryFn: ({ signal }) => repository.memorySummary(signal),
  });
  const documents = useQuery({
    queryKey: ['memory', 'documents', 'all'],
    queryFn: ({ signal }) => repository.memoryDocuments('all', signal),
  });
  const runtime = useQuery({
    queryKey: queryKeys.key('runtime-settings', connectionScope(settings)),
    queryFn: ({ signal }) => repository.runtimeSettings(signal),
  });
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint, 'memory'),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const sessions = useQuery({
    queryKey: queryKeys.key('all-sessions', settings.endpoint, 'memory'),
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
  const exportAll = useMutation({
    mutationFn: () => repository.exportMemory({ scope: 'all' }),
    onSuccess: (bytes) => saveArchive(bytes, 'all'),
    onError: (error) => toast.error(error.message),
  });
  const bySession = new Map<string, Session>(
    (sessions.data ?? []).map((session) => [session.id, session]),
  );
  const sessionHref = (sessionId: string) => {
    const session = bySession.get(sessionId);
    return session ? `/workspaces/${session.workspace_id}/sessions/${session.id}` : undefined;
  };
  const workspaceNames = new Map(
    (workspaces.data ?? []).map((workspace) => [workspace.id, workspace.name]),
  );
  const sessionSearch =
    runtime.data?.settings.find((setting) => setting.key === 'memory.session_search')?.value !==
    false;
  const scopes = [...new Set((documents.data ?? []).map((document) => document.scope))].sort(
    (a, b) => (a === 'user' ? -1 : b === 'user' ? 1 : a.localeCompare(b)),
  );
  const inbox = summary.data?.inbox ?? 0;
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SettingsSectionHeading
          info="What the agent remembers about you, your projects and your work, across conversations. Facts you state are kept; facts learned from tool results or imports wait for your review."
          title="Memory"
        />
        <div className="flex flex-wrap gap-2">
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
            Conversations neither read nor write memory. Turn it on below.
          </AlertDescription>
        </Alert>
      ) : null}
      <RuntimeSettingsPanel
        description="What the agent remembers, how it learns, and what waits for you."
        only="Memory"
        title="Settings"
      />
      <ClioSettingsSection
        description="Changes learned in the background or imported, waiting for your decision."
        title={
          <>
            Review{' '}
            <Badge aria-label={`${inbox} waiting`} variant={inbox ? 'default' : 'secondary'}>
              {inbox} waiting
            </Badge>
          </>
        }
      >
        <MemoryInbox sessionHref={sessionHref} />
      </ClioSettingsSection>
      <ClioSettingsSection
        description="Account memory follows you into every workspace that uses it; workspace memory stays with its project."
        title="What is remembered"
      >
        {documents.isPending ? <Skeleton className="h-32 w-full" /> : null}
        {documents.error ? (
          <Alert variant="destructive">
            <AlertTitle>Memory unavailable</AlertTitle>
            <AlertDescription>{documents.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {documents.data && !documents.data.length ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Tell the agent to remember something in a conversation, or import.
          </p>
        ) : null}
        <div className="grid gap-6">
          {scopes.map((scope) => (
            <section
              aria-label={scopeTitle(scope, workspaceNames)}
              className="grid gap-2"
              key={scope}
            >
              <h2 className="text-sm font-semibold">{scopeTitle(scope, workspaceNames)}</h2>
              <ScopeTable
                documents={(documents.data ?? []).filter((document) => document.scope === scope)}
                onHistory={setHistory}
                onOpen={open}
              />
            </section>
          ))}
        </div>
      </ClioSettingsSection>
      {sessionSearch ? (
        <ClioSettingsSection
          description="Search what was said in earlier conversations. The agent can do the same when it needs to."
          title="Past sessions"
        >
          <PastSessionsSearch initialSessionId={initialSessionId} />
        </ClioSettingsSection>
      ) : null}
      {opened ? (
        <MemoryDocumentDialog
          highlight={params.get('fact') ?? ''}
          name={opened}
          onOpenChange={(next) => (next ? undefined : open(''))}
          open
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
      <MemoryImportDialog onOpenChange={setImporting} open={importing} />
    </div>
  );
}
