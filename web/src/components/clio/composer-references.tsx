import type { WorkspaceReference } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  AtSignIcon,
  BotIcon,
  DatabaseIcon,
  FileTextIcon,
  MessageSquareIcon,
  PackageIcon,
  XIcon,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
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
import {
  referenceIdentity,
  referenceLabel,
  toMessagePart,
  type ReferencePart,
} from './composer-reference-domain';

type ReferenceIcon = ComponentType<SVGProps<SVGSVGElement>>;

const groups: Array<{
  kind: WorkspaceReference['kind'];
  label: string;
  icon: ReferenceIcon;
}> = [
  { kind: 'workspace_file', label: 'Local files', icon: FileTextIcon },
  { kind: 'resource', label: 'Resources', icon: DatabaseIcon },
  { kind: 'artifact', label: 'Artifacts', icon: PackageIcon },
  { kind: 'session', label: 'Conversations', icon: MessageSquareIcon },
  { kind: 'agent_run', label: 'Agents and runs', icon: BotIcon },
];

export function ClioComposerReferenceMenu({
  onSelect,
  onQueryChange,
  query,
  searchInput,
  workspaceId,
}: {
  onSelect: (part: ReferencePart) => void;
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
  const rows = (references.data ?? []).slice(0, 100);

  return (
    <PromptInputCommand
      aria-label="Reference workspace context"
      className="rounded-xl border bg-popover text-popover-foreground shadow-xl"
      shouldFilter={false}
    >
      {searchInput ? (
        <PromptInputCommandInput
          autoFocus
          onValueChange={onQueryChange}
          placeholder="Search files, resources, artifacts, conversations, and runs…"
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
                  key={`${reference.kind}:${reference.id}:${reference.revision}`}
                  onSelect={() => onSelect(toMessagePart(reference))}
                  value={`${reference.kind} ${reference.label} ${reference.detail} ${reference.id}`}
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
  onRemove,
  parts,
}: {
  className?: string;
  onRemove: (part: ReferencePart) => void;
  parts: readonly ReferencePart[];
}) {
  if (!parts.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5 px-3 pt-2', className)} role="list">
      {parts.map((part) => {
        const identity = referenceIdentity(part);
        return (
          <span
            className="inline-flex min-w-0 max-w-56 items-center gap-1 rounded-full border bg-muted/45 px-2 py-1 text-xs"
            key={identity}
            role="listitem"
          >
            <AtSignIcon aria-hidden="true" className="size-3 shrink-0 text-primary" />
            <span className="truncate">{referenceLabel(part)}</span>
            <button
              aria-label={`Remove ${referenceLabel(part)}`}
              className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onRemove(part)}
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
