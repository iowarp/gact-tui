import { describe, expect, it } from 'vitest';
import {
  formatBindingValue,
  hasBindingProvenance,
  hasPackagedProvenance,
  selectedBindingDescription,
  type SessionBindings,
} from '../../src/components/InspectorBindingsModel.js';

const BASE_BINDINGS: SessionBindings = {
  blueprint_id: 'bp_alpha',
  pack_id: null,
  availableBlueprints: [{ id: 'bp_alpha', label: 'Alpha blueprint' }],
  availablePacks: [],
};

describe('InspectorBindingsModel', () => {
  it('returns the selected binding description', () => {
    expect(
      selectedBindingDescription('bp_alpha', [
        { id: 'bp_alpha', label: 'Alpha', description: 'Alpha description' },
      ]),
    ).toBe('Alpha description');
    expect(selectedBindingDescription(null, [])).toBeUndefined();
    expect(selectedBindingDescription('missing', [])).toBeUndefined();
  });

  it('detects read-only binding provenance fields', () => {
    expect(hasBindingProvenance(BASE_BINDINGS)).toBe(false);
    expect(hasBindingProvenance({ ...BASE_BINDINGS, workspace_id: 'ws' })).toBe(
      true,
    );
    expect(
      hasBindingProvenance({ ...BASE_BINDINGS, blueprint_path: '/tmp/bp.yaml' }),
    ).toBe(true);
    expect(
      hasBindingProvenance({ ...BASE_BINDINGS, overlay: { temperature: 0.2 } }),
    ).toBe(true);
    expect(
      hasBindingProvenance({ ...BASE_BINDINGS, activation: { scope: 'session' } }),
    ).toBe(true);
  });

  it('formats string values directly and non-strings as json', () => {
    expect(formatBindingValue('session')).toBe('session');
    expect(formatBindingValue(0.2)).toBe('0.2');
    expect(formatBindingValue({ source: 'workspace' })).toBe(
      '{"source":"workspace"}',
    );
  });

  it('hides packaged provenance when only an id is present', () => {
    expect(hasPackagedProvenance({ id: 'bp_data' })).toBe(false);
  });

  it('shows packaged provenance for trust, version, scope, metadata, or errors', () => {
    expect(hasPackagedProvenance({ enabled: false })).toBe(true);
    expect(hasPackagedProvenance({ version: '1.0.0' })).toBe(true);
    expect(hasPackagedProvenance({ scope: 'global' })).toBe(true);
    expect(hasPackagedProvenance({ install: { ref: 'main' } })).toBe(true);
    expect(hasPackagedProvenance({ bootstrap: { status: 'ok' } })).toBe(true);
    expect(hasPackagedProvenance({ validation_errors: ['bad pin'] })).toBe(true);
  });
});
