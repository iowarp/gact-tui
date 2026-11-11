import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { groupModeText } from './plugin-tool-settings-text';
import { StateView } from './primitives/state-view';
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
  const editor = useToolSettingsEditor();
  const [mode, setMode] = useState('');
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
  const data = view.data;
  const shown = mode && data.approval_modes.includes(mode) ? mode : data.approval_modes[0] || 'ask';
  const sections: ToolTableSection[] = GROUPS.map((group) => {
    const tools = data.tools.filter((tool) => tool.group === group.id);
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
  const unknownFlags = data.tools.some((tool) => !tool.flags_known);
  return (
    <div className="grid min-w-0 gap-2" data-slot="plugin-tool-settings">
      <OutcomeModeField modes={data.approval_modes} onChange={setMode} value={shown} />
      {unknownFlags ? (
        <p
          className="truncate text-xs text-faint"
          title="A tool's read-only flag and its own I/O default are known once a conversation has used this plugin. Until then it is listed as a write tool."
        >
          Some tools are listed as write tools until a conversation loads them.
        </p>
      ) : null}
      {sections.length ? (
        <>
          <ToolSettingsTable
            editor={editor}
            label={`Tools of ${data.plugin}`}
            mode={shown}
            sections={sections}
          />
          <ToolTableFooter />
        </>
      ) : (
        <StateView kind="empty" size="row" title="This plugin has no tools" />
      )}
    </div>
  );
}
