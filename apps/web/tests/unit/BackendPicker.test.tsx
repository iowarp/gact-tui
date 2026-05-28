import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BackendRegistryProvider,
  createBackendRegistry,
} from '../../src/registry.js';
import { BackendPicker } from '../../src/components/BackendPicker.js';
import {
  InMemoryPersistence,
  type BackendEntry,
} from '@clio/core';

afterEach(cleanup);

const seeded: BackendEntry[] = [
  {
    id: 'sidecar:local',
    label: 'Local sidecar',
    url: 'http://127.0.0.1:17800',
    bearerToken: 'tok',
    kind: 'local-sidecar',
    capabilities: {
      contract_version: '0.2',
      backend: { name: 'test', version: '0.0.0', vendor: 'gact-tui' },
      capabilities: { sessions: true, mcp: true, diffs: true, permissions: true },
      transports: { events_sse: true, events_websocket: false },
      auth: { schemes: ['trust_socket'], current: 'trust_socket' },
      extensions: [],
    },
  },
  {
    id: 'alcf:polaris',
    label: 'ALCF · polaris',
    url: 'http://polaris.example:8100',
    bearerToken: 'tok2',
    kind: 'ssh-tunnel',
    lastError: 'connect ECONNREFUSED',
  },
];

function harness() {
  // Seed two backends via the registry's reducer paths so the picker
  // has rows to render.
  const persistence = new InMemoryPersistence({
    backends: seeded,
    currentId: 'sidecar:local',
  });
  const registry = createBackendRegistry({ persistence });
  return registry;
}

async function nextTick() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('BackendPicker', () => {
  it('renders the current backend label after hydration', async () => {
    const registry = harness();
    render(() => (
      <BackendRegistryProvider registry={registry}>
        <BackendPicker />
      </BackendRegistryProvider>
    ));
    await nextTick();
    expect(screen.getByTestId('backend-picker').textContent).toContain('Local sidecar');
  });

  it('opens the menu on click and lists every registered backend', async () => {
    const registry = harness();
    render(() => (
      <BackendRegistryProvider registry={registry}>
        <BackendPicker />
      </BackendRegistryProvider>
    ));
    // Wait one microtask for the onMount hydration to land — without
    // it, the registry signal is still EMPTY_REGISTRY.
    await Promise.resolve();
    await Promise.resolve();
    fireEvent.click(screen.getByTestId('backend-picker'));
    expect(screen.getByTestId('backend-picker-menu')).toBeTruthy();
    expect(screen.getByTestId('backend-picker-item-sidecar:local')).toBeTruthy();
    expect(screen.getByTestId('backend-picker-item-alcf:polaris')).toBeTruthy();
  });

  it('fires onAddRemote when "Add remote backend" is clicked', async () => {
    const registry = harness();
    let opened = false;
    render(() => (
      <BackendRegistryProvider registry={registry}>
        <BackendPicker
          onAddRemote={() => {
            opened = true;
          }}
        />
      </BackendRegistryProvider>
    ));
    fireEvent.click(screen.getByTestId('backend-picker'));
    fireEvent.click(screen.getByTestId('backend-picker-add'));
    expect(opened).toBe(true);
  });
});
