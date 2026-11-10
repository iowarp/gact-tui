import type { PendingInteraction } from '@clio/core/v3';

const OPERATIONS: Record<string, string> = {
  fs_read_file: 'Read file',
  fs_write_file: 'Write file',
  fs_edit_file: 'Edit file',
  shell_bash: 'Run command',
  'workspace.read': 'Read file',
  'workspace.write': 'Write file',
  'workspace.move': 'Move file',
  connected_data_connect: 'Connect source',
  connected_data_download: 'Download source',
  web_fetch: 'Read web source',
  web_search: 'Search the web',
  browser_host: 'Open a website in the shared browser',
  browser_evaluate: 'Run a script in a web page',
};

/** Name a known operation without changing an unknown tool's supplied title. */
export function permissionOperationLabel(
  name: string,
  input: Record<string, unknown> = {},
): string | undefined {
  if (name === 'web_fetch' && input.to_file === true) return 'Save web source';
  return OPERATIONS[name];
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
