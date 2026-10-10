import type { ToolInvocation } from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';

/** Keep entry disclosures about actions; numeric outcomes belong in the message footer. */
export function transcriptActivitySummary(iterations: readonly ConversationIteration[]): {
  label: string;
  running: boolean;
} {
  const tools = [
    ...new Map(iterations.flatMap((item) => item.tools).map((tool) => [tool.id, tool])).values(),
  ];
  const running = iterations.some((item) => item.streaming);
  const actions = [...new Set(tools.map((tool) => activityCategory(tool)))].map((category) => {
    if (category === 'search') return running ? 'running searches' : 'searched';
    if (category === 'read') return running ? 'reading files' : 'read files';
    if (category === 'edit') return running ? 'editing files' : 'edited files';
    if (category === 'command') return running ? 'running commands' : 'ran commands';
    return running ? 'using tools' : 'used tools';
  });
  const description = actions.join(', ') || 'activity';
  const label = description[0].toUpperCase() + description.slice(1);
  return {
    label: iterations.some((item) => item.interrupted) ? `${label} (Interrupted)` : label,
    running,
  };
}

function activityCategory(tool: ToolInvocation): 'search' | 'read' | 'edit' | 'command' | 'other' {
  if (['shell_bash', 'shell_run', 'exec_command'].includes(tool.name)) return 'command';
  if (['fs_read_file', 'fs_read_text_file', 'workspace_resource_read'].includes(tool.name))
    return 'read';
  if (['fs_write_file', 'fs_edit_file', 'apply_patch'].includes(tool.name)) return 'edit';
  if (['web_search', 'search', 'workspace_resource_search', 'fs_search'].includes(tool.name))
    return 'search';
  return 'other';
}
