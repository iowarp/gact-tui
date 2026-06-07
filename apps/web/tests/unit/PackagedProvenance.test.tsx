/**
 * A7 — Inspector Bindings tab: packaged-component provenance + trust.
 *
 * clio #536–#546 / #539 added richer provenance on the bound blueprint's
 * own descriptor (the `agent_blueprint` body of
 * GET /v1/sessions/{id}/agent-blueprint): a trust gate (`enabled`),
 * `validation_errors`, and install/bootstrap provenance under
 * `metadata`. These fields (shapes captured live on :17807 against the
 * `data-semantics` blueprint) render read-only; nothing extra appears for
 * older backends that omit them.
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
  blueprint_id: 'data-semantics',
  pack_id: null,
  availableBlueprints: [{ id: 'data-semantics', label: 'Data Semantics' }],
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

describe('Bindings packaged provenance (A7)', () => {
  it('renders trust, version, scope, install, bootstrap and validation rows', () => {
    renderWith({
      ...BASE,
      packaged: {
        id: 'data-semantics',
        version: '',
        scope: 'global',
        enabled: false,
        validation_errors: ['registry pin mismatch: expected abc, found def'],
        install: {
          source: 'git@github.com:JaimeCernuda/clio-agent-marketplace.git',
          ref: 'main',
          commit: '908e013',
        },
        bootstrap: { status: 'failed', diagnostic: 'pin mismatch' },
      },
    });
    screen.getByTestId('inspector-tab-bindings').click();

    expect(screen.getByTestId('binding-packaged')).toBeTruthy();
    // Trust gate — enabled:false renders a "disabled" chip.
    expect(screen.getByTestId('packaged-trust').textContent).toContain(
      'disabled',
    );
    expect(screen.getByTestId('packaged-scope').textContent).toBe('global');
    // Install provenance, key-by-key.
    expect(screen.getByTestId('packaged-install-source').textContent).toContain(
      'clio-agent-marketplace',
    );
    expect(screen.getByTestId('packaged-install-ref').textContent).toBe('main');
    expect(screen.getByTestId('packaged-install-commit').textContent).toBe(
      '908e013',
    );
    // Bootstrap provenance.
    expect(
      screen.getByTestId('packaged-bootstrap-status').textContent,
    ).toBe('failed');
    // Validation errors list.
    expect(
      screen.getByTestId('packaged-validation-errors').textContent,
    ).toContain('pin mismatch');
  });

  it('renders an enabled trust chip when the component is trusted', () => {
    renderWith({ ...BASE, packaged: { enabled: true, version: '1.2.0' } });
    screen.getByTestId('inspector-tab-bindings').click();
    expect(screen.getByTestId('packaged-trust').textContent).toContain(
      'enabled',
    );
    expect(screen.getByTestId('packaged-version').textContent).toBe('1.2.0');
  });

  it('renders no packaged block for older backends (no agent_blueprint body)', () => {
    renderWith(BASE);
    screen.getByTestId('inspector-tab-bindings').click();
    expect(screen.getByTestId('binding-blueprint')).toBeTruthy();
    expect(screen.queryByTestId('binding-packaged')).toBeNull();
  });

  it('renders no packaged block when packaged carries only an id', () => {
    // id alone is not user-facing provenance — block stays hidden.
    renderWith({ ...BASE, packaged: { id: 'data-semantics' } });
    screen.getByTestId('inspector-tab-bindings').click();
    expect(screen.queryByTestId('binding-packaged')).toBeNull();
  });
});
