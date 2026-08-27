import type { Degradation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { connectionDegradationLabel, materialConnectionDegradations } from './connection-health';

const degradation = (capability: string, overrides: Partial<Degradation> = {}): Degradation => ({
  code: 'capability_unavailable',
  capability,
  reason: `The server does not provide ${capability}.`,
  recoverable: false,
  ...overrides,
});

describe('connection health presentation', () => {
  it('preserves every server-reported limitation', () => {
    const limitations = [
      degradation('voice'),
      degradation('lsp'),
      degradation('session_summary'),
      degradation('attachments_upload'),
    ];
    expect(materialConnectionDegradations(limitations)).toEqual(limitations);
  });

  it('renders the server reason without rewriting it', () => {
    const modelCatalog = degradation('providers', {
      code: 'model_catalog_unavailable',
      reason: 'No active provider model catalog has been observed.',
      recoverable: true,
    });

    expect(materialConnectionDegradations([modelCatalog])).toEqual([modelCatalog]);
    expect(connectionDegradationLabel(modelCatalog)).toBe(
      'No active provider model catalog has been observed.',
    );
  });
});
