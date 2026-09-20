import { describe, expect, it } from 'vitest';
import {
  WEB_MCP_COMMAND,
  WEB_MCP_ENV,
  WEB_SEARCH_DEFAULT_LOCAL_URL,
  webSearchDeploymentCommand,
  webSearchMcpArgs,
  webSearchUrlForHost,
} from './web-search-service';

describe('web search deployment contract', () => {
  it('builds the same local deployment command the operator was given before', () => {
    expect(webSearchDeploymentCommand({ bindAddress: '127.0.0.1', contactEmail: '' })).toBe(
      'docker run --detach --name clio-web-search --restart unless-stopped' +
        ' --publish 127.0.0.1:8089:8080' +
        ' --volume clio-web-search-data:/var/lib/clio-web-search' +
        ' ghcr.io/iowarp/clio-web-search:0.3.0',
    );
  });

  it('prefixes the SSH profile and carries the contact address when there is one', () => {
    expect(
      webSearchDeploymentCommand({
        bindAddress: '0.0.0.0',
        contactEmail: 'a+tag@example.org',
        sshProfile: 'ares',
      }),
    ).toBe(
      'ssh ares docker run --detach --name clio-web-search --restart unless-stopped' +
        ' --publish 0.0.0.0:8089:8080' +
        ' --env CLIO_WEB_SEARCH_CONTACT_EMAIL=a+tag@example.org' +
        ' --volume clio-web-search-data:/var/lib/clio-web-search' +
        ' ghcr.io/iowarp/clio-web-search:0.3.0',
    );
  });

  it('uses the installed or bundled clio-kit adapter without a first-use download', () => {
    expect(WEB_MCP_COMMAND).toBe('clio-kit');
    expect(WEB_MCP_ENV).toEqual({ WEB_STATE_DIR: '.clio-child-cache/web-mcp-state' });
    expect(webSearchMcpArgs('http://10.0.0.102:8089')).toEqual([
      'mcp-server',
      'web',
      '--remote-url',
      'http://10.0.0.102:8089',
    ]);
  });

  it('addresses a service on the same port wherever it was deployed', () => {
    expect(WEB_SEARCH_DEFAULT_LOCAL_URL).toBe('http://127.0.0.1:8089');
    expect(webSearchUrlForHost('lab-node')).toBe('http://lab-node:8089');
  });
});
