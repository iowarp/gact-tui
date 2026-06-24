import { describe, expect, it } from 'vitest';
import {
  reportPreview,
  retainedWorkflowStateFromText,
  stripControlContracts,
  structuredAgentTextPreview,
} from '../../src/components/executionProjectionReport.js';

describe('execution projection report summaries', () => {
  it('summarizes geospatial structured evidence without dumping workflow JSON', () => {
    expect(
      reportPreview({
        kind: 'report',
        agent: 'geospatial',
        depth: 1,
        structured: {
          workflow_state: {
            geospatial: {
              region_name: 'San Diego, San Diego County, California, United States',
              center_lat: 32.7174202,
              center_lon: -117.162772,
              radius_km: 50,
              confidence: 'high',
              provenance: 'osm_nominatim',
            },
          },
        },
      }),
    ).toBe(
      [
        'San Diego, San Diego County, California, United States',
        'center 32.7174202, -117.162772',
        'radius 50 km',
        'confidence high',
        'provenance osm_nominatim',
      ].join('\n'),
    );
  });

  it('extracts retained workflow state from assistant handoff text', () => {
    expect(
      retainedWorkflowStateFromText(
        'done\nCLIO typed workflow state:\n{"workflow_state":{"artifact":{"path":"/tmp/plot.png"}}}',
      ),
    ).toEqual({
      workflow_state: {
        artifact: {
          path: '/tmp/plot.png',
        },
      },
    });
  });

  it('strips control contracts before formatting assistant prose', () => {
    expect(
      stripControlContracts(
        'Analysis ready.\nRetained typed workflow state:\n{"workflow_state":{"hidden":true}}',
      ),
    ).toBe('Analysis ready.');
  });

  it('turns structured assistant JSON into a compact report preview', () => {
    expect(
      structuredAgentTextPreview(
        JSON.stringify({
          acquisition: {
            status: 'staged',
            metadata_path: '/tmp/earthscope_stations_clean.csv',
            analysis_ready: true,
          },
          resource_candidate: {
            resource_name: 'P475.CI.LY_.20.csv',
          },
        }),
      ),
    ).toBe(
      [
        'acquisition staged',
        '/tmp/earthscope_stations_clean.csv',
        'analysis ready true',
        'P475.CI.LY_.20.csv',
      ].join('\n'),
    );
  });
});
