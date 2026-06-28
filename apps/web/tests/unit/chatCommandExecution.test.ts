import { describe, expect, it, vi } from 'vitest';
import {
  pluginFailureMessage,
  pluginInvocationMessage,
  runBackendCommand,
} from '../../src/routes/chatCommandExecution.js';
import type { SlashCommand } from '../../src/components/SlashPalette.js';
import type { PluginDef } from '../../src/plugins.js';

const plugin: PluginDef = {
  id: 'lint',
  name: 'Lint',
  path: 'lint',
  args: [],
};

const command: SlashCommand = {
  id: 'backend:custom',
  trigger: '/custom',
  description: 'Custom backend command',
};

describe('chatCommandExecution', () => {
  it('formats plugin output and caps long stdout', () => {
    const message = pluginInvocationMessage(plugin, {
      status: 0,
      stdout: 'x'.repeat(1900),
      stderr: '',
      duration_ms: 12,
      timed_out: false,
    });

    expect(message).toContain('Plugin `Lint` (exit 0, 12ms)');
    expect(message).toContain('… (truncated)');
    expect(message!.length).toBeLessThan(1900);
  });

  it('returns null for empty plugin output and formats failures', () => {
    expect(
      pluginInvocationMessage(plugin, {
        status: 0,
        stdout: ' ',
        stderr: '',
        duration_ms: 4,
        timed_out: false,
      }),
    ).toBeNull();
    expect(pluginFailureMessage(plugin, new Error('boom'))).toBe('Plugin `Lint` failed: boom');
  });

  it('falls back to submitting the trigger when no backend command runner is available', () => {
    const onSubmit = vi.fn();

    runBackendCommand(command, {
      activeId: () => 'session-1',
      onSubmit,
    });

    expect(onSubmit).toHaveBeenCalledWith('/custom');
  });

  it('runs backend commands when a session and runner are available', () => {
    const onRunCommand = vi.fn().mockResolvedValue(undefined);
    const onSubmit = vi.fn();

    runBackendCommand(command, {
      activeId: () => 'session-1',
      onRunCommand,
      onSubmit,
    });

    expect(onRunCommand).toHaveBeenCalledWith('backend:custom', {});
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
