import { brand } from '@brand';
import type { Artifact, MemorySearchHit } from '@clio/core/v3';
import { BoxIcon, FileIcon, MessageSquareTextIcon } from 'lucide-react';
import { CommandGroup, CommandItem } from '@/components/ui/command';
import { messageSnippetText } from '@/lib/message-snippet';
import { formatCompactBytes } from '@/lib/format';
import type { CommandMenuScope } from '@/lib/command-menu-scopes';
import {
  MoreResultsItem,
  ResultDetail,
  ResultsHeading,
  ResultTrail,
} from './global-search-results';
import { SearchHighlight } from './search-highlight';

type Rows<Item> = { rows: readonly Item[]; hidden: number };

function roleLabel(role: MemorySearchHit['role']): string {
  if (role === 'assistant') return brand.name;
  if (role === 'user') return 'You';
  return role === 'tool' ? 'Tool' : 'System';
}

/** Remembered-context passages that match the query. */
export function MessageHitGroup({
  hits,
  total,
  query,
  workspaceNames,
  onOpen,
  onMore,
}: {
  hits: Rows<MemorySearchHit>;
  total: number;
  query: string;
  workspaceNames: ReadonlyMap<string, string>;
  onOpen: (hit: MemorySearchHit) => void;
  onMore: (scope: CommandMenuScope) => void;
}) {
  return (
    <CommandGroup heading={<ResultsHeading count={total} label="Matching messages" />}>
      {hits.rows.map((hit) => (
        <CommandItem
          key={`${hit.session_id}:${hit.message_id}:${hit.part_id ?? ''}`}
          onSelect={() => onOpen(hit)}
          value={`message:${hit.session_id}:${hit.message_id}:${hit.part_id ?? ''}`}
          className="items-start py-2"
        >
          <MessageSquareTextIcon aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {/* The role sits on the title line, so the snippet keeps the row's width when narrow. */}
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">
                <SearchHighlight text={hit.session_title || 'Untitled session'} query={query} />
              </span>
              <span className="shrink-0 text-[11px] whitespace-nowrap text-faint">
                {roleLabel(hit.role)}
              </span>
            </span>
            <span className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
              <SearchHighlight text={messageSnippetText(hit.text)} query={query} partial />
            </span>
            <span className="mt-1 block truncate text-[11px] text-muted-foreground">
              {workspaceNames.get(hit.workspace_id) ?? hit.workspace_id} → Open matching passage
            </span>
          </span>
          <ResultTrail />
        </CommandItem>
      ))}
      <MoreResultsItem hidden={hits.hidden} noun="messages" onMore={onMore} scope="conversations" />
    </CommandGroup>
  );
}

/** Workspace files whose path matches the query. */
export function FileResultGroup({
  files,
  total,
  query,
  onOpen,
  onMore,
}: {
  files: Rows<{ path: string; size?: number }>;
  total: number;
  query: string;
  onOpen: (path: string) => void;
  onMore: (scope: CommandMenuScope) => void;
}) {
  return (
    <CommandGroup heading={<ResultsHeading count={total} label="Files" />}>
      {files.rows.map((file) => {
        const slash = file.path.lastIndexOf('/');
        const name = file.path.slice(slash + 1);
        const folder = slash > 0 ? file.path.slice(0, slash) : '';
        return (
          <CommandItem key={file.path} onSelect={() => onOpen(file.path)} value={file.path}>
            <FileIcon aria-hidden="true" />
            <span className="min-w-0 flex-[0_1_auto] truncate" title={file.path}>
              <SearchHighlight text={name} query={query} />
            </span>
            {folder ? (
              <ResultDetail title={file.path}>
                <SearchHighlight text={folder} query={query} />
              </ResultDetail>
            ) : null}
            <ResultTrail>
              {file.size === undefined ? null : formatCompactBytes(file.size)}
            </ResultTrail>
          </CommandItem>
        );
      })}
      <MoreResultsItem hidden={files.hidden} noun="files" onMore={onMore} scope="files" />
    </CommandGroup>
  );
}

/** Session artifacts whose name matches the query. */
export function ArtifactResultGroup({
  artifacts,
  total,
  query,
  onOpen,
  onMore,
}: {
  artifacts: Rows<Artifact>;
  total: number;
  query: string;
  onOpen: (artifact: Artifact) => void;
  onMore: (scope: CommandMenuScope) => void;
}) {
  return (
    <CommandGroup heading={<ResultsHeading count={total} label="Artifacts" />}>
      {artifacts.rows.map((artifact) => (
        <CommandItem
          key={artifact.id}
          onSelect={() => onOpen(artifact)}
          value={`artifact:${artifact.id}`}
        >
          <BoxIcon aria-hidden="true" />
          <span className="min-w-0 flex-[0_1_auto] truncate">
            <SearchHighlight text={artifact.name} query={query} />
          </span>
          <ResultTrail>{artifact.media_type}</ResultTrail>
        </CommandItem>
      ))}
      <MoreResultsItem
        hidden={artifacts.hidden}
        noun="artifacts"
        onMore={onMore}
        scope="artifacts"
      />
    </CommandGroup>
  );
}
