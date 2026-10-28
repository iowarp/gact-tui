import { describe, expect, it } from 'vitest';
import {
  operationDetail,
  serviceObservationSummary,
} from './infrastructure-operation-presentation';

describe('infrastructure operation outcomes', () => {
  it('distinguishes process creation from service readiness using the latest declared observation', () => {
    const logs =
      'CLIO_SERVICE_OBSERVATION {"running":true,"serving":false}\nCLIO_SERVICE_OBSERVATION {"running":true,"serving":true}';
    expect(serviceObservationSummary(logs.split('\n')[0])).toContain('readiness was not confirmed');
    expect(serviceObservationSummary(logs)).toBe('The service responded.');
  });
  it('does not infer health from unstructured or incomplete output', () => {
    expect(serviceObservationSummary('success, service running')).toBeUndefined();
    expect(serviceObservationSummary('CLIO_SERVICE_OBSERVATION {"running":')).toBeUndefined();
    expect(
      serviceObservationSummary('CLIO_SERVICE_OBSERVATION {"running":"true"}'),
    ).toBeUndefined();
    expect(operationDetail('Completed', 'Completed')).toBeUndefined();
    expect(operationDetail('CLIO_SERVICE_OBSERVATION {}', 'Completed')).toBeUndefined();
  });
});
