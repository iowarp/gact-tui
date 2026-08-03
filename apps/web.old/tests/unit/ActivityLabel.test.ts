import { describe, expect, it } from 'vitest';
import { activityLabelFromSemanticEvents } from '../../src/activity-label.js';
import type { SemanticEventPayload } from '@clio/core';

const ev = (
  event_id: string,
  patch: Partial<SemanticEventPayload>,
): SemanticEventPayload => ({
  event_id,
  event_type: 'turn.started',
  status: 'running',
  ...patch,
});

describe('activityLabelFromSemanticEvents', () => {
  it('uses the latest meaningful semantic summary', () => {
    const label = activityLabelFromSemanticEvents([
      ev('a', {
        event_type: 'blueprint.delegation.started',
        summary: 'main delegated sync work to geospatial.',
      }),
      ev('b', {
        event_type: 'tool.call.started',
        summary: 'Tool ndp_stage_resource started.',
      }),
    ]);
    expect(label).toBe('Tool ndp_stage_resource started');
  });

  it('rewrites backend lifecycle jargon into operator language', () => {
    const label = activityLabelFromSemanticEvents([
      ev('a', {
        event_type: 'blueprint.delegation.started',
        summary: 'main delegated sync work to geospatial.',
      }),
    ]);
    expect(label).toBe('main handed work to geospatial');
  });

  it('does not expose redaction sentinels in the activity pill', () => {
    const label = activityLabelFromSemanticEvents([
      ev('a', {
        event_type: 'tool.call.started',
        summary: '[redacted]:235 chars',
        actor: { tool: '[redacted]:235 chars' },
        payload: { tool: 'ndp_search_datasets' },
      }),
    ]);
    expect(label).toBe('Running ndp_search_datasets');
  });

  it('falls back to readable delegation language when summary is absent', () => {
    const label = activityLabelFromSemanticEvents([
      ev('a', {
        event_type: 'blueprint.delegation.started',
        actor: { agent_id: 'main' },
        subject: { agent_id: 'data' },
      }),
    ]);
    expect(label).toBe('Handing work from main to data');
  });
});
