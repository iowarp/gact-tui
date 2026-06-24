import { describe, expect, it } from 'vitest';
import {
  knownWorkflowBlocker,
  summarizeEvidenceRecord,
  workflowDetail,
  workflowTone,
} from '../../src/components/WorkflowStateFormatting.js';

describe('WorkflowStateFormatting', () => {
  it('summarizes region evidence records', () => {
    expect(
      summarizeEvidenceRecord({
        REGION_LABEL: 'San Diego area',
        CENTER_LAT: 32.7157,
        CENTER_LON: -117.1611,
        RADIUS_KM: 50,
        CONFIDENCE: 'high',
      }),
    ).toBe('Resolved region: San Diego area · center 32.7157, -117.1611 · radius 50 km · confidence high');
  });

  it('uses the unsupported expert blocker copy for known delegation failures', () => {
    expect(
      knownWorkflowBlocker({
        error: '_UnsupportedSessionAgent',
        failed_child: 'ndp_dataset_discovery',
        parent: 'data',
      }),
    ).toContain('required tools are not available');
  });

  it('maps workflow status and fields into row tone/details', () => {
    expect(workflowTone('completed', {})).toBe('ok');
    expect(workflowTone('metadata_only', {})).toBe('warn');
    expect(workflowTone('failed', { error: 'boom' })).toBe('err');
    expect(
      workflowDetail({
        station_id: 'P475',
        candidate_count: 9,
        local_path: '/tmp/station.csv',
      }),
    ).toBe('Local Path: /tmp/station.csv · Station Id: P475 · Candidate Count: 9');
  });
});
