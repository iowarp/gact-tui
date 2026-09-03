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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from 'react';
import { flushSync } from 'react-dom';
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
  onActiveOptionChange,
  onActiveReferenceChange,
  onDismiss,
  onRestoreFocus,
  activeReferenceId,
  onQueryChange,
  query,
  searchInput,
  workspaceId,
}: {
  activeReferenceId?: string;
  /** The DOM id of the highlighted option, for the composer's aria-activedescendant. */
  onActiveOptionChange: (optionId: string | undefined) => void;
  onActiveReferenceChange: (identity: string) => void;
  /** Escape, or a click outside this surface. */
  onDismiss: () => void;
  onReferencesChange: (references: readonly WorkspaceReference[]) => void;
  /** Hand focus back to the composer when this surface has no input of its own. */
  onRestoreFocus: () => void;
  onSelect: (reference: WorkspaceReference) => void;
  onQueryChange: (query: string) => void;
  query: string;
  searchInput: boolean;
  workspaceId: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionElements = useRef(new Map<string, HTMLElement>());
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.label, group.defaultOpen])),
  );
  /**
   * Whichever control drives this surface keeps the keyboard: its own search
   * box when it has one, the composer's editor when the person typed `@`.
   * Expanding a group moves focus to the group button, so it is handed back
   * afterwards or the arrow keys stop reaching the list.
   */
  const restoreFocus = useCallback(() => {
    if (searchInput && searchRef.current) searchRef.current.focus();
    else onRestoreFocus();
  }, [onRestoreFocus, searchInput]);
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

  // cmdk mints the option ids, so the highlighted option's real id is read back
  // off the element rather than assumed.
  useEffect(() => {
    onActiveOptionChange(
      activeReferenceId ? optionElements.current.get(activeReferenceId)?.id : undefined,
    );
  }, [activeReferenceId, onActiveOptionChange, visibleRows]);

  // The popover is not a focus trap and has no backdrop, so a click anywhere
  // else has to close it. `pointerdown` rather than `click` so a click that
  // lands on a control outside dismisses before that control reacts.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onDismiss]);

  return (
    <PromptInputCommand
      aria-label="Reference workspace context"
      className="rounded-xl border bg-popover text-popover-foreground shadow-xl"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      }}
      onValueChange={onActiveReferenceChange}
      ref={rootRef}
      shouldFilter={false}
      value={activeReferenceId}
    >
      {searchInput ? (
        <PromptInputCommandInput
          autoFocus
          onValueChange={onQueryChange}
          placeholder="Search evidence, files, conversations, and agent runs…"
          ref={searchRef}
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
                onOpenChange={(nextOpen) => {
                  setOpenGroups((current) => ({ ...current, [group.label]: nextOpen }));
                  window.requestAnimationFrame(restoreFocus);
                }}
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
                        onClick={(event) => {
                          event.preventDefault();
                          onSelect(reference);
                        }}
                        onPointerDown={(event) => {
                          if (event.pointerType === 'touch' || event.button !== 0) return;
                          event.preventDefault();
                          // The command item can disappear as soon as the
                          // selection closes the popover. Commit the inline
                          // token before the rest of the pointer sequence so a
                          // concurrent render cannot strand the click on a
                          // detached option.
                          flushSync(() => onSelect(reference));
                        }}
                        onSelect={() => onSelect(reference)}
                        ref={(element) => {
                          const identity = workspaceReferenceIdentity(reference);
                          if (element) optionElements.current.set(identity, element);
                          else optionElements.current.delete(identity);
                        }}
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
