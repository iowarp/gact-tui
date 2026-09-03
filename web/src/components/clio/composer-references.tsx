import type { WorkspaceReference } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  AtSignIcon,
  BotIcon,
  BracesIcon,
  DatabaseIcon,
  FileDiffIcon,
  FileTextIcon,
  ListTreeIcon,
  MessageSquareIcon,
  PackageIcon,
  WaypointsIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useMemo, type ComponentType, type SVGProps } from 'react';
import {
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandInput,
  PromptInputCommandItem,
  PromptInputCommandList,
} from '@/components/ai-elements/prompt-input';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { workspaceReferenceIdentity } from './composer-reference-domain';

type ReferenceIcon = ComponentType<SVGProps<SVGSVGElement>>;

const groups: Array<{
  kind: WorkspaceReference['kind'];
  label: string;
  icon: ReferenceIcon;
}> = [
  { kind: 'workspace_file', label: 'Local files', icon: FileTextIcon },
  { kind: 'resource', label: 'Resources', icon: DatabaseIcon },
  { kind: 'artifact', label: 'Artifacts', icon: PackageIcon },
  { kind: 'evidence_source', label: 'Sources', icon: WaypointsIcon },
  { kind: 'context_frame', label: 'Context records', icon: BracesIcon },
  { kind: 'diff', label: 'Changed files', icon: FileDiffIcon },
  { kind: 'plan', label: 'Plans', icon: ListTreeIcon },
  { kind: 'session', label: 'Conversations', icon: MessageSquareIcon },
  { kind: 'agent_run', label: 'Agents and runs', icon: BotIcon },
];

const iconByKind = Object.fromEntries(groups.map((group) => [group.kind, group.icon])) as Record<
  WorkspaceReference['kind'],
  ReferenceIcon
>;

const labelByKind = Object.fromEntries(groups.map((group) => [group.kind, group.label])) as Record<
  WorkspaceReference['kind'],
  string
>;

const itemLabelByKind: Record<WorkspaceReference['kind'], string> = {
  workspace_file: 'local file',
  resource: 'resource',
  artifact: 'artifact',
  evidence_source: 'source',
  context_frame: 'context record',
  diff: 'changed file',
  plan: 'plan',
  session: 'conversation',
  agent_run: 'agent run',
};

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
  const references = useQuery({
    enabled: Boolean(workspaceId),
    queryKey: queryKeys.workspaceReferences(settings.endpoint, workspaceId, query),
    queryFn: ({ signal }) => repository.workspaceReferences(workspaceId, { q: query }, signal),
    staleTime: 15_000,
  });
  // Older servers may return an unbounded workspace inventory. Keep the
  // command palette responsive even when connected to one of them.
  const rows = useMemo(() => (references.data ?? []).slice(0, 100), [references.data]);

  useEffect(() => onReferencesChange(rows), [onReferencesChange, rows]);

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
      <PromptInputCommandList className="max-h-80 overscroll-contain">
        <PromptInputCommandEmpty>
          {references.isError
            ? 'References are unavailable from the connected service.'
            : references.isPending
              ? 'Searching workspace context…'
              : 'No workspace context matches.'}
        </PromptInputCommandEmpty>
        {groups.map((group) => {
          const matches = rows.filter((row) => row.kind === group.kind);
          if (!matches.length) return null;
          const Icon = group.icon;
          return (
            <PromptInputCommandGroup heading={group.label} key={group.kind}>
              {matches.map((reference) => (
                <PromptInputCommandItem
                  aria-label={`${reference.label} ${reference.detail}`}
                  key={`${reference.kind}:${reference.id}:${reference.revision}`}
                  onSelect={() => onSelect(reference)}
                  value={workspaceReferenceIdentity(reference)}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{reference.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {reference.detail}
                    </span>
                  </span>
                </PromptInputCommandItem>
              ))}
            </PromptInputCommandGroup>
          );
        })}
      </PromptInputCommandList>
    </PromptInputCommand>
  );
}

export function ClioComposerReferenceChips({
  className,
  onOpen,
  onRemove,
  references,
}: {
  className?: string;
  onOpen?: (reference: WorkspaceReference) => void;
  onRemove: (reference: WorkspaceReference) => void;
  references: readonly WorkspaceReference[];
}) {
  if (!references.length) return null;
  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2', className)}
      role="list"
    >
      {references.map((reference) => {
        const identity = workspaceReferenceIdentity(reference);
        const Icon = iconByKind[reference.kind] ?? AtSignIcon;
        const kindLabel = labelByKind[reference.kind] ?? 'Reference';
        const itemLabel = itemLabelByKind[reference.kind] ?? 'reference';
        return (
          <span
            className="group/reference inline-flex min-w-0 max-w-64 items-center gap-1 text-sm"
            key={identity}
            role="listitem"
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            <button
              aria-label={`Open ${itemLabel} ${reference.label}`}
              className="min-w-0 truncate rounded-sm text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!onOpen}
              onClick={() => onOpen?.(reference)}
              title={`${kindLabel} · ${reference.detail}`}
              type="button"
            >
              {reference.label}
            </button>
            <button
              aria-label={`Remove ${reference.label}`}
              className="rounded-sm text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onRemove(reference)}
              type="button"
            >
              <XIcon aria-hidden="true" className="size-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
