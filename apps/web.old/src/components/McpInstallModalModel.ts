/**
 * View-model / pure logic for Mcp Install Modal: state shaping and helpers, no DOM. Key export `McpTransport`.
 */
import type { InstallMcpServerInput } from '@clio/core';

export type McpTransport = 'stdio' | 'sse' | 'http';

export interface McpEnvRow {
  key: string;
  value: string;
}

export interface McpInstallFormState {
  name: string;
  transport: McpTransport;
  command: string;
  argsText: string;
  envRows: readonly McpEnvRow[];
  url: string;
}

export type McpInstallBuildResult =
  | { ok: true; body: InstallMcpServerInput }
  | { ok: false; error: string };

export function parseArgsText(argsText: string): string[] {
  return argsText
    .split('\n')
    .map((arg) => arg.trim())
    .filter(Boolean);
}

export function envRowsToRecord(rows: readonly McpEnvRow[]): Record<string, string> {
  return rows.reduce<Record<string, string>>((acc, row) => {
    const key = row.key.trim();
    if (key) acc[key] = row.value;
    return acc;
  }, {});
}

export function buildMcpInstallBody(state: McpInstallFormState): McpInstallBuildResult {
  const name = state.name.trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const body: InstallMcpServerInput = {
    name,
    transport: state.transport,
  };

  if (state.transport === 'stdio') {
    const command = state.command.trim();
    if (!command) return { ok: false, error: 'Command is required for stdio transport.' };
    body.command = command;

    const args = parseArgsText(state.argsText);
    if (args.length > 0) body.args = args;

    const env = envRowsToRecord(state.envRows);
    if (Object.keys(env).length > 0) body.env = env;
    return { ok: true, body };
  }

  const url = state.url.trim();
  if (!url) return { ok: false, error: 'URL is required for sse / http transport.' };
  body.url = url;
  return { ok: true, body };
}
