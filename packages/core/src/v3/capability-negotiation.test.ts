import { describe, expect, it } from 'vitest';
import { decodeCapabilities } from './capability-negotiation.js';
import { TransportError } from './transport.js';

describe('capabilities negotiation errors', () => {
  it('explains a legacy response and keeps schema diagnostics separate', () => {
    let failure: unknown;
    try {
      decodeCapabilities({ protocol_version: '0.2', tools: [] });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TransportError);
    const error = failure as TransportError;
    expect(error.code).toBe('incompatible_capabilities');
    expect(error.message).toContain('X-GACT-Version: 0.3');
    expect(error.message).not.toContain('invalid_type');
    expect(error.details).toMatchObject({
      expected_version: '0.3',
      path: '/v1/capabilities',
      issues: expect.any(Array),
    });
  });
});
