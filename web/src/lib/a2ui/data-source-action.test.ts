import { describe, expect, it } from 'vitest';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import { dataSourceIntent } from './data-source-action';

function action(name: string, context: Record<string, unknown> = {}): A2uiClientAction {
  return { name, context, sourceComponentId: 'login', surfaceId: 'inputs', timestamp: '2026-10-05T00:00:00Z' };
}

describe('source sign-in action contract', () => {
  it.each(['github', 'google_drive', 'globus'])('recognizes %s without a credential or URL', provider => {
    expect(dataSourceIntent(action(`data_source/login/${provider}`, {clio_id: 'clio1', workspace_id: 'ws1'})))
      .toEqual({provider, clioId: 'clio1', workspaceId: 'ws1'});
  });
  it('leaves normal actions in the regular action route', () => {
    expect(dataSourceIntent(action('select_trajectory'))).toBeUndefined();
  });
  it('rejects unsupported operations and providers', () => {
    expect(() => dataSourceIntent(action('data_source/login/https://example.org'))).toThrow('not supported');
    expect(() => dataSourceIntent(action('data_source/grant/github'))).toThrow('not supported');
  });
  it('requires both host and workspace identity', () => {
    expect(() => dataSourceIntent(action('data_source/login/github', {clio_id: 'clio1'}))).toThrow('owner');
  });
});
