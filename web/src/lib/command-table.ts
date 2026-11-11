import type { CommandDefinition } from '@clio/core/v3';

export interface CommandGroup {
  heading: string;
  rows: CommandDefinition[];
}

/** The `/` menu's groups, in order: Commands, Skills, then one per MCP server's prompts. */
export function commandGroups(commands: readonly CommandDefinition[]): CommandGroup[] {
  const servers = new Map<string, CommandDefinition[]>();
  const runnable: CommandDefinition[] = [];
  const skills: CommandDefinition[] = [];
  for (const command of commands) {
    if (command.kind === 'skill') skills.push(command);
    else if (command.kind === 'mcp_prompt') {
      const rows = servers.get(command.label) ?? [];
      rows.push(command);
      servers.set(command.label, rows);
    } else runnable.push(command);
  }
  return [
    { heading: 'Commands', rows: runnable },
    { heading: 'Skills', rows: skills },
    ...[...servers]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([server, rows]) => ({
        heading: `${server} prompts`,
        rows,
      })),
  ].filter((group) => group.rows.length > 0);
}

/** Whether a typed `/word` matches a row by any name it answers to. */
export function commandMatches(command: CommandDefinition, query: string): boolean {
  const needle = query.toLocaleLowerCase();
  return [
    command.id,
    command.name,
    command.qualified_id,
    command.title,
    command.label,
    ...command.aliases,
  ].some((value) => value.toLocaleLowerCase().includes(needle));
}

/**
 * The row a typed command name runs. An ambiguous bare name runs nothing: its
 * qualified names are returned instead, so the person can pick one.
 */
export function commandForName(
  commands: readonly CommandDefinition[],
  typed: string,
): { command?: CommandDefinition; qualified?: string[] } {
  const live = commands.filter(
    (command) =>
      command.disabled_reason !== 'command_shadowed' &&
      command.disabled_reason !== 'command_name_reserved',
  );
  const exact = live.find(
    (command) =>
      command.id === typed || command.qualified_id === typed || command.aliases.includes(typed),
  );
  if (exact) return { command: exact };
  const sameName = live.filter((command) => command.name === typed);
  if (sameName.length > 1) return { qualified: sameName.map((command) => command.qualified_id) };
  return { command: sameName[0] };
}

/** Where a row comes from, as a short label: its plugin, subfolder, source or server. */
export function commandSource(command: CommandDefinition): string {
  if (command.kind === 'mcp_prompt') return command.label;
  const where =
    command.plugin && command.plugin !== 'core'
      ? command.plugin
      : command.source.startsWith('claude_') || command.source.startsWith('clio_')
        ? command.source.endsWith('workspace')
          ? 'workspace'
          : 'you'
        : '';
  return [where, command.label].filter(Boolean).join(' / ');
}
