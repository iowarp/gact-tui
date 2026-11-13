import { useQuery } from '@tanstack/react-query';
import { BotIcon, CableIcon, ChevronRightIcon, ServerIcon } from 'lucide-react';
import { MoreIcon } from '@/lib/icon-vocabulary';
import type { ReactNode } from 'react';
import { CommandGroup, CommandItem } from '@/components/ui/command';
import { useConnectionSettings } from '@/providers/connection-provider';
import { agentSearchTarget, type GlobalSearchCommand } from '@/lib/global-search-commands';
import { capRows, inCommandMenuScope, type CommandMenuScope } from '@/lib/command-menu-scopes';
import { useAppearancePreferences, useTheme } from '@/providers/appearance-provider';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { compactModelName } from '@/lib/model-options';
import { providerDisplayName } from '@/lib/provider-presentation';
import type { SettingsSearchValue } from '@/lib/settings-search-rows';
import { THEMES, type ThemeId } from '@/theme/contract';
import { changeLocalePreference, currentLocalePreference } from '@/i18n/runtime';
import { SearchHighlight } from './search-highlight';
import { agentAvailabilityLabel } from './connection-names';
import { KeyCap, ShortcutKeys } from './primitives/key-chip';
import { useGlobalSearchMatches, type GlobalSearchMatches } from './use-global-search-matches';
import { t, ph, plural } from '@lingui/core/macro';

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
      {count ? (
        <span className="shrink-0 font-mono text-[0.65625rem] font-normal tabular-nums">{count}</span>
      ) : null}
    </span>
  );
}

/**
 * Quiet text beside a result's name: its workspace, folder or place in Settings.
 * With less than 4 rem of room it drops out rather than show a letter: the text
 * wraps past the line-high spacer onto a second line, which is clipped. A zero
 * basis lets the name keep its full width before the detail takes what is left.
 */
export function ResultDetail({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      className="flex h-[1lh] min-w-0 flex-[1_1_0%] flex-wrap overflow-hidden text-label text-faint"
      title={title}
    >
      <span aria-hidden="true" className="h-[1lh] w-0" />
      <span className="min-w-16 flex-[1_1_4rem] truncate">{children}</span>
    </span>
  );
}

/**
 * The right end of a result: its value, time or size, then ↵ on the row the
 * keyboard is on.
 */
export function ResultTrail({ children }: { children?: ReactNode }) {
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-[11px] pl-2 text-caption whitespace-nowrap text-faint tabular-nums"
      data-slot="command-shortcut"
    >
      {children}
      <span
        aria-hidden="true"
        className="hidden group-data-[selected=true]/command-item:inline-flex"
      >
        {/* #825's KeyCap `row` size; S7 folds it into ShortcutKeys `row`. */}
        <KeyCap className="h-5 min-w-5 px-1.5 text-caption">↵</KeyCap>
      </span>
    </span>
  );
}

/** "3 more files": the hidden rows of a capped group, by the group's noun (an identifier). */
function moreLabel(hidden: number, noun: string): string {
  switch (noun) {
    case 'conversations':
      return plural(hidden, { one: '# more conversation', other: '# more conversations' });
    case 'workspaces':
      return plural(hidden, { one: '# more workspace', other: '# more workspaces' });
    case 'artifacts':
      return plural(hidden, { one: '# more artifact', other: '# more artifacts' });
    case 'messages':
      return plural(hidden, { one: '# more message', other: '# more messages' });
    case 'files':
      return plural(hidden, { one: '# more file', other: '# more files' });
    case 'agents':
      return plural(hidden, { one: '# more agent', other: '# more agents' });
    case 'places':
      return plural(hidden, { one: '# more place', other: '# more places' });
    case 'actions':
      return plural(hidden, { one: '# more action', other: '# more actions' });
    case 'settings':
      return plural(hidden, { one: '# more setting', other: '# more settings' });
    default:
      return t`${hidden} more ${noun}`;
  }
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
      <MoreIcon aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{moreLabel(hidden, noun)}</span>
      <ChevronRightIcon aria-hidden="true" />
    </CommandItem>
  );
}

// Theme names in theme/contract.ts are untranslated (the pre-paint boot script bundles them);
// these match the names Settings › Appearance shows.
const THEME_LABELS: Partial<Record<ThemeId, string>> = {
  light: t`Light`,
  dark: t`Dark`,
  'classic-light': t`Cool`,
  'classic-dark': t`Neutral`,
  debug: t`Debug`,
};

const COMMAND_GROUPS: readonly {
  group: GlobalSearchCommand['group'];
  heading: string;
  scope: CommandMenuScope;
  noun: string;
}[] = [
  { group: 'Navigation', heading: t`Go to`, scope: 'actions', noun: 'places' },
  { group: 'Actions', heading: t`Actions`, scope: 'actions', noun: 'actions' },
  { group: 'Settings', heading: t`Settings`, scope: 'settings', noun: 'settings' },
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
  const localePreference = currentLocalePreference();
  const { commands, switching } = matches;
  const settingValue = useSettingValues(
    searching && commands.Settings.some((item) => item.setting?.value === 'default-model'),
  );
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
              else if ('event' in item.action) {
                const name = item.action.event;
                onFinish();
                // After the palette closes, so focus lands where the action leads.
                window.setTimeout(() => window.dispatchEvent(new Event(name)));
              } else if ('locale' in item.action) {
                // As in Settings › Language: store the choice and reload this page in it.
                if (item.action.locale === currentLocalePreference()) onFinish();
                else changeLocalePreference(item.action.locale);
              } else {
                setTheme(item.action.theme);
                onFinish();
              }
            }}
            value={item.id}
          >
            <item.icon aria-hidden="true" />
            <span className="min-w-0 flex-[0_1_auto] truncate" lang={item.lang}>
              <SearchHighlight query={query} text={item.label} />
            </span>
            {item.trail ? <ResultDetail>{item.trail}</ResultDetail> : null}
            <ResultTrail>
              {('theme' in item.action && theme === item.action.theme) ||
              ('locale' in item.action && localePreference === item.action.locale) ? (
                t`Current`
              ) : item.shortcut ? (
                <ShortcutKeys capSize="sm" id={item.shortcut} variant="caps" />
              ) : item.setting?.value ? (
                <span className="max-w-[14rem] truncate">{settingValue(item.setting.value)}</span>
              ) : null}
            </ResultTrail>
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
      {more && agents.rows.length ? (
        <CommandGroup
          heading={
            <ResultsHeading
              count={searching ? matches.agents.length : undefined}
              label={t`Agents`}
            />
          }
        >
          {agents.rows.map((item) => (
            <CommandItem
              key={item.ref}
              onSelect={() => onRoute(`/settings/agents#${agentSearchTarget(item.ref)}`)}
              value={`agent:${item.ref}`}
            >
              <BotIcon aria-hidden="true" />
              <span className="min-w-0 flex-[0_1_auto] truncate">
                <SearchHighlight query={query} text={item.name || item.id} />
              </span>
              {item.description ? (
                <ResultDetail title={item.description}>{item.description}</ResultDetail>
              ) : null}
              <ResultTrail>{item.kind === 'user' ? t`Your agent` : t`Agent`}</ResultTrail>
            </CommandItem>
          ))}
          <MoreResultsItem hidden={agents.hidden} noun="agents" onMore={onMore} scope="more" />
        </CommandGroup>
      ) : null}
      {more && matches.agentsError ? (
        <p
          className="truncate px-3 py-2 text-xs text-destructive"
          role="alert"
          title={matches.agentsError.message}
        >
          {t`Agents could not be searched. Try again, or open Settings › Agents.`}
        </p>
      ) : null}
      {after}
      {more ? commandGroup('Infrastructure', t`Infrastructure`, 'more', 'places') : null}
      {more && connections.rows.length ? (
        <CommandGroup
          heading={
            <ResultsHeading
              count={searching ? matches.connections.length : undefined}
              label={t`Connections`}
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
              <span className="min-w-0 flex-[0_1_auto] truncate" title={item.endpoint}>
                <SearchHighlight query={query} text={item.label || connectionName(item.endpoint)} />
              </span>
              {item.location ? <ResultDetail>{item.location}</ResultDetail> : null}
              <ResultTrail>
                {item.endpoint === settings.endpoint
                  ? t`Current`
                  : agentAvailabilityLabel(item.availability, false)}
              </ResultTrail>
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
          {t`Connection could not be opened. ${ph({ message: switching.error.message })}`}
        </p>
      ) : null}
      {more && targets.rows.length ? (
        <CommandGroup
          heading={
            <ResultsHeading
              count={searching ? matches.targets.length : undefined}
              label={t`Hosts`}
            />
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
              <span className="min-w-0 flex-[0_1_auto] truncate">
                <SearchHighlight query={query} text={item.label || item.id} />
              </span>
              <ResultTrail>{t`Infrastructure`}</ResultTrail>
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
          {t`Hosts could not be searched. Try again, or open Infrastructure.`}
        </p>
      ) : null}
    </>
  );
}

/**
 * The current values setting results show. The model is read only while a
 * matching row is listed, from the same cache Settings ? Models uses.
 */
function useSettingValues(readModel: boolean): (value: SettingsSearchValue) => string | undefined {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const { theme } = useTheme();
  const { conversationWidth, interfaceSize, motion } = useAppearancePreferences();
  const configuration = useQuery({
    enabled: readModel,
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  return (value) => {
    switch (value) {
      case 'theme':
        return theme === 'system'
          ? t`System`
          : (THEME_LABELS[theme as ThemeId] ??
              THEMES.find((item) => item.id === theme)?.label ??
              theme);
      case 'interface-size':
        return `${interfaceSize}%`;
      case 'conversation-width':
        return conversationWidth === 'wide' ? t`Wide` : t`Focused`;
      case 'motion':
        return motion === 'reduced' ? t`Reduce motion` : t`Follow system`;
      case 'default-model': {
        const data = configuration.data;
        if (!data?.model) return undefined;
        // "Claude Code / sonnet 5.5", as the Models select and the picker trigger name it.
        const provider = providerDisplayName(undefined, data.provider_id ?? data.provider);
        return `${provider} / ${compactModelName(data.resolved_model_id ?? data.model, data.model)}`;
      }
    }
  };
}

/** A connection without a label is named by its host; the full address stays in the tooltip. */
function connectionName(endpoint: string): string {
  try {
    return new URL(endpoint).host || endpoint;
  } catch {
    return endpoint;
  }
}
