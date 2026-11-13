import type { PendingInteraction } from '@clio/core/v3';
import { t } from '@lingui/core/macro';

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
