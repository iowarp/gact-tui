import type { PendingInteraction } from '@clio/core/v3';
import { ph, t } from '@lingui/core/macro';

const OPERATIONS: Record<string, string> = {
  fs_read_file: t`Read file`,
  fs_write_file: t`Write file`,
  fs_edit_file: t`Edit file`,
  shell_bash: t`Run command`,
  'workspace.read': t`Read file`,
  'workspace.write': t`Write file`,
  'workspace.move': t`Move file`,
  connected_data_connect: t`Connect source`,
  connected_data_download: t`Download source`,
  connected_data_ndp_endpoint_connect: t`Connect NDP endpoint`,
  web_fetch: t`Read web source`,
  web_search: t`Search the web`,
  browser_host: t`Open a website in the shared browser`,
  browser_evaluate: t`Run a script in a web page`,
};

/** Name a known operation without changing an unknown tool's supplied title. */
export function permissionOperationLabel(
  name: string,
  input: Record<string, unknown> = {},
): string | undefined {
  if (name === 'web_fetch' && input.to_file === true) return t`Save web source`;
  return OPERATIONS[name];
}

/**
 * A permission's title in the person's words. The agent's legacy titles ("destructive tool
 * call: fs_write_file") name the known operation instead; any other title is the agent's own.
 * The decision card and the bell share this, so both read the same in every locale.
 */
export function permissionTitle(
  interaction: PendingInteraction,
  toolName: string | undefined = interaction.payload?.tool_call?.tool_name ??
    interaction.source.tool_name,
): string {
  const input = interaction.payload?.tool_call?.input;
  const fields =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const legacy =
    interaction.title === `destructive tool call: ${toolName}` ||
    interaction.title === `tool call: ${toolName}` ||
    interaction.title === `external MCP tool call: ${toolName}`;
  if (!legacy) return interaction.title;
  if (toolName === 'connected_data_connect')
    return typeof fields.label === 'string' && fields.label.trim()
      ? t`Connect ${ph({ source: String(fields.label) })}`
      : t`Connect source`;
  if (toolName === 'connected_data_download') return t`Download source`;
  return permissionOperationLabel(toolName ?? '', fields) ?? interaction.title;
}

/** The command a permission would run and the computer it runs on, when the request names them. */
export function permissionCommand(interaction: PendingInteraction): {
  command: string;
  computer: string;
} {
  const access = interaction.payload?.access;
  const input = interaction.payload?.tool_call?.input;
  const command =
    access?.command ||
    (input &&
    typeof input === 'object' &&
    typeof (input as { command?: unknown }).command === 'string'
      ? (input as { command: string }).command
      : '');
  const computer = access?.computer || interaction.payload?.execution?.computer || '';
  return { command, computer };
}
