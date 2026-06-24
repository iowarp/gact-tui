import { describe, expect, it } from 'vitest';
import {
  commandDispatchForId,
  shouldRecordCommandUse,
} from '../../src/routes/chatCommandHandlerModel.js';

describe('chatCommandHandlerModel', () => {
  it('classifies prefixed command ids into typed dispatches', () => {
    expect(commandDispatchForId('jump:session-1')).toEqual({
      kind: 'jump',
      sessionId: 'session-1',
    });
    expect(commandDispatchForId('detached:session-2')).toEqual({
      kind: 'detached',
      sessionId: 'session-2',
    });
    expect(commandDispatchForId('perm:ask')).toEqual({ kind: 'permission', mode: 'ask' });
    expect(commandDispatchForId('rail:tools')).toEqual({ kind: 'rail', route: 'tools' });
    expect(commandDispatchForId('settings:providers')).toEqual({
      kind: 'settings',
      section: 'providers',
    });
  });

  it('distinguishes local, default, plugin, and backend commands', () => {
    expect(commandDispatchForId('new-session')).toEqual({
      kind: 'local',
      id: 'new-session',
    });
    expect(commandDispatchForId('help')).toEqual({ kind: 'default', id: 'help' });
    expect(commandDispatchForId('plugin:demo')).toEqual({
      kind: 'plugin',
      id: 'plugin:demo',
    });
    expect(commandDispatchForId('backend:custom')).toEqual({
      kind: 'backend',
      id: 'backend:custom',
    });
  });

  it('does not count session jump commands in palette frecency', () => {
    expect(shouldRecordCommandUse('jump:s1')).toBe(false);
    expect(shouldRecordCommandUse('detached:s2')).toBe(false);
    expect(shouldRecordCommandUse('settings:providers')).toBe(true);
  });
});
