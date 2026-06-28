import { describe, expect, it } from 'vitest';
import {
  reportPreview,
  retainedWorkflowStateFromText,
  stripControlContracts,
  structuredAgentTextPreview,
} from '../../src/components/executionProjectionReport.js';

// All of these are BACKEND-AGNOSTIC: structured state is summarised GENERICALLY
// (key: value rows), and embedded state blobs are detected STRUCTURALLY (a
// caption line + a JSON object), never by matching a backend marker string.
describe('execution projection report summaries (backend-agnostic)', () => {
  it('summarises nested structured evidence generically, without dumping JSON', () => {
    const out = reportPreview({
      kind: 'report',
      agent: 'geospatial',
      depth: 1,
      structured: {
        workflow_state: {
          geospatial: {
            region_name: 'San Diego, California',
            center_lat: 32.7174202,
            radius_km: 50,
            confidence: 'high',
          },
        },
      },
    });
    expect(out).toContain('region_name: San Diego, California');
    expect(out).toContain('center_lat: 32.7174202');
    expect(out).toContain('radius_km: 50');
    expect(out).not.toContain('{');
    expect(out).not.toContain('workflow_state');
  });

  it('adds an inline image hint for an image-pathed value', () => {
    const out = reportPreview({
      kind: 'report',
      agent: 'viz',
      depth: 1,
      structured: { artifact: { path: '/tmp/plot.png' } },
    });
    expect(out).toContain('/tmp/plot.png');
    expect(out).toContain('show full image');
  });

  it('extracts an embedded JSON state object detected by structure (caption + JSON)', () => {
    expect(
      retainedWorkflowStateFromText(
        'Some caption:\n{"workflow_state":{"artifact":{"path":"/tmp/plot.png"}}}',
      ),
    ).toEqual({
      workflow_state: { artifact: { path: '/tmp/plot.png' } },
    });
  });

  it('strips a trailing caption + JSON state blob from prose, structurally', () => {
    expect(
      stripControlContracts('Analysis ready.\nSome caption:\n{"hidden":true}'),
    ).toBe('Analysis ready.');
  });

  it('summarises a bare structured-JSON body into a compact key:value preview', () => {
    const out = structuredAgentTextPreview(
      JSON.stringify({
        acquisition: { status: 'staged', analysis_ready: true },
        resource_candidate: { resource_name: 'P475.csv' },
      }),
    );
    expect(out).toContain('status: staged');
    expect(out).toContain('analysis_ready: true');
    expect(out).toContain('resource_name: P475.csv');
  });
});
