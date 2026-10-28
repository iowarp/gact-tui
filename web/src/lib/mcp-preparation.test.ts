import type { McpServerDefinition } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  anyServerPreparing,
  mcpServerPreparation,
  preparationReasonSentence,
  reconnectableNamespace,
} from './mcp-preparation';

function server(overrides: Partial<McpServerDefinition>): McpServerDefinition {
  return {
    id: 'session_mcp_sess_1_spotter',
    name: 'spotter',
    status: 'available',
    tools_count: 0,
    tools: [],
    spec: {},
    ...overrides,
  };
}

describe('mcpServerPreparation', () => {
  it('names the phase of a server being prepared, in words', () => {
    const view = mcpServerPreparation(
      server({ status: 'preparing', preparation: { state: 'preparing', phase: 'provision' } }),
    );
    expect(view?.state).toBe('preparing');
    expect(view?.label).toBe('Preparing (installing)');
    expect(view?.sentence).toContain('Installing');
    expect(view?.label).not.toContain('·');
  });

  it('turns a typed failure into a plain sentence and keeps the reason for Details', () => {
    const view = mcpServerPreparation(
      server({
        status: 'failed',
        reason: 'mcp_prepare_provision_failed',
        preparation: {
          state: 'failed',
          phase: 'provision',
          reason: 'mcp_prepare_provision_failed',
          detail: 'uv sync exited 2',
        },
      }),
    );
    expect(view?.label).toBe('Failed');
    expect(view?.sentence).toBe('The server’s software could not be installed.');
    expect(view?.sentence).not.toContain('mcp_');
    expect(view?.reason).toBe('mcp_prepare_provision_failed');
    expect(view?.detail).toBe('uv sync exited 2');
  });

  it('says a retry is in progress without calling it a failure', () => {
    const view = mcpServerPreparation(
      server({
        status: 'preparing',
        preparation: { state: 'preparing', phase: 'launch', reason: 'mcp_prepare_start_failed' },
      }),
    );
    expect(view?.state).toBe('preparing');
    expect(view?.sentence).toMatch(/Trying again\.$/u);
  });

  it('has nothing to show for a ready or not-yet-started server', () => {
    expect(mcpServerPreparation(server({ status: 'ready' }))).toBeUndefined();
    expect(mcpServerPreparation(server({ status: 'available' }))).toBeUndefined();
    expect(mcpServerPreparation(undefined)).toBeUndefined();
  });

  it('never shows an unknown reason token as the sentence', () => {
    expect(preparationReasonSentence('mcp_prepare_something_new')).toBe(
      'The server could not be prepared.',
    );
  });
});

describe('reconnectableNamespace', () => {
  it('reconnects only a conversation’s own server', () => {
    expect(reconnectableNamespace(server({ session_id: 'sess_1' }))).toBe('spotter');
    expect(reconnectableNamespace(server({ id: 'draft_mcp_spotter' }))).toBe('');
    expect(reconnectableNamespace(server({ id: 'mcp_fs', session_id: 'sess_1' }))).toBe('');
  });
});

describe('anyServerPreparing', () => {
  it('is true while one server is being prepared', () => {
    expect(anyServerPreparing([server({ status: 'ready' })])).toBe(false);
    expect(
      anyServerPreparing([
        server({ status: 'ready' }),
        server({ status: 'preparing', preparation: { state: 'preparing', phase: 'connect' } }),
      ]),
    ).toBe(true);
    expect(anyServerPreparing(undefined)).toBe(false);
  });
});
