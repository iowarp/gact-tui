import { describe, expect, it } from 'vitest';
import {
  splitWorkflowState,
  summarizeHandoffDetail,
  turnWorkflowBlocker,
} from '../../src/components/WorkflowStateModel.js';

describe('WorkflowStateModel — BACKEND-AGNOSTIC', () => {
  it('extracts typed workflow state without dropping surrounding text', () => {
    const block = splitWorkflowState(
      'Before\nCLIO typed workflow state:\n' +
        JSON.stringify({ workflow_state: { acquisition: { status: 'staged' } } }) +
        '\nAfter',
    );

    expect(block?.before).toBe('Before');
    expect(block?.after).toBe('After');
    expect(block?.state.acquisition).toEqual({ status: 'staged' });
  });

  it('summarizes leading handoff evidence JSON generically into readable text', () => {
    const summary = summarizeHandoffDetail(
      JSON.stringify({
        region_label: 'San Diego area',
        center_lat: 32.7157,
        center_lon: -117.1611,
      }),
    );

    expect(summary).toContain('Region Label: San Diego area');
    expect(summary).toContain('Center Lat: 32.7157');
  });

  it('surfaces a turn blocker from ANY nested entry with a structural error, regardless of its name', () => {
    const blocker = turnWorkflowBlocker([
      {
        type: 'expert_handoff',
        metadata: {
          workflow_state: {
            // The sub-key is NOT named `delegation`; the renderer must still
            // surface it because the entry carries a structural error field.
            some_phase: {
              status: 'failed',
              failed_child: 'dataset_discovery',
              parent: 'data',
              error: 'tools unavailable',
            },
          },
        },
      },
    ]);

    expect(blocker?.title).toBe('Workflow blocker');
    expect(blocker?.detail).toContain('Failed Child: dataset_discovery');
  });
});
