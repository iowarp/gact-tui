import { describe, expect, it } from 'vitest';
import type { ServiceObservation } from '@clio/core/v3';
import { managedServiceStatus } from './managed-service-status';

const observation = (fields: Partial<ServiceObservation>): ServiceObservation => ({
  definition_version: '1',
  configuration_revision: '',
  phase: 'stopped',
  installed: false,
  running: false,
  serving: false,
  worker_alive: false,
  provenance_ingesting: false,
  attention_verified: false,
  evidence_directory: '',
  observed_at: 0,
  ...fields,
});

describe('managedServiceStatus', () => {
  it('calls a failed install "Not installed" with Install, whatever phase was written', () => {
    const status = managedServiceStatus({
      state: 'unknown',
      observation: observation({ phase: 'stopped', error: 'install exited with code 1' }),
    });
    expect(status).toMatchObject({ kind: 'not_installed', label: 'Not installed' });
    expect(status.action).toBe('install');
    expect(status.reason).toMatch(/did not finish/u);
  });

  it('offers Start only for an installed, stopped service', () => {
    expect(
      managedServiceStatus({ state: 'stopped', observation: observation({ installed: true }) }),
    ).toMatchObject({ label: 'Stopped', action: 'start' });
    expect(managedServiceStatus({ state: 'stopped' })).toMatchObject({ action: 'start' });
  });

  it('reports serving, installing and unobserved records in words', () => {
    expect(
      managedServiceStatus({
        state: 'running',
        observation: observation({ running: true, serving: true, installed: true }),
      }).label,
    ).toBe('Running');
    expect(
      managedServiceStatus({ state: 'unknown', observation: observation({ phase: 'installing' }) })
        .label,
    ).toBe('Installing');
    expect(managedServiceStatus({ state: 'unknown' }).label).toBe('Not checked');
    expect(managedServiceStatus({ state: 'not_installed' }).label).toBe('Not installed');
    expect(
      managedServiceStatus({ state: 'unknown', variants: [{ compatible: false }] }).label,
    ).toBe('Unavailable here');
  });
});
