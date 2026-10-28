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
};

/** Name a known operation without changing an unknown tool's supplied title. */
export function permissionOperationLabel(
  name: string,
  input: Record<string, unknown> = {},
): string | undefined {
  if (name === 'web_fetch' && input.to_file === true) return 'Save web source';
  return OPERATIONS[name];
}
