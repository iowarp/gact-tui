import type { PluginEntry, ToolSetting, ToolSettings } from '@clio/core/v3';
import { useQueries } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useSavedMcpServices } from '@/hooks/use-saved-mcp-services';
import { scrollParent, useSeenInView } from '@/hooks/use-seen-in-view';
import { useAgentPluginsSupported, usePluginCatalog } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ListDetailLayout } from './primitives/detail-pane';
import { StateView } from './primitives/state-view';
import { ToolDetailPane } from './settings-tool-detail';
import { useToolSettingsEditor } from './settings-tools-editor';
import {
  DefaultLegend,
  OutcomeModeField,
  ToolFilterField,
  ToolTableFooter,
} from './settings-tools-picker';
import { ToolSettingsTable, type ToolTableSection } from './settings-tools-table';
import { plural, t, ph } from '@lingui/core/macro';

function toolCount(count: number): string {
  return plural(count, { one: '# tool', other: '# tools' });
}

/** "github server", "github, slurm servers". */
function serverNames(servers: readonly string[]): string {
  const names = servers.join(', ');
  return plural(servers.length, { one: `${names} server`, other: `${names} servers` });
}

/** How long the tools read for this page stay cached once nothing shows them. */
const SECTION_CACHE_MS = 30_000;

/** "github server", "Skill scripts": where a plugin's tools come from. */
function originText(settings: ToolSettings): string[] {
  const servers = [
    ...new Set(settings.tools.filter((tool) => tool.server).map((tool) => tool.server)),
  ];
  const parts: string[] = [];
  if (servers.length) parts.push(serverNames(servers));
  if (settings.tools.some((tool) => tool.kind === 'script')) parts.push(t`Skill scripts`);
  return parts;
}

function matches(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term);
}

/** One group of the table: an installed plugin, or one of the person's own MCP servers. */
interface ToolSource {
  id: string;
  title: string;
  hint: string;
  /** What is known before its settings are read. */
  catalog: string;
  count: number;
  read: (signal: AbortSignal) => Promise<ToolSettings>;
  /** A person's or workspace's server; an agent that can't read it leaves it out. */
  own?: boolean;
}

function pluginSection(
  source: ToolSource,
  settings: ToolSettings,
  term: string,
): ToolTableSection | undefined {
  const pluginHit = !term || matches(source.title, term);
  const tools = pluginHit
    ? settings.tools
    : settings.tools.filter(
        (tool) =>
          matches(tool.name, term) || matches(tool.description, term) || matches(tool.server, term),
      );
  if (tools.length) {
    return {
      id: source.id,
      title: source.title,
      hint: source.hint,
      bulkLabel: t`All ${ph({ title: source.title })} tools`,
      bulkPhrase: t`all ${ph({ title: source.title })} tools`,
      meta: [
        ...originText(settings),
        tools.length < settings.tools.length
          ? plural(settings.tools.length, {
              one: `${ph({ shown: tools.length })} of # tool`,
              other: `${ph({ shown: tools.length })} of # tools`,
            })
          : toolCount(settings.tools.length),
      ],
      tools,
    };
  }
  if (settings.servers_not_loaded.length && pluginHit) {
    return {
      id: source.id,
      title: source.title,
      hint: source.hint,
      bulkLabel: t`All ${ph({ title: source.title })} tools`,
      bulkPhrase: t`all ${ph({ title: source.title })} tools`,
      tools: [],
      notice: {
        text: t`Tools appear once a conversation connects its server`,
        title: t`Tools of ${ph({ servers: settings.servers_not_loaded.join(', ') })} appear once a conversation connects the server.`,
        status: t`Not loaded yet`,
        tone: 'idle',
      },
    };
  }
  return undefined;
}

/** What the catalog already says about a plugin's tools, before its settings are read. */
function catalogMeta(plugin: PluginEntry): string {
  const parts: string[] = [];
  if (plugin.mcp_servers.length) parts.push(serverNames(plugin.mcp_servers));
  if (plugin.tools.length) parts.push(toolCount(plugin.tools.length));
  return parts.join(', ');
}

/**
 * Settings › Tools and MCP servers › Tools: every installed plugin's tools in one table.
 * The catalog lays the table out at once; a plugin's tool settings are read when its
 * group comes into view, or for every plugin while a filter searches tool names.
 */
export function ToolPermissionsSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const supported = useAgentPluginsSupported();
  const catalog = usePluginCatalog();
  const saved = useSavedMcpServices();
  // A plugin with neither tools nor MCP servers has nothing to list here.
  const plugins = (catalog.data?.plugins ?? []).filter(
    (plugin) => plugin.tools.length || plugin.mcp_servers.length,
  );
  const sources: ToolSource[] = [
    ...plugins.map(
      (plugin): ToolSource => ({
        id: plugin.ref,
        title: plugin.id,
        hint: plugin.description || plugin.ref,
        catalog: catalogMeta(plugin),
        count: plugin.tools.length,
        read: (signal) => repository.toolSettings(plugin.ref, signal),
      }),
    ),
    ...(saved.data ?? []).map(
      (service): ToolSource => ({
        id: `server:${service.name}`,
        title: service.name,
        hint: t`Your MCP server`,
        catalog: t`${ph({ name: service.name })} server`,
        count: 0,
        read: (signal) => repository.serverToolSettings(service.name, signal),
        own: true,
      }),
    ),
  ];
  const editor = useToolSettingsEditor();
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState('');
  // The field answers each key at once; the table, its reads and the layout key follow.
  const term = useDeferredValue(filter).trim().toLocaleLowerCase();
  const container = useRef<HTMLDivElement>(null);
  // Groups (`data-tool-group`) are replaced when the sources or the filter change.
  const seen = useSeenInView(
    container,
    'data-tool-group',
    `${sources.map((source) => source.id).join('\n')}\n${term}`,
  );
  const results = useQueries({
    queries: sources.map((source) => ({
      queryKey: ['tool-settings', scope, source.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => source.read(signal),
      enabled: Boolean(term) || seen.has(source.id),
      // Every plugin's tool list is the heaviest cache in Settings; leaving Tools lets it go.
      gcTime: SECTION_CACHE_MS,
      // An agent without per-server settings answers 404 or 422 at once.
      retry: source.own ? false : undefined,
    })),
  });
  const loaded = results.flatMap((result) => (result.data ? [result.data] : []));
  const modes = loaded[0]?.approval_modes ?? ['ask'];
  const shown = mode && modes.includes(mode) ? mode : (modes[0] ?? 'ask');
  const sections = sources.flatMap((source, index): ToolTableSection[] => {
    const result = results[index];
    if (result && !result.data && !result.error) {
      // Not read yet: while filtering, only a group whose name matches holds its place.
      if (term && !matches(source.title, term)) return [];
      return [
        {
          id: source.id,
          title: source.title,
          hint: source.hint,
          bulkLabel: t`All ${ph({ title: source.title })} tools`,
          bulkPhrase: t`all ${ph({ title: source.title })} tools`,
          tools: [],
          notice: { text: source.catalog, status: 'Loading', tone: 'running' },
          reserveRows: source.count,
        },
      ];
    }
    if (result?.error) {
      if (source.own || (term && !matches(source.title, term))) return [];
      return [
        {
          id: source.id,
          title: source.title,
          bulkLabel: t`All ${ph({ title: source.title })} tools`,
          bulkPhrase: t`all ${ph({ title: source.title })} tools`,
          tools: [],
          notice: {
            text: t`Tool settings couldn’t be loaded.`,
            title: result.error.message,
            status: t`Not loaded`,
            tone: 'error',
            retry: () => void result.refetch(),
          },
        },
      ];
    }
    if (!result?.data) return [];
    const section = pluginSection(source, result.data, term);
    return section ? [section] : [];
  });
  const anyTools = sources.some((_, index) => {
    const data = results[index]?.data;
    return Boolean(data && (data.tools.length || data.servers_not_loaded.length));
  });

  // A tool's details beside the table. Under 40rem the pane replaces the table, which
  // loses its scroll; closing returns to the same row.
  const [open, setOpen] = useState<string>();
  const back = useRef<{ name: string; scroll: number } | null>(null);
  const onOpenTool = useCallback((tool: ToolSetting) => {
    const scroller = container.current ? scrollParent(container.current) : null;
    back.current = { name: tool.name, scroll: scroller?.scrollTop ?? 0 };
    setOpen(tool.name);
  }, []);
  const onCloseTool = useCallback(() => {
    const returning = back.current;
    back.current = null;
    setOpen(undefined);
    if (!returning) return;
    // Under 40rem the table remounts and its window fills in a few frames later.
    let frames = 20;
    let scrolled = false;
    const focusRow = () => {
      const element = container.current;
      if (element && !scrolled) {
        scrolled = true;
        const scroller = scrollParent(element);
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        if (scroller && element.clientWidth < 40 * rem) scroller.scrollTop = returning.scroll;
      }
      const name = element?.querySelector<HTMLElement>(
        `[data-tool="${CSS.escape(returning.name)}"] [data-tool-open]`,
      );
      if (name) name.focus({ preventScroll: true });
      else if (--frames > 0) requestAnimationFrame(focusRow);
    };
    requestAnimationFrame(focusRow);
  }, []);
  let detail: { tool: ToolSetting; origin?: string } | undefined;
  if (open) {
    for (const [index, source] of sources.entries()) {
      const tool = results[index]?.data?.tools.find((item) => item.name === open);
      if (!tool) continue;
      detail = {
        tool,
        origin: source.own
          ? t`${ph({ title: source.title })} server`
          : tool.server
            ? t`${ph({ server: tool.server })} server, from ${ph({ title: source.title })}`
            : source.title,
      };
      break;
    }
  }
  let body;
  // Filtering and outcome modes only mean something once there are tools.
  let toolbar = false;
  if (supported === false) {
    body = (
      <StateView
        kind="unavailable"
        size="row"
        title={t`This service doesn’t offer plugin tools.`}
      />
    );
  } else if (catalog.error) {
    body = (
      <div title={catalog.error.message}>
        <StateView
          action={{ label: t`Retry`, onClick: () => void catalog.refetch() }}
          kind="error"
          size="row"
          title={t`Plugin tools couldn’t be loaded.`}
        />
      </div>
    );
  } else if (catalog.isPending) {
    body = <StateView kind="loading" size="row" title={t`Loading plugin tools…`} />;
  } else if (term && !sections.length && results.some((result) => result.isPending)) {
    toolbar = true;
    body = <StateView kind="loading" size="row" title={t`Searching plugin tools…`} />;
  } else if (!anyTools && !sections.length) {
    body = (
      <StateView
        kind="empty"
        size="row"
        title={t`No plugin tools yet. Extensions that bring tools list them here.`}
      />
    );
  } else if (!sections.length) {
    toolbar = true;
    body = (
      <StateView
        action={{ label: t`Clear filter`, onClick: () => setFilter('') }}
        kind="empty"
        size="row"
        title={t`No tools match “${ph({ filter: filter.trim() })}”.`}
      />
    );
  } else {
    toolbar = true;
    body = (
      <>
        <ToolSettingsTable
          editor={editor}
          label={t`Plugin tools`}
          mode={shown}
          onOpenTool={onOpenTool}
          openTool={detail?.tool.name}
          sections={sections}
        />
        <ToolTableFooter />
      </>
    );
  }
  const list = (
    <div className="@container/page grid min-w-0 gap-3">
      {toolbar ? (
        <div className="flex min-w-0 items-center gap-x-4 gap-y-2 @max-[36rem]/page:flex-wrap">
          <ToolFilterField
            className="w-[min(22.5rem,45%)] shrink @max-[36rem]/page:w-full"
            onChange={setFilter}
            value={filter}
          />
          <span className="flex-1 @max-[36rem]/page:hidden" />
          <span className="hidden @min-[36rem]/page:inline-flex">
            <DefaultLegend />
          </span>
          <OutcomeModeField modes={modes} onChange={setMode} value={shown} />
        </div>
      ) : null}
      {body}
    </div>
  );
  return (
    <div className="min-w-0" data-slot="tool-permissions" ref={container}>
      <ListDetailLayout
        detail={
          detail ? (
            <ToolDetailPane
              busy={editor.busy.has(detail.tool.name)}
              editor={editor}
              mode={shown}
              onClose={onCloseTool}
              origin={detail.origin}
              status={editor.status[detail.tool.name]}
              tool={detail.tool}
            />
          ) : undefined
        }
        list={list}
      />
    </div>
  );
}
