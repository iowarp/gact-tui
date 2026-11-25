import type { PendingInteraction } from '@clio/core/v3';
import { ph, t } from '@lingui/core/macro';
import { TOOL_OPERATIONS } from './tool-operation-contract';
import { readsAsDescription } from './tool-presentation';

const OPERATIONS: Record<string, string> = {
  fs_read_file: t`Read file`,
  fs_write_file: t`Write file`,
  fs_edit_file: t`Edit file`,
  fs_git_commit: t`Commit changes to git`,
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
 * The decision card and the bell share this, so both read the same in every locale. A
 * forwarded ask can arrive without its tool call, so the title's own tool id decides; a
 * legacy title is never shown raw.
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
  const named = legacyToolCallName(interaction.title);
  if (named !== undefined)
    return permissionOperationTitle(named, named === toolName ? fields : {}) ?? named;
  // A tool's description ("List, read, write, delete and stage files on a site") is not
  // what this call does: the operation is named from the tool and its arguments instead.
  const title = interaction.title?.trim() ?? '';
  if (!toolName || (title && !readsAsDescription(title))) return interaction.title;
  return (
    permissionOperationTitle(toolName, fields) ??
    operationFromArguments(toolName, fields) ??
    toolName
  );
}

const OPERATION_ARGUMENT = ['op', 'operation', 'action'] as const;
const VERB_SEGMENT = /^(?:read|write|list|get|set|run|call|manage|ops?)$/u;

/**
 * An operation an MCP tool takes as an argument, in words: relay_files with op=upload is
 * "Upload files". The words are the tool's own ids, as a tool name is.
 */
function operationFromArguments(
  toolName: string,
  fields: Record<string, unknown>,
): string | undefined {
  const key = OPERATION_ARGUMENT.find(
    (name) =>
      typeof fields[name] === 'string' && /^[\p{L}][\p{L}\d_-]*$/u.test(String(fields[name])),
  );
  if (!key) return undefined;
  const verb = String(fields[key]).replace(/[_-]+/gu, ' ').trim();
  // The first segment of a namespaced tool is its server (relay_files); trailing verbs
  // (relay_files_read) say less than the operation does.
  const segments = toolName.split(/[_.-]+/u).filter(Boolean);
  const rest = segments.length > 1 ? segments.slice(1) : segments;
  while (rest.length > 1 && VERB_SEGMENT.test(rest[rest.length - 1]!.toLowerCase())) rest.pop();
  const object = rest.join(' ');
  const phrase = object && object.toLowerCase() !== verb.toLowerCase() ? `${verb} ${object}` : verb;
  return phrase.charAt(0).toLocaleUpperCase() + phrase.slice(1);
}

// "destructive tool call: fs_write_file", "shell command call: shell_bash", "external MCP tool call: …".
const LEGACY_TITLE = /^(?:[\p{L} ]+ )?(?:tool|command) call: (\S+)$/u;

/** The tool a legacy agent title ("destructive tool call: fs_write_file") names, if it is one. */
export function legacyToolCallName(title: string | undefined): string | undefined {
  return title ? LEGACY_TITLE.exec(title.trim())?.[1] : undefined;
}

/** A known operation in words; a connect request names its source when the input carries one. */
export function permissionOperationTitle(
  toolName: string,
  fields: Record<string, unknown> = {},
): string | undefined {
  if (toolName === 'connected_data_connect')
    return typeof fields.label === 'string' && fields.label.trim()
      ? t`Connect ${ph({ source: String(fields.label) })}`
      : t`Connect source`;
  if (toolName === 'connected_data_download') return t`Download source`;
  return permissionOperationLabel(toolName, fields) ?? TOOL_OPERATIONS[toolName]?.action;
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
