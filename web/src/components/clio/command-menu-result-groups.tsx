import { workspaceName } from '@/lib/workspace-labels';
import type { MemorySearchHit } from '@clio/core/v3';
import { FolderIcon, MessageSquareTextIcon } from 'lucide-react';
import { CommandGroup, CommandItem } from '@/components/ui/command';
import { capRows, inCommandMenuScope, type CommandMenuScope } from '@/lib/command-menu-scopes';
import { sessionInteractionAt } from '@/lib/recent-sessions';
import type { CommandMenuResource, CommandMenuResults } from './command-menu-results';
import { ArtifactResultGroup, FileResultGroup, MessageHitGroup } from './command-menu-work-groups';
import {
  GlobalSearchGroups,
  MoreResultsItem,
  ResultDetail,
  ResultsHeading,
  ResultTrail,
} from './global-search-results';
import { ClioRelativeTime } from './relative-time';
import { SearchHighlight } from './search-highlight';
import { isMissingEndpoint, type GlobalSearchMatches } from './use-global-search-matches';
import { t, ph } from '@lingui/core/macro';

/**
 * Every result group for the tab that is open, in the palette's order:
 * conversations, passages, files, artifacts, then actions, settings and more.
 * `limit` caps each group (with an "N more" row); undefined lists them all.
 */
export function CommandMenuResultGroups({
  results,
  global,
  scope,
  limit,
  searchText,
  onRoute,
  onFinish,
  onMore,
  onOpenMemoryHit,
  onOpenResource,
  onOpenWorkspace,
}: {
  results: CommandMenuResults;
  global: GlobalSearchMatches;
  scope: CommandMenuScope;
  limit?: number;
  searchText: string;
  onRoute: (path: string) => void;
  onFinish: () => void;
  onMore: (scope: CommandMenuScope) => void;
  onOpenMemoryHit: (hit: MemorySearchHit) => void;
  onOpenResource: (request: CommandMenuResource) => void;
  onOpenWorkspace: (id: string) => void;
}) {
  const {
    searching,
    memory,
    workspaceNames,
    visibleSessions,
    memoryHits,
    matchingFiles,
    matchingArtifacts,
    matchingWorkspaces,
  } = results;
  const sessionRows = capRows(visibleSessions, limit);
  const messageRows = capRows(memoryHits, limit);
  const fileRows = capRows(matchingFiles, limit);
  const artifactRows = capRows(matchingArtifacts, limit);
  const workspaceRows = capRows(matchingWorkspaces, limit);
  return (
    <>
      {inCommandMenuScope(scope, 'conversations') && sessionRows.rows.length ? (
        <CommandGroup
          heading={
            <ResultsHeading
              count={searching ? visibleSessions.length : undefined}
              label={searching ? t`Conversations` : t`Recent conversations`}
            />
          }
        >
          {sessionRows.rows.map((session) => (
            <CommandItem
              key={session.id}
              onSelect={() => onRoute(`/workspaces/${session.workspace_id}/sessions/${session.id}`)}
              value={`session:${session.id}`}
            >
              <MessageSquareTextIcon aria-hidden="true" />
              <span className="min-w-0 flex-[0_1_auto] truncate">
                <SearchHighlight text={session.title} query={searchText} />
              </span>
              <ResultDetail>
                <SearchHighlight
                  text={workspaceNames.get(session.workspace_id) ?? t`Workspace unavailable`}
                  query={searchText}
                />
              </ResultDetail>
              <ResultTrail>
                <ClioRelativeTime compact timestamp={sessionInteractionAt(session)} />
              </ResultTrail>
            </CommandItem>
          ))}
          <MoreResultsItem
            hidden={sessionRows.hidden}
            noun="conversations"
            onMore={onMore}
            scope="conversations"
          />
        </CommandGroup>
      ) : null}
      {inCommandMenuScope(scope, 'conversations') &&
      memory.error &&
      !isMissingEndpoint(memory.error) ? (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          {t`Conversation search failed. ${ph({ message: memory.error.message })}`}
        </p>
      ) : null}
      {inCommandMenuScope(scope, 'conversations') && messageRows.rows.length ? (
        <MessageHitGroup
          hits={messageRows}
          onMore={onMore}
          onOpen={onOpenMemoryHit}
          query={searchText}
          total={memoryHits.length}
          workspaceNames={workspaceNames}
        />
      ) : null}
      {inCommandMenuScope(scope, 'files') && fileRows.rows.length ? (
        <FileResultGroup
          files={fileRows}
          onMore={onMore}
          onOpen={(path) => onOpenResource({ kind: 'workspace-file', path })}
          query={searchText}
          total={matchingFiles.length}
        />
      ) : null}
      {inCommandMenuScope(scope, 'artifacts') && artifactRows.rows.length ? (
        <ArtifactResultGroup
          artifacts={artifactRows}
          onMore={onMore}
          onOpen={(artifact) => onOpenResource({ kind: 'artifact', artifact })}
          query={searchText}
          total={matchingArtifacts.length}
        />
      ) : null}
      <GlobalSearchGroups
        limit={limit}
        matches={global}
        onFinish={onFinish}
        onMore={onMore}
        onRoute={onRoute}
        query={searchText}
        scope={scope}
        searching={searching}
        after={
          inCommandMenuScope(scope, 'more') && workspaceRows.rows.length ? (
            <CommandGroup
              heading={<ResultsHeading count={matchingWorkspaces.length} label={t`Workspaces`} />}
            >
              {workspaceRows.rows.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`workspace:${item.id}`}
                  onSelect={() => onOpenWorkspace(item.id)}
                >
                  <FolderIcon aria-hidden="true" />
                  <span className="min-w-0 flex-[0_1_auto] truncate">
                    <SearchHighlight text={workspaceName(item)} query={searchText} />
                  </span>
                  <ResultTrail>{t`Workspace`}</ResultTrail>
                </CommandItem>
              ))}
              <MoreResultsItem
                hidden={workspaceRows.hidden}
                noun="workspaces"
                onMore={onMore}
                scope="more"
              />
            </CommandGroup>
          ) : null
        }
      />
    </>
  );
}
