import { describe, expect, it } from 'vitest';
import {
  capabilityGapRows,
  healthStatusColor,
  healthStatusTone,
  humanUptime,
  lspStatusTone,
  overallHealthMeaning,
  overallHealthStatus,
} from '../../src/routes/discovery/DoctorPageModel.js';

describe('DoctorPageModel', () => {
  it('maps capability gap records to renderable rows', () => {
    expect(
      capabilityGapRows({
        globus: {
          status: 'unsupported',
          category: 'transfer',
          description: 'Globus is disabled.',
          advertised: true,
        },
        ndp: {},
      }),
    ).toEqual([
      {
        name: 'globus',
        status: 'unsupported',
        category: 'transfer',
        description: 'Globus is disabled.',
        advertised: true,
      },
      {
        name: 'ndp',
        status: 'unknown',
        category: '',
        description: '',
        advertised: false,
      },
    ]);
  });

  it('derives overall health status and explanatory copy', () => {
    expect(overallHealthStatus({ healthy: true, uptime_s: 10 })).toBe('healthy');
    expect(overallHealthStatus({ healthy: false, uptime_s: 10 })).toBe('unknown');
    expect(overallHealthStatus({ healthy: false, uptime_s: 10, overall_status: 'degraded' })).toBe(
      'degraded',
    );
    expect(overallHealthMeaning('ready')).toMatch(/ready/);
    expect(overallHealthMeaning('degraded')).toMatch(/attention/);
    expect(overallHealthMeaning('unavailable')).toMatch(/unavailable/);
    expect(overallHealthMeaning('mystery')).toMatch(/unknown/);
  });

  it('maps health and LSP statuses to tones and colors', () => {
    expect(healthStatusTone('ready')).toBe('ok');
    expect(healthStatusTone('degraded')).toBe('warn');
    expect(healthStatusTone('unavailable')).toBe('err');
    expect(healthStatusTone('skipped')).toBe('');

    expect(lspStatusTone('running')).toBe('ok');
    expect(lspStatusTone('starting')).toBe('warn');
    expect(lspStatusTone('crashed')).toBe('err');
    expect(lspStatusTone(undefined)).toBe('');

    expect(healthStatusColor('healthy')).toBe('var(--color-success)');
    expect(healthStatusColor('degraded')).toBe('var(--color-warning)');
    expect(healthStatusColor('unavailable')).toBe('var(--color-error)');
    expect(healthStatusColor('unknown')).toBe('var(--color-heading)');
  });

  it('formats uptime at stable unit boundaries', () => {
    expect(humanUptime(59)).toBe('59s');
    expect(humanUptime(60)).toBe('1m');
    expect(humanUptime(3599)).toBe('59m');
    expect(humanUptime(3600)).toBe('1h');
    expect(humanUptime(86399)).toBe('23h');
    expect(humanUptime(86400)).toBe('1d');
  });
});
