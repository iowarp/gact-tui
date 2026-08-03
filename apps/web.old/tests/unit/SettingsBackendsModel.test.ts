import { describe, expect, it } from 'vitest';
import type { BackendEntry, Capabilities } from '@clio/core';
import {
  backendAuthHeaders,
  backendCapabilityLabels,
  backendStatusChip,
  capabilitiesProbeUrl,
} from '../../src/routes/SettingsBackendsModel.js';

function backend(overrides: Partial<BackendEntry> = {}): BackendEntry {
  return {
    id: 'test',
    label: 'Test backend',
    url: 'http://127.0.0.1:9999',
    bearerToken: '',
    kind: 'http',
    ...overrides,
  };
}

function capabilities(overrides: Partial<Capabilities> = {}): Capabilities {
  return {
    contract_version: '0.2',
    backend: {
      name: 'fixture',
      version: '0.0.0',
      vendor: 'test',
    },
    capabilities: {},
    transports: {
      events_sse: false,
      events_websocket: false,
    },
    auth: {
      schemes: [],
      current: 'none',
    },
    extensions: [],
    ...overrides,
  };
}

describe('SettingsBackendsModel', () => {
  it('derives status chips from error and capability state', () => {
    expect(backendStatusChip(backend({ lastError: 'down' }))).toEqual({
      label: 'error',
      cls: 'chip--err',
    });
    expect(backendStatusChip(backend({ capabilities: capabilities() }))).toEqual({
      label: 'reachable',
      cls: 'chip--ok',
    });
    expect(backendStatusChip(backend())).toEqual({
      label: 'unknown',
      cls: 'chip--warn',
    });
  });

  it('normalizes the capabilities probe URL', () => {
    expect(capabilitiesProbeUrl(backend({ url: 'http://127.0.0.1:9999' }))).toBe(
      'http://127.0.0.1:9999/v1/capabilities',
    );
    expect(capabilitiesProbeUrl(backend({ url: 'http://127.0.0.1:9999///' }))).toBe(
      'http://127.0.0.1:9999/v1/capabilities',
    );
  });

  it('builds auth headers only when a bearer token exists', () => {
    expect(backendAuthHeaders(backend({ bearerToken: '' }))).toEqual({});
    expect(backendAuthHeaders(backend({ bearerToken: 'tok' }))).toEqual({
      Authorization: 'Bearer tok',
    });
  });

  it('builds capability labels in display order', () => {
    expect(
      backendCapabilityLabels(
        backend({
          capabilities: {
            ...capabilities(),
            transports: { events_sse: true },
            capabilities: {
              permissions: true,
              diffs: true,
              agent_routing: true,
              mcp: true,
              memory: true,
            },
          },
        }),
      ),
    ).toEqual(['contract 0.2', 'sse', 'permissions', 'diffs', 'agents', 'mcp', 'memory']);

    expect(backendCapabilityLabels(backend())).toEqual([]);
  });
});
