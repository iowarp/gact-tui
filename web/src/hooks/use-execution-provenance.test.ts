import type { ExecutionProvenanceResult, ProvenanceProviderSummary } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  executionProvenanceDegradation,
  selectProvenanceProvider,
} from './use-execution-provenance';

const flowcept: ProvenanceProviderSummary = {
  name: 'flowcept',
  configured: true,
  queryable: true,
  durable: false,
  status: 'ready',
  source: 'flowcept',
  health: {},
};

describe('execution provenance query state', () => {
  it('preserves a valid user provider choice and otherwise follows the server default', () => {
    expect(selectProvenanceProvider('flowcept', 'native', [flowcept])).toBe('flowcept');
    expect(selectProvenanceProvider('removed', 'native', [flowcept])).toBe('native');
  });

  it('reports partial snapshots and dangling relationships instead of hiding them', () => {
    const execution: ExecutionProvenanceResult = {
      schema_version: 'clio.execution_provenance.v1',
      provider: 'flowcept',
      session_id: 'sess_1',
      complete: false,
      truncated: true,
      provider_health: {},
      campaigns: [],
      workflows: [],
      agents: [],
      spans: [],
      nodes: [],
      edges: [{ id: 'missing-edge', source: 'span_1', target: 'artifact_1', kind: 'produced' }],
    };
    const degradation = executionProvenanceDegradation({
      execution,
      provider: 'flowcept',
      providerSummary: flowcept,
    });

    expect(degradation).toMatchObject({
      code: 'execution_provenance_partial',
      partial: true,
      provider: 'flowcept',
    });
    expect(degradation?.reason).toContain('1 relationships reference missing nodes');
  });

  it('keeps a non-queryable provider explicit', () => {
    expect(
      executionProvenanceDegradation({
        provider: 'flowcept',
        providerSummary: { ...flowcept, queryable: false, status: 'disabled' },
      }),
    ).toMatchObject({ code: 'provenance_provider_not_queryable', partial: false });
  });
});
