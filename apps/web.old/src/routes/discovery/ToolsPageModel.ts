/**
 * View-model / pure logic for Tools Page: state shaping and helpers, no DOM. Key export `filterCommands`.
 */
import type { SlashCommandDef } from '@clio/core';

export function filterCommands(commands: SlashCommandDef[], query: string): SlashCommandDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter(
    (command) =>
      command.id.toLowerCase().includes(q) ||
      command.title.toLowerCase().includes(q) ||
      (command.description ?? '').toLowerCase().includes(q),
  );
}

export function commandTrigger(commandId: string): string {
  return commandId.startsWith('/') ? commandId : `/${commandId}`;
}

export function commandCopySuccessBody(trigger: string): string {
  return `Paste ${trigger} into the composer to run it.`;
}

export function commandCopyFailureBody(trigger: string): string {
  return `Type ${trigger} into the composer to run it.`;
}
