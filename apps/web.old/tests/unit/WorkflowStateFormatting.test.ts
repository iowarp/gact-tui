import { describe, expect, it } from 'vitest';
import {
  summarizeEvidenceRecord,
  workflowDetail,
  workflowTone,
} from '../../src/components/WorkflowStateFormatting.js';

describe('WorkflowStateFormatting — BACKEND-AGNOSTIC', () => {
  it('summarizes an evidence record generically from its own scalar fields', () => {
    // No special keys: whatever scalar fields the backend provides are surfaced
    // as `Humanised Key: value`, in declaration order.
    expect(
      summarizeEvidenceRecord({
        region_label: 'San Diego area',
        center_lat: 32.7157,
        center_lon: -117.1611,
        radius_km: 50,
        confidence: 'high',
        nested: { ignored: true },
      }),
    ).toBe(
      'Region Label: San Diego area · Center Lat: 32.7157 · Center Lon: -117.1611 · Radius Km: 50 · Confidence: high',
    );
  });

  it('derives tone STRUCTURALLY, never by matching status prose', () => {
    // A status word alone — whatever the backend calls it — is neutral; only a
    // structural error/blocker field (or ok:false / failed:true) is an error.
    expect(workflowTone('completed', {})).toBe('idle');
    expect(workflowTone('whatever-backend-word', {})).toBe('idle');
    expect(workflowTone('any', { error: 'boom' })).toBe('err');
    expect(workflowTone('any', { blocker: 'missing tool' })).toBe('err');
    expect(workflowTone('any', { ok: false })).toBe('err');
    expect(workflowTone('any', { failed: true })).toBe('err');
  });

  it('builds a detail line from the object own keys, with no hardcoded key list', () => {
    expect(
      workflowDetail({
        station_id: 'P475',
        candidate_count: 9,
        local_path: '/tmp/station.csv',
        nested: { skipped: true },
      }),
    ).toBe('Station Id: P475 · Candidate Count: 9 · Local Path: /tmp/station.csv');
  });
});
