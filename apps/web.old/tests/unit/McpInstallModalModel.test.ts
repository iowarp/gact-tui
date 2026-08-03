import { describe, expect, it } from 'vitest';
import {
  buildMcpInstallBody,
  envRowsToRecord,
  parseArgsText,
} from '../../src/components/McpInstallModalModel.js';

describe('McpInstallModalModel', () => {
  it('parses args and env rows while dropping blank keys', () => {
    expect(parseArgsText(' --token=$TOKEN \n\n --no-cache ')).toEqual([
      '--token=$TOKEN',
      '--no-cache',
    ]);
    expect(
      envRowsToRecord([
        { key: ' GITHUB_TOKEN ', value: 'ghp_123' },
        { key: ' ', value: 'ignored' },
      ]),
    ).toEqual({ GITHUB_TOKEN: 'ghp_123' });
  });

  it('builds stdio install payloads', () => {
    expect(
      buildMcpInstallBody({
        name: ' github ',
        transport: 'stdio',
        command: ' /usr/local/bin/mcp-github ',
        argsText: '--token=$GITHUB_TOKEN\n--no-cache',
        envRows: [{ key: 'GITHUB_TOKEN', value: 'ghp_123' }],
        url: '',
      }),
    ).toEqual({
      ok: true,
      body: {
        name: 'github',
        transport: 'stdio',
        command: '/usr/local/bin/mcp-github',
        args: ['--token=$GITHUB_TOKEN', '--no-cache'],
        env: { GITHUB_TOKEN: 'ghp_123' },
      },
    });
  });

  it('builds URL transport payloads', () => {
    expect(
      buildMcpInstallBody({
        name: 'docs',
        transport: 'http',
        command: '',
        argsText: '',
        envRows: [],
        url: ' https://mcp.example.com/ ',
      }),
    ).toEqual({
      ok: true,
      body: {
        name: 'docs',
        transport: 'http',
        url: 'https://mcp.example.com/',
      },
    });
  });

  it('returns validation errors before building a payload', () => {
    expect(
      buildMcpInstallBody({
        name: '',
        transport: 'stdio',
        command: 'cmd',
        argsText: '',
        envRows: [],
        url: '',
      }),
    ).toEqual({ ok: false, error: 'Name is required.' });
    expect(
      buildMcpInstallBody({
        name: 'github',
        transport: 'stdio',
        command: '',
        argsText: '',
        envRows: [],
        url: '',
      }),
    ).toEqual({ ok: false, error: 'Command is required for stdio transport.' });
    expect(
      buildMcpInstallBody({
        name: 'remote',
        transport: 'sse',
        command: '',
        argsText: '',
        envRows: [],
        url: '',
      }),
    ).toEqual({ ok: false, error: 'URL is required for sse / http transport.' });
  });
});
