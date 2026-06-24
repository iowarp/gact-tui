import { describe, expect, it } from 'vitest';
import {
  splitWorkflowState,
  summarizeHandoffDetail,
  turnWorkflowBlocker,
} from '../../src/components/WorkflowStateModel.js';

describe('WorkflowStateModel', () => {
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

  it('summarizes leading handoff evidence JSON into readable text', () => {
    const summary = summarizeHandoffDetail(
      JSON.stringify({
        REGION_LABEL: 'San Diego area',
        CENTER_LAT: 32.7157,
        CENTER_LON: -117.1611,
        RADIUS_KM: 50,
        CONFIDENCE: 'high',
      }),
    );

    expect(summary).toContain('Resolved region: San Diego area');
    expect(summary).toContain('center 32.7157, -117.1611');
  });

  it('finds unsupported child-agent blockers from metadata workflow state', () => {
    const blocker = turnWorkflowBlocker([
      {
        type: 'expert_handoff',
        metadata: {
          workflow_state: {
            delegation: {
              status: 'failed',
              failed_child: 'ndp_dataset_discovery',
              parent: 'data',
              error: '_UnsupportedSessionAgent',
            },
          },
        },
      },
    ]);

    expect(blocker?.title).toBe('Workflow blocker');
    expect(blocker?.detail).toContain('child expert: ndp_dataset_discovery');
    expect(blocker?.detail).toContain('required tools are not available');
  });
});
