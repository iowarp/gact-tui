import type { PluginEntry, ToolSettings } from '@clio/core/v3';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported, usePluginCatalog } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { StateView } from './primitives/state-view';
import { useToolSettingsEditor } from './settings-tools-editor';
import {
  DefaultLegend,
  OutcomeModeField,
  ToolFilterField,
  ToolTableFooter,
} from './settings-tools-picker';
import { ToolSettingsTable, type ToolTableSection } from './settings-tools-table';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "github server", "Skill scripts": where a plugin's tools come from. */
function originText(settings: ToolSettings): string[] {
  const servers = [
    ...new Set(settings.tools.filter((tool) => tool.server).map((tool) => tool.server)),
  ];
  const parts: string[] = [];
  if (servers.length)
    parts.push(`${servers.join(', ')} ${servers.length === 1 ? 'server' : 'servers'}`);
  if (settings.tools.some((tool) => tool.kind === 'script')) parts.push('Skill scripts');
  return parts;
}

function matches(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term);
}

function pluginSection(
  plugin: PluginEntry,
  settings: ToolSettings,
  term: string,
): ToolTableSection | undefined {
  const pluginHit = !term || matches(plugin.id, term);
  const tools = pluginHit
    ? settings.tools
    : settings.tools.filter(
        (tool) =>
          matches(tool.name, term) || matches(tool.description, term) || matches(tool.server, term),
      );
  if (tools.length) {
    return {
      id: plugin.ref,
      title: plugin.id,
      hint: plugin.description || plugin.ref,
      bulkLabel: `All ${plugin.id} tools`,
      meta: [...originText(settings), plural(settings.tools.length, 'tool')],
      tools,
    };
  }
  if (settings.servers_not_loaded.length && pluginHit) {
    return {
      id: plugin.ref,
      title: plugin.id,
      hint: plugin.description || plugin.ref,
      bulkLabel: `All ${plugin.id} tools`,
      tools: [],
      notice: {
        text: 'Tools appear once a conversation connects its server',
        title: `Tools of ${settings.servers_not_loaded.join(', ')} appear once a conversation connects the server.`,
        status: 'Not loaded yet',
        tone: 'idle',
      },
    };
  }
  return undefined;
}

/** Settings ??? Tools and MCP servers ??? Tools: every installed plugin's tools in one table. */
export function ToolPermissionsSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const supported = useAgentPluginsSupported();
  const catalog = usePluginCatalog();
  const plugins = catalog.data?.plugins ?? [];
  const results = useQueries({
    queries: plugins.map((plugin) => ({
      queryKey: ['tool-settings', scope, plugin.ref],
      queryFn: ({ signal }: { signal: AbortSignal }) => repository.toolSettings(plugin.ref, signal),
    })),
  });
  const editor = useToolSettingsEditor();
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState('');
  const term = filter.trim().toLocaleLowerCase();
  const loaded = results.flatMap((result) => (result.data ? [result.data] : []));
  const modes = loaded[0]?.approval_modes ?? ['ask'];
  const shown = mode && modes.includes(mode) ? mode : (modes[0] ?? 'ask');
  const sections = plugins.flatMap((plugin, index): ToolTableSection[] => {
    const result = results[index];
    if (result?.error) {
      if (term && !matches(plugin.id, term)) return [];
      return [
        {
          id: plugin.ref,
          title: plugin.id,
          bulkLabel: `All ${plugin.id} tools`,
          tools: [],
          notice: {
            text: 'Tool settings couldn’t be loaded.',
            title: result.error.message,
            status: 'Not loaded',
            tone: 'error',
          },
        },
      ];
    }
    if (!result?.data) return [];
    const section = pluginSection(plugin, result.data, term);
    return section ? [section] : [];
  });
  const anyTools = plugins.some((_, index) => {
    const data = results[index]?.data;
    return Boolean(data && (data.tools.length || data.servers_not_loaded.length));
  });

  let body;
  // Filtering and outcome modes only mean something once there are tools.
  let toolbar = false;
  if (supported === false) {
    body = (
      <StateView kind="unavailable" size="row" title="This service doesn’t offer plugin tools." />
    );
  } else if (catalog.error) {
    body = (
      <div title={catalog.error.message}>
        <StateView
          action={{ label: 'Retry', onClick: () => void catalog.refetch() }}
          kind="error"
          size="row"
          title="Plugin tools couldn’t be loaded."
        />
      </div>
    );
  } else if (catalog.isPending || results.some((result) => result.isPending)) {
    body = <StateView kind="loading" size="row" title="Loading plugin tools…" />;
  } else if (!anyTools && !sections.length) {
    body = (
      <StateView
        kind="empty"
        size="row"
        title="No plugin tools yet. Extensions that bring tools list them here."
      />
    );
  } else if (!sections.length) {
    toolbar = true;
    body = (
      <StateView
        action={{ label: 'Clear filter', onClick: () => setFilter('') }}
        kind="empty"
        size="row"
        title={`No tools match “${filter.trim()}”.`}
      />
    );
  } else {
    toolbar = true;
    body = (
      <>
        <ToolSettingsTable editor={editor} label="Plugin tools" mode={shown} sections={sections} />
        <ToolTableFooter />
      </>
    );
  }
  return (
    <div className="@container/page grid min-w-0 gap-3" data-slot="tool-permissions">
      {toolbar ? (
        <div className="flex min-w-0 items-center gap-4">
          <ToolFilterField
            className="w-[min(22.5rem,45%)] shrink"
            onChange={setFilter}
            value={filter}
          />
          <span className="flex-1" />
          <span className="hidden @min-[36rem]/page:inline-flex">
            <DefaultLegend />
          </span>
          <OutcomeModeField modes={modes} onChange={setMode} value={shown} />
        </div>
      ) : null}
      {body}
    </div>
  );
}
