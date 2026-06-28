/**
 * App bootstrap helpers: host-label formatting, synthesised fixture
 * capabilities, and seeding the backend registry with demo backends.
 */
import { brand } from '@brand';
import type { Capabilities } from '@clio/core';
import type { BackendRegistry } from './registry.js';

export function hostLabel(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

export function synthCapabilities(): Capabilities {
  return {
    contract_version: '0.2',
    backend: {
      name: 'fixture',
      version: '0.0.0',
      vendor: 'gact-tui',
    },
    capabilities: {
      workspaces: true,
      sessions: true,
      subagents: true,
      mcp: true,
      files: true,
      diffs: true,
      permissions: true,
      providers: true,
      commands: true,
      metrics: true,
      session_branching: true,
      session_export: true,
      cost_tracking: true,
      thinking_blocks: true,
      search_messages: true,
      agent_routing: true,
      memory: true,
      structured_errors: true,
      integration_health: true,
      tool_telemetry: true,
      attachments_upload: true,
      session_summary: true,
    },
    transports: {
      events_sse: true,
      events_websocket: false,
    },
    auth: {
      schemes: ['trust_socket'],
      current: 'trust_socket',
    },
    extensions: [],
  };
}

/**
 * Visual-regression hook for the settings + add-remote screenshots —
 * seeds the registry with a couple of fixtures so the screenshot has
 * something to render. Only fires when `?route=` opens those routes
 * directly.
 */
export function seedFixtureBackends(registry: BackendRegistry) {
  if (registry.state().backends.length > 0) return;
  registry.add({
    id: 'clio:local',
    label: `Local ${brand.name}`,
    url: 'http://127.0.0.1:17800',
    bearerToken: 'demo-token',
    kind: 'local-sidecar',
    capabilities: synthCapabilities(),
  });
  registry.add({
    id: 'alcf:polaris',
    label: 'ALCF · polaris',
    url: 'http://polaris.alcf.anl.gov:8100',
    bearerToken: '••••',
    kind: 'ssh-tunnel',
    capabilities: synthCapabilities(),
    ssh: {
      host: 'polaris.alcf.anl.gov',
      user: 'jaime',
      keyPath: '~/.ssh/id_ed25519',
    },
  });
  registry.add({
    id: 'remote:flagship',
    label: 'Flagship · staging',
    url: 'https://clio-staging.example.com',
    bearerToken: '••••',
    kind: 'http',
    lastError: 'connect ECONNREFUSED 1.2.3.4:443',
  });
  registry.select('clio:local');
}
