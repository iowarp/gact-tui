/**
 * gap-07 — Inspector Bindings tab: read-only binding provenance.
 *
 * clio's workspace-management work (#479/#480/#482) extended
 * GET /v1/sessions/{sid}/agent-blueprint with `workspace_id`,
 * `active_agent_blueprint_path`, `agent_overlay` (session-level field
 * overrides) and `activation` (per-field provenance). These tests pin:
 *   - the provenance block renders when any of it is present,
 *   - nothing extra renders for older backends (no optional fields),
 *   - overlay + activation entries render key → value rows.
 */
import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InspectorDrawer,
  type SessionBindings,
} from '../../src/components/InspectorDrawer.js';
import type { Message } from '@clio/core';

afterEach(cleanup);

const MSG: Message = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'answer' }],
} as Message;

const BASE: SessionBindings = {
  blueprint_id: 'bp_alpha',
  pack_id: null,
  availableBlueprints: [{ id: 'bp_alpha', label: 'Alpha blueprint' }],
  availablePacks: [],
};

function renderWith(bindings: SessionBindings) {
  return render(() => (
    <InspectorDrawer
      open={true}
      message={MSG}
      toolCalls={[]}
      costUsd={0}
      bindings={bindings}
      onClose={() => undefined}
    />
  ));
}

describe('Bindings provenance (gap-07)', () => {
  it('renders workspace, path, overlay and activation rows when present', () => {
    renderWith({
      ...BASE,
      workspace_id: 'ws_default',
      blueprint_path: '/home/u/.clio/blueprints/alpha.yaml',
      overlay: { temperature: 0.2, prompt_profile: 'terse' },
      activation: {
        active_agent_blueprint_id: 'bp_alpha',
        active_agent_blueprint_scope: 'session',
      },
    });
    screen.getByTestId('inspector-tab-bindings').click();

    expect(screen.getByTestId('binding-provenance')).toBeTruthy();
    expect(screen.getByTestId('binding-workspace').textContent).toBe(
      'ws_default',
    );
    expect(screen.getByTestId('binding-blueprint-path').textContent).toContain(
      'alpha.yaml',
    );
    // Overlay entries — non-string values are JSON-stringified.
    expect(
      screen.getByTestId('binding-overlay-temperature').textContent,
    ).toBe('0.2');
    expect(
      screen.getByTestId('binding-overlay-prompt_profile').textContent,
    ).toBe('terse');
    // Activation provenance entries.
    expect(
      screen.getByTestId('binding-activation-active_agent_blueprint_scope')
        .textContent,
    ).toBe('session');
  });

  it('renders no provenance block for older backends (fields absent)', () => {
    renderWith(BASE);
    screen.getByTestId('inspector-tab-bindings').click();

    // The dropdowns still render…
    expect(screen.getByTestId('binding-blueprint')).toBeTruthy();
    // …but no provenance block appears.
    expect(screen.queryByTestId('binding-provenance')).toBeNull();
  });

  it('renders the block when only the workspace is known', () => {
    renderWith({ ...BASE, workspace_id: 'ws_research' });
    screen.getByTestId('inspector-tab-bindings').click();

    expect(screen.getByTestId('binding-provenance')).toBeTruthy();
    expect(screen.getByTestId('binding-workspace').textContent).toBe(
      'ws_research',
    );
    expect(screen.queryByTestId('binding-blueprint-path')).toBeNull();
  });
});
