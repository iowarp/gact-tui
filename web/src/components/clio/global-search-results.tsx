import { BotIcon, CableIcon, ChevronRightIcon, ServerIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { useConnectionSettings } from '@/providers/connection-provider';
import { agentSearchTarget, type GlobalSearchCommand } from '@/lib/global-search-commands';
import { capRows, inCommandMenuScope, type CommandMenuScope } from '@/lib/command-menu-scopes';
import { useTheme } from '@/providers/appearance-provider';
import { SearchHighlight } from './search-highlight';
import { ShortcutKeys } from './primitives/key-chip';
import { useGlobalSearchMatches, type GlobalSearchMatches } from './use-global-search-matches';

/**
 * Reads the app-wide matches and hands them to `children`. It mounts with the
 * open palette only, so closed, it reads and probes nothing.
 */
export function GlobalSearchMatchesScope({
  query,
  scope,
  onFinish,
  children,
}: {
  query: string;
  scope: CommandMenuScope;
  onFinish: () => void;
  children: (matches: GlobalSearchMatches) => ReactNode;
}) {
  return children(useGlobalSearchMatches(query, scope, onFinish));
}

/** A group label with its match count at the right edge, in fixed figures. */
export function ResultsHeading({ label, count }: { label: string; count?: number }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-3 whitespace-nowrap">
      <span className="truncate">{label}</span>
      {count ? <span className="shrink-0 tabular-nums">{count}</span> : null}
    </span>
  );
}

/** The last row of a capped group under All: its own tab, one Enter away. */
export function MoreResultsItem({
  hidden,
  noun,
  scope,
  onMore,
}: {
  hidden: number;
  noun: string;
  scope: CommandMenuScope;
  onMore: (scope: CommandMenuScope) => void;
}) {
  if (hidden <= 0) return null;
  return (
    <CommandItem
      className="text-muted-foreground"
      onSelect={() => onMore(scope)}
      value={`more:${scope}:${noun}`}
    >
      <span aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {hidden} more {noun}
      </span>
      <ChevronRightIcon aria-hidden="true" />
    </CommandItem>
  );
}

const COMMAND_GROUPS: readonly {
  group: GlobalSearchCommand['group'];
  heading: string;
  scope: CommandMenuScope;
  noun: string;
}[] = [
  { group: 'Navigation', heading: 'Go to', scope: 'actions', noun: 'places' },
  { group: 'Actions', heading: 'Actions', scope: 'actions', noun: 'actions' },
  { group: 'Settings', heading: 'Settings', scope: 'settings', noun: 'settings' },
];

/** The app-wide groups of the palette, for the tab that is open. */
export function GlobalSearchGroups({
  matches,
  query,
  scope,
  limit,
  onRoute,
  onFinish,
  onMore,
  searching,
  after,
}: {
  matches: GlobalSearchMatches;
  query: string;
  scope: CommandMenuScope;
  /** Rows per group; undefined shows every match. */
  limit?: number;
  onRoute: (route: string) => void;
  onFinish: () => void;
  onMore: (scope: CommandMenuScope) => void;
  /** Whether a query is typed; counts show only then. */
  searching: boolean;
  /** Groups the caller renders between Settings and More. */
  after?: ReactNode;
}) {
  const { settings } = useConnectionSettings();
  const { setTheme, theme } = useTheme();
  const { commands, switching } = matches;
  const commandGroup = (
    group: GlobalSearchCommand['group'],
    heading: string,
    groupScope: CommandMenuScope,
    noun: string,
  ) => {
    if (!inCommandMenuScope(scope, groupScope)) return null;
    const items = commands[group];
    if (!items.length) return null;
    const { rows, hidden } = capRows(items, limit);
    return (
      <CommandGroup
        heading={<ResultsHeading count={searching ? items.length : undefined} label={heading} />}
        key={group}
      >
        {rows.map((item) => (
          <CommandItem
            key={item.id}
            onSelect={() => {
              if ('route' in item.action) onRoute(item.action.route);
              else {
                setTheme(item.action.theme);
                onFinish();
              }
            }}
            value={item.id}
          >
            <item.icon aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              <SearchHighlight query={query} text={item.label} />
            </span>
            {'theme' in item.action && theme === item.action.theme ? (
              <CommandShortcut>Current</CommandShortcut>
            ) : item.shortcut ? (
              <ShortcutKeys id={item.shortcut} />
            ) : item.trail ? (
              <CommandShortcut>{item.trail}</CommandShortcut>
            ) : null}
          </CommandItem>
        ))}
        <MoreResultsItem hidden={hidden} noun={noun} onMore={onMore} scope={groupScope} />
      </CommandGroup>
    );
  };
  const agents = capRows(matches.agents, limit);
  const targets = capRows(matches.targets, limit);
  const connections = capRows(matches.connections, limit);
  const more = inCommandMenuScope(scope, 'more');
  return (
    <>
      {COMMAND_GROUPS.map((item) => commandGroup(item.group, item.heading, item.scope, item.noun))}
      {inCommandMenuScope(scope, 'settings') && agents.rows.length ? (
        <CommandGroup
          heading={
            <ResultsHeading count={searching ? matches.agents.length : undefined} label="Agents" />
          }
        >
          {agents.rows.map((item) => (
            <CommandItem
              key={item.ref}
              onSelect={() => onRoute(`/settings/agents#${agentSearchTarget(item.ref)}`)}
              value={`agent:${item.ref}`}
            >
              <BotIcon aria-hidden="true" />
              <span className="shrink-0 truncate">
                <SearchHighlight query={query} text={item.name || item.id} />
              </span>
              <span
                className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                title={item.description || undefined}
              >
                {item.description}
              </span>
              <CommandShortcut>{item.kind === 'user' ? 'Your agent' : 'Agent'}</CommandShortcut>
            </CommandItem>
          ))}
          <MoreResultsItem hidden={agents.hidden} noun="agents" onMore={onMore} scope="settings" />
        </CommandGroup>
      ) : null}
      {inCommandMenuScope(scope, 'settings') && matches.agentsError ? (
        <p
          className="truncate px-3 py-2 text-xs text-destructive"
          role="alert"
          title={matches.agentsError.message}
        >
          Agents could not be searched. Try again, or open Settings ? Agents.
        </p>
      ) : null}
      {after}
      {more ? commandGroup('Infrastructure', 'Infrastructure', 'more', 'places') : null}
      {more && connections.rows.length ? (
        <CommandGroup
          heading={
            <ResultsHeading
              count={searching ? matches.connections.length : undefined}
              label="Connections"
            />
          }
        >
          {connections.rows.map((item) => (
            <CommandItem
              disabled={switching.isPending}
              key={item.endpoint}
              onSelect={() =>
                item.endpoint === settings.endpoint ? onFinish() : switching.mutate(item)
              }
              value={`connection:${item.endpoint}`}
            >
              <CableIcon aria-hidden="true" />
              <span className="shrink-0 truncate" title={item.endpoint}>
                <SearchHighlight query={query} text={item.label || connectionName(item.endpoint)} />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {item.location}
              </span>
              <CommandShortcut>
                {item.endpoint === settings.endpoint ? 'Current' : item.availability.label}
              </CommandShortcut>
            </CommandItem>
          ))}
          <MoreResultsItem
            hidden={connections.hidden}
            noun="connections"
            onMore={onMore}
            scope="more"
          />
        </CommandGroup>
      ) : null}
      {switching.error ? (
        <p className="px-3 py-2 text-xs text-destructive" role="alert">
          Connection could not be opened. {switching.error.message}
        </p>
      ) : null}
      {more && targets.rows.length ? (
        <CommandGroup
          heading={
            <ResultsHeading count={searching ? matches.targets.length : undefined} label="Hosts" />
          }
        >
          {targets.rows.map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() =>
                onRoute(`/infrastructure/services?target=${encodeURIComponent(item.id)}`)
              }
              value={`host:${item.id}`}
            >
              <ServerIcon aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                <SearchHighlight query={query} text={item.label || item.id} />
              </span>
              <CommandShortcut>Infrastructure</CommandShortcut>
            </CommandItem>
          ))}
          <MoreResultsItem hidden={targets.hidden} noun="hosts" onMore={onMore} scope="more" />
        </CommandGroup>
      ) : null}
      {more && matches.targetsError ? (
        <p
          className="truncate px-3 py-2 text-xs text-destructive"
          role="alert"
          title={matches.targetsError.message}
        >
          Hosts could not be searched. Try again, or open Infrastructure.
        </p>
      ) : null}
    </>
  );
}

/** A connection without a label is named by its host; the full address stays in the tooltip. */
function connectionName(endpoint: string): string {
  try {
    return new URL(endpoint).host || endpoint;
  } catch {
    return endpoint;
  }
}
