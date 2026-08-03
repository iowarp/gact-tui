import { describe, expect, it } from 'vitest';
import {
  RECONNECT_UNSUPPORTED_TITLE,
  mcpReconnectLabel,
  mcpReconnectTitle,
  mcpServerDetailToggleLabel,
  mcpServerStatusTone,
  mcpServerSubtitle,
} from '../../src/routes/discovery/McpServerCardModel.js';

describe('McpServerCardModel', () => {
  it('maps MCP server statuses to tag tones', () => {
    expect(mcpServerStatusTone('ready')).toBe('ok');
    expect(mcpServerStatusTone('starting')).toBe('warn');
    expect(mcpServerStatusTone('error')).toBe('err');
    expect(mcpServerStatusTone('disconnected')).toBe('err');
    expect(mcpServerStatusTone('unknown' as never)).toBe('');
  });

  it('formats the server subtitle from transport and tool count', () => {
    expect(mcpServerSubtitle({ transport: 'stdio', tools_count: 3 })).toBe(
      'stdio · 3 tools',
    );
  });

  it('labels expandable detail state', () => {
    expect(mcpServerDetailToggleLabel(false)).toBe('Show tools, resources & prompts');
    expect(mcpServerDetailToggleLabel(true)).toBe('Hide details');
  });

  it('labels reconnect state and unsupported title', () => {
    expect(mcpReconnectLabel(false)).toBe('Reconnect');
    expect(mcpReconnectLabel(true)).toBe('Working…');
    expect(mcpReconnectTitle(false)).toBeUndefined();
    expect(mcpReconnectTitle(true)).toBe(RECONNECT_UNSUPPORTED_TITLE);
  });
});
