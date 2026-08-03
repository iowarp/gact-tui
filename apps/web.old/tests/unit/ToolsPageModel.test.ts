import type { SlashCommandDef } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  commandCopyFailureBody,
  commandCopySuccessBody,
  commandTrigger,
  filterCommands,
} from '../../src/routes/discovery/ToolsPageModel.js';

const COMMANDS: SlashCommandDef[] = [
  {
    id: 'compact',
    title: 'Compact session',
    description: 'Summarize the current conversation.',
  },
  {
    id: '/doctor',
    title: 'Doctor',
    description: 'Inspect backend health.',
  },
  {
    id: 'mcp.refresh',
    title: 'Refresh MCP servers',
  },
];

describe('ToolsPageModel', () => {
  it('filters commands by id, title, or description', () => {
    expect(filterCommands(COMMANDS, '').map((command) => command.id)).toEqual([
      'compact',
      '/doctor',
      'mcp.refresh',
    ]);
    expect(filterCommands(COMMANDS, 'session').map((command) => command.id)).toEqual(['compact']);
    expect(filterCommands(COMMANDS, 'DOCTOR').map((command) => command.id)).toEqual(['/doctor']);
    expect(filterCommands(COMMANDS, 'mcp').map((command) => command.id)).toEqual(['mcp.refresh']);
    expect(filterCommands(COMMANDS, 'missing')).toEqual([]);
  });

  it('normalizes command triggers and copy toast bodies', () => {
    expect(commandTrigger('compact')).toBe('/compact');
    expect(commandTrigger('/doctor')).toBe('/doctor');
    expect(commandCopySuccessBody('/compact')).toBe(
      'Paste /compact into the composer to run it.',
    );
    expect(commandCopyFailureBody('/compact')).toBe(
      'Type /compact into the composer to run it.',
    );
  });
});
