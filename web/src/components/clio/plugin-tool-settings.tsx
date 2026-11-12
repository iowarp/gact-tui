import type { ToolSetting, ToolSettings } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { scrollParent } from '@/hooks/use-seen-in-view';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { groupModeText } from './plugin-tool-settings-text';
import { StateView } from './primitives/state-view';
import { NestedToolDetail } from './settings-tool-detail';
import { useToolSettingsEditor } from './settings-tools-editor';
import { OutcomeModeField, ToolTableFooter } from './settings-tools-picker';
import { ToolSettingsTable, type ToolTableSection } from './settings-tools-table';

const GROUPS = [
  { id: 'read', title: 'Read-only tools' },
  { id: 'write', title: 'Write and delete tools' },
] as const;

/** A plugin's tools: permission and I/O per tool, grouped by read-only flags. */
export function PluginToolSettings({ reference }: { reference: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const view = useQuery({
    queryKey: ['tool-settings', connectionScope(settings), reference],
    queryFn: ({ signal }) => repository.toolSettings(reference, signal),
  });
  if (view.isPending) return <StateView kind="loading" size="row" title="Loading tool settings…" />;
  if (view.error) {
    return (
      <div title={view.error.message}>
        <StateView
          action={{ label: 'Retry', onClick: () => void view.refetch() }}
          kind="error"
          size="row"
          title="Tool settings couldn’t be loaded."
        />
      </div>
    );
  }
  return (
    <ToolSettingsBody
      backLabel="All tools"
      data={view.data}
      emptyTitle="This plugin has no tools"
      label={`Tools of ${view.data.plugin}`}
      origin={(tool) =>
        tool.server ? `${tool.server} server, from ${view.data.plugin}` : view.data.plugin
      }
    />
  );
}

/**
 * One source's tools (a plugin, or one MCP server's share of it): the outcome mode,
 * the grouped table of tool rows and, when a tool's name is chosen, its details in
 * place of the table with a way back to the same row.
 */
export function ToolSettingsBody({
  data,
  label,
  emptyTitle,
  backLabel,
  origin,
}: {
  data: ToolSettings;
  /** The table's accessible name ("Tools of web"). */
  label: string;
  emptyTitle: string;
  /** The back control's text in a tool's details ("All tools"). */
  backLabel: string;
  /** Where a tool comes from, for its details. */
  origin?: (tool: ToolSetting) => string | undefined;
}) {
  const editor = useToolSettingsEditor();
  const [mode, setMode] = useState('');
  const [open, setOpen] = useState<string>();
  const root = useRef<HTMLDivElement>(null);
  const back = useRef<{ name: string; scroll: number } | null>(null);
  const onOpenTool = useCallback((tool: ToolSetting) => {
    const scroller = root.current ? scrollParent(root.current) : null;
    back.current = { name: tool.name, scroll: scroller?.scrollTop ?? 0 };
    setOpen(tool.name);
  }, []);
  const tool = open ? data.tools.find((item) => item.name === open) : undefined;
  const showing = Boolean(tool);
  // A tool's details start at the top; going back returns to the same row and scroll.
  useLayoutEffect(() => {
    const returning = back.current;
    if (!returning) return;
    const scroller = root.current ? scrollParent(root.current) : null;
    if (showing) {
      if (scroller) scroller.scrollTop = 0;
      return;
    }
    back.current = null;
    if (scroller) scroller.scrollTop = returning.scroll;
    root.current
      ?.querySelector<HTMLElement>(`[data-tool="${CSS.escape(returning.name)}"] [data-tool-open]`)
      ?.focus({ preventScroll: true });
  }, [showing]);
  const shown = mode && data.approval_modes.includes(mode) ? mode : data.approval_modes[0] || 'ask';
  if (tool) {
    return (
      <div className="min-w-0" ref={root}>
        <NestedToolDetail
          backLabel={backLabel}
          busy={editor.busy.has(tool.name)}
          editor={editor}
          mode={shown}
          onBack={() => setOpen(undefined)}
          origin={origin?.(tool)}
          status={editor.status[tool.name]}
          tool={tool}
        />
      </div>
    );
  }
  const sections: ToolTableSection[] = GROUPS.map((group) => {
    const tools = data.tools.filter((item) => item.group === group.id);
    return {
      id: group.id,
      title: group.title,
      count: tools.length,
      hint: groupModeText(group.id, shown, data.covering_modes),
      bulkLabel: `All ${group.title.toLowerCase()}`,
      tools,
    };
  }).filter((group) => group.tools.length);
  if (data.servers_not_loaded.length) {
    sections.push({
      id: 'not-loaded',
      title: data.servers_not_loaded.join(', '),
      bulkLabel: '',
      tools: [],
      notice: {
        text: 'Tools appear once a conversation connects its server',
        title: `Tools of ${data.servers_not_loaded.join(', ')} appear here once a conversation has connected the server.`,
        status: 'Not loaded yet',
        tone: 'idle',
      },
    });
  }
  const unknownFlags = data.tools.some((item) => !item.flags_known);
  return (
    <div className="grid min-w-0 gap-2" data-slot="plugin-tool-settings" ref={root}>
      <OutcomeModeField modes={data.approval_modes} onChange={setMode} value={shown} />
      {unknownFlags ? (
        <p
          className="truncate text-xs text-faint"
          title="A tool's read-only flag and its own I/O default are known once a conversation has used it. Until then it is listed as a write tool."
        >
          Some tools are listed as write tools until a conversation loads them.
        </p>
      ) : null}
      {sections.length ? (
        <>
          <ToolSettingsTable
            editor={editor}
            label={label}
            mode={shown}
            onOpenTool={onOpenTool}
            sections={sections}
          />
          <ToolTableFooter />
        </>
      ) : (
        <StateView kind="empty" size="row" title={emptyTitle} />
      )}
    </div>
  );
}
