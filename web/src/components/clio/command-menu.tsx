import type { Artifact, MemorySearchHit } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIcon,
  BoxIcon,
  CableIcon,
  FileIcon,
  MessageSquareTextIcon,
  NetworkIcon,
  SettingsIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { brand } from '@brand';
import type { ClioWorkbenchOpenRequest } from '@/components/clio/workbench';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { useRepository } from '@/hooks/use-repository';
import { isPrimarySession, sessionInteractionAt } from '@/lib/recent-sessions';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioRelativeTime } from './relative-time';
import { useLiveStore } from '@/store/live-store';
import { useMenuAction } from '@/tauri/menu-actions';

export function ClioCommandMenu({
  onOpenResource,
}: {
  onOpenResource?: (request: ClioWorkbenchOpenRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [serverQuery, setServerQuery] = useState('');
  const [recentThreshold] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { workspaceId = '', sessionId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const artifacts = useLiveStore((state) => state.entities.artifacts);
  const workspaces = useQuery({
    queryKey: ['workspaces', settings.endpoint],
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const sessions = useQuery({
    queryKey: ['sessions', settings.endpoint, 'all'],
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
  const files = useQuery({
    queryKey: ['workspace-files', settings.endpoint, workspaceId],
    queryFn: ({ signal }) => repository.workspaceFiles(workspaceId, signal),
    enabled: Boolean(workspaceId),
  });
  const memory = useQuery({
    queryKey: ['workspace-memory-search', settings.endpoint, workspaceId, serverQuery],
    queryFn: ({ signal }) =>
      repository.searchMemory(
        serverQuery,
        { workspaceId, includeCrossSession: true, limit: 12 },
        signal,
      ),
    enabled: open && serverQuery.length >= 2 && Boolean(workspaceId),
  });

  useMenuAction('command-palette', () => setOpen((value) => !value));
  useEffect(() => {
    const openMenu = () => setOpen(true);
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('clio:open-command-menu', openMenu);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('clio:open-command-menu', openMenu);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setServerQuery(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingFiles = useMemo(
    () =>
      normalizedQuery
        ? (files.data ?? [])
            .filter(
              (file) =>
                file.type === 'file' && file.path.toLocaleLowerCase().includes(normalizedQuery),
            )
            .slice(0, 16)
        : [],
    [files.data, normalizedQuery],
  );
  const matchingArtifacts = useMemo(
    () =>
      normalizedQuery
        ? Object.values(artifacts)
            .filter(
              (artifact) =>
                artifact.session_id === sessionId &&
                artifact.name.toLocaleLowerCase().includes(normalizedQuery),
            )
            .slice(0, 12)
        : [],
    [artifacts, normalizedQuery, sessionId],
  );
  const workspaceNames = useMemo(
    () =>
      new Map((workspaces.data ?? []).map((workspace) => [workspace.id, workspace.display_name])),
    [workspaces.data],
  );
  const visibleSessions = useMemo(() => {
    const candidates = (sessions.data ?? []).filter(
      (session) =>
        !session.archived &&
        isPrimarySession(session) &&
        (normalizedQuery
          ? `${session.title} ${workspaceNames.get(session.workspace_id) ?? ''}`
              .toLocaleLowerCase()
              .includes(normalizedQuery)
          : session.id === sessionId ||
            session.pinned ||
            Date.parse(sessionInteractionAt(session)) >= recentThreshold),
    );
    return candidates
      .sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          sessionInteractionAt(right).localeCompare(sessionInteractionAt(left)),
      )
      .slice(0, normalizedQuery ? 20 : 10);
  }, [normalizedQuery, recentThreshold, sessionId, sessions.data, workspaceNames]);

  const finish = (action: () => void) => {
    setOpen(false);
    setQuery('');
    action();
  };
  const openRoute = (path: string) =>
    finish(() => navigate(path, { state: { from: location.pathname } }));
  const openMemoryHit = (hit: MemorySearchHit) => {
    const session = sessions.data?.find((candidate) => candidate.id === hit.session_id);
    const targetWorkspace = hit.workspace_id || session?.workspace_id;
    if (!targetWorkspace) return;
    openRoute(
      `/workspaces/${encodeURIComponent(targetWorkspace)}/sessions/${encodeURIComponent(hit.session_id)}#message-${encodeURIComponent(hit.message_id)}`,
    );
  };
  const openResource = (request: ClioWorkbenchOpenRequest) =>
    finish(() => onOpenResource?.(request));

  return (
    <CommandDialog
      className="top-[10dvh] max-h-[78dvh] translate-y-0 sm:max-w-2xl"
      description="Search sessions, conversation memory, workspace resources, and actions."
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery('');
      }}
      open={open}
      title={`${brand.name} command menu`}
    >
      <CommandInput
        onValueChange={setQuery}
        placeholder="Search work, files, artifacts, or actions…"
        value={query}
      />
      <CommandList className="max-h-[68dvh]">
        <CommandEmpty>
          {memory.isFetching ? 'Searching workspace memory…' : 'No matching work or action.'}
        </CommandEmpty>
        {memory.data?.hits.length ? (
          <CommandGroup heading="Conversation memory">
            {memory.data.hits.map((hit) => (
              <CommandItem
                key={`${hit.session_id}:${hit.message_id}:${hit.part_id ?? ''}`}
                onSelect={() => openMemoryHit(hit)}
                value={`${hit.session_title} ${hit.text} ${hit.match_terms.join(' ')}`}
              >
                <MessageSquareTextIcon aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {hit.session_title || 'Untitled session'}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{hit.text}</span>
                </span>
                <CommandShortcut>{roleLabel(hit.role)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {matchingFiles.length ? (
          <CommandGroup heading="Workspace files">
            {matchingFiles.map((file) => (
              <CommandItem
                key={file.path}
                onSelect={() => openResource({ kind: 'workspace-file', path: file.path })}
                value={file.path}
              >
                <FileIcon aria-hidden="true" />
                <span className="truncate">{file.path}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {matchingArtifacts.length ? (
          <CommandGroup heading="Session artifacts">
            {matchingArtifacts.map((artifact: Artifact) => (
              <CommandItem
                key={artifact.id}
                onSelect={() => openResource({ kind: 'artifact', artifact })}
                value={`${artifact.name} ${artifact.media_type}`}
              >
                <BoxIcon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{artifact.name}</span>
                <CommandShortcut>{artifact.media_type}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandGroup heading="Sessions">
          {visibleSessions.map((session) => (
            <CommandItem
              key={session.id}
              onSelect={() =>
                openRoute(`/workspaces/${session.workspace_id}/sessions/${session.id}`)
              }
              value={`${session.title} ${workspaceNames.get(session.workspace_id) ?? ''}`}
            >
              <MessageSquareTextIcon aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{session.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {workspaceNames.get(session.workspace_id) ?? 'Workspace unavailable'}
                </span>
              </span>
              <ClioRelativeTime compact timestamp={sessionInteractionAt(session)} />
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => openRoute('/')}>
            <CableIcon aria-hidden="true" /> Connections<CommandShortcut>↵</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => openRoute('/runs')}>
            <ActivityIcon aria-hidden="true" /> Runs
          </CommandItem>
          <CommandItem onSelect={() => openRoute('/infrastructure')}>
            <NetworkIcon aria-hidden="true" /> Infrastructure
          </CommandItem>
          <CommandItem onSelect={() => openRoute('/settings/appearance')}>
            <SettingsIcon aria-hidden="true" /> Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function roleLabel(role: MemorySearchHit['role']): string {
  if (role === 'assistant') return brand.name;
  if (role === 'user') return 'You';
  return role === 'tool' ? 'Tool' : 'System';
}
