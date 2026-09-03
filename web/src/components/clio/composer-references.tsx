import type { WorkspaceReference } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  BotIcon,
  BracesIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FileDiffIcon,
  FileTextIcon,
  ListTreeIcon,
  MessageSquareIcon,
  PackageIcon,
  WaypointsIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import {
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandInput,
  PromptInputCommandItem,
  PromptInputCommandList,
} from '@/components/ai-elements/prompt-input';
import { useRepository } from '@/hooks/use-repository';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { workspaceReferenceIdentity } from '@/lib/composer-reference-domain';

type ReferenceIcon = ComponentType<SVGProps<SVGSVGElement>>;

const presentationByKind: Record<WorkspaceReference['kind'], { icon: ReferenceIcon }> = {
  workspace_file: { icon: FileTextIcon },
  resource: { icon: DatabaseIcon },
  artifact: { icon: PackageIcon },
  evidence_source: { icon: WaypointsIcon },
  context_frame: { icon: BracesIcon },
  diff: { icon: FileDiffIcon },
  plan: { icon: ListTreeIcon },
  session: { icon: MessageSquareIcon },
  agent_run: { icon: BotIcon },
};

const groups: Array<{
  defaultOpen: boolean;
  kinds: WorkspaceReference['kind'][];
  label: string;
}> = [
  { defaultOpen: true, kinds: ['artifact'], label: 'Artifacts' },
  { defaultOpen: false, kinds: ['workspace_file'], label: 'Local files' },
  // Uploaded files and tool-observed evidence have different wire identities, but both are
  // user-facing sources. Artifacts remain reserved for generated or registered outputs.
  { defaultOpen: true, kinds: ['resource', 'evidence_source'], label: 'Sources' },
  { defaultOpen: false, kinds: ['session'], label: 'Conversations' },
  { defaultOpen: false, kinds: ['agent_run'], label: 'Agents and runs' },
  { defaultOpen: false, kinds: ['context_frame'], label: 'Context records' },
  { defaultOpen: false, kinds: ['diff'], label: 'Changed files' },
  { defaultOpen: false, kinds: ['plan'], label: 'Plans' },
];

const nonFileKinds = groups
  .flatMap((group) => group.kinds)
  .filter((kind) => kind !== 'workspace_file');

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

function conciseDetail(reference: WorkspaceReference): string {
  return reference.detail
    .replace(/\s+·\s+(?:source|sha256):[^\s]+$/i, '')
    .replace(/\s+·\s+/g, ' — ');
}

export function ClioComposerReferenceMenu({
  onSelect,
  onReferencesChange,
  onActiveReferenceChange,
  activeReferenceId,
  onQueryChange,
  query,
  searchInput,
  workspaceId,
}: {
  activeReferenceId?: string;
  onActiveReferenceChange: (identity: string) => void;
  onReferencesChange: (references: readonly WorkspaceReference[]) => void;
  onSelect: (reference: WorkspaceReference) => void;
  onQueryChange: (query: string) => void;
  query: string;
  searchInput: boolean;
  workspaceId: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.label, group.defaultOpen])),
  );
  const debouncedQuery = useDebouncedValue(query.trim(), 100);
  const isSearching = Boolean(query.trim());
  const requestedKinds = debouncedQuery ? [] : nonFileKinds;
  const requestedKindsKey = requestedKinds.join(',');
  const references = useQuery({
    enabled: Boolean(workspaceId),
    queryKey: queryKeys.workspaceReferences(
      settings.endpoint,
      workspaceId,
      debouncedQuery,
      requestedKindsKey,
    ),
    queryFn: ({ signal }) =>
      repository.workspaceReferences(
        workspaceId,
        { q: debouncedQuery, kinds: requestedKinds },
        signal,
      ),
    staleTime: 15_000,
  });
  const localFiles = useQuery({
    enabled: Boolean(workspaceId) && !isSearching && openGroups['Local files'],
    queryKey: queryKeys.workspaceReferences(settings.endpoint, workspaceId, '', 'workspace_file'),
    queryFn: ({ signal }) =>
      repository.workspaceReferences(workspaceId, { kinds: ['workspace_file'] }, signal),
    staleTime: 15_000,
  });
  // Older servers may return an unbounded workspace inventory. Keep the
  // command palette responsive even when connected to one of them.
  const rows = useMemo(() => {
    // React Query retains the collapsed inventory in its cache after the user
    // starts typing. Do not mix those stale unfiltered files into live search
    // results; a query must reflect only the bounded server search.
    const combined = [...(references.data ?? []), ...(!isSearching ? (localFiles.data ?? []) : [])];
    const identities = new Set<string>();
    return combined
      .filter((reference) => {
        const identity = workspaceReferenceIdentity(reference);
        if (identities.has(identity)) return false;
        identities.add(identity);
        return true;
      })
      .slice(0, 100);
  }, [isSearching, localFiles.data, references.data]);

  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        const group = groups.find((candidate) => candidate.kinds.includes(row.kind));
        return Boolean(group && (isSearching || openGroups[group.label]));
      }),
    [isSearching, openGroups, rows],
  );

  useEffect(() => onReferencesChange(visibleRows), [onReferencesChange, visibleRows]);

  return (
    <PromptInputCommand
      aria-label="Reference workspace context"
      className="rounded-xl border bg-popover text-popover-foreground shadow-xl"
      onValueChange={onActiveReferenceChange}
      shouldFilter={false}
      value={activeReferenceId}
    >
      {searchInput ? (
        <PromptInputCommandInput
          autoFocus
          onValueChange={onQueryChange}
          placeholder="Search evidence, files, conversations, and agent runs…"
          value={query}
        />
      ) : null}
      <PromptInputCommandList className="max-h-[min(38rem,calc(100vh-10rem))] overscroll-contain">
        <PromptInputCommandEmpty>
          {references.isError || localFiles.isError
            ? 'References are unavailable from the connected service.'
            : references.isFetching || localFiles.isFetching
              ? 'Searching workspace context…'
              : 'No workspace context matches.'}
        </PromptInputCommandEmpty>
        {groups.map((group) => {
          const matches = rows.filter((row) => group.kinds.includes(row.kind));
          const alwaysVisible = group.label === 'Artifacts' || group.label === 'Local files';
          if (!matches.length && !alwaysVisible) return null;
          const open = isSearching || openGroups[group.label];
          return (
            <PromptInputCommandGroup className="p-0" key={group.label}>
              <Collapsible
                onOpenChange={(nextOpen) =>
                  setOpenGroups((current) => ({ ...current, [group.label]: nextOpen }))
                }
                open={open}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${group.label}`}
                    className="h-7 w-full justify-between rounded-sm px-2"
                    size="sm"
                    variant="ghost"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ChevronRightIcon
                        aria-hidden="true"
                        className={cn('transition-transform', open && 'rotate-90')}
                        data-icon="inline-start"
                      />
                      <span>{group.label}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {group.label === 'Local files' && localFiles.isFetching
                        ? '…'
                        : matches.length}
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {matches.map((reference) => {
                    const Icon = presentationByKind[reference.kind].icon;
                    const detail = conciseDetail(reference);
                    return (
                      <PromptInputCommandItem
                        aria-label={`${reference.label} ${detail}`}
                        className="h-7 px-2 py-0"
                        key={`${reference.kind}:${reference.id}:${reference.revision}`}
                        onSelect={() => onSelect(reference)}
                        value={workspaceReferenceIdentity(reference)}
                      >
                        <Icon aria-hidden="true" className="shrink-0 text-muted-foreground" />
                        <span className="min-w-0 shrink-0 truncate font-medium">
                          {reference.label}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {detail}
                        </span>
                      </PromptInputCommandItem>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            </PromptInputCommandGroup>
          );
        })}
      </PromptInputCommandList>
    </PromptInputCommand>
  );
}
