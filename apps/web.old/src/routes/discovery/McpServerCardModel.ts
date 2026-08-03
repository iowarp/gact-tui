/**
 * View-model / pure logic for Mcp Server Card: state shaping and helpers, no DOM. Key export `RECONNECT_UNSUPPORTED_TITLE`.
 */
import type { McpServerInfo } from '@clio/core';
import { statusTone } from '../../presentationUtils.js';

export const RECONNECT_UNSUPPORTED_TITLE =
  'Not supported by this backend (needs a backend with MCP reconnect)';

const MCP_SERVER_TONES: Readonly<Record<string, string>> = {
  ready: 'ok',
  starting: 'warn',
  error: 'err',
  disconnected: 'err',
};

export function mcpServerStatusTone(status: McpServerInfo['status']): string {
  return statusTone(status, MCP_SERVER_TONES, '');
}

export function mcpServerSubtitle(server: Pick<McpServerInfo, 'transport' | 'tools_count'>): string {
  return `${server.transport} · ${server.tools_count} tools`;
}

export function mcpServerDetailToggleLabel(expanded: boolean): string {
  return expanded ? 'Hide details' : 'Show tools, resources & prompts';
}

export function mcpReconnectLabel(busy: boolean): string {
  return busy ? 'Working…' : 'Reconnect';
}

export function mcpReconnectTitle(reconnectUnsupported: boolean): string | undefined {
  return reconnectUnsupported ? RECONNECT_UNSUPPORTED_TITLE : undefined;
}
