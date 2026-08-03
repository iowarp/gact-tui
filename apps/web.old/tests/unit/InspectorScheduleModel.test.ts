import { describe, expect, test } from 'vitest';
import {
  humanizeCron,
  looksLikeCron,
} from '../../src/components/InspectorScheduleModel.js';

describe('InspectorScheduleModel', () => {
  test('accepts five and six field cron strings', () => {
    expect(looksLikeCron('0 9 * * *')).toBe(true);
    expect(looksLikeCron('0 0 9 * * *')).toBe(true);
    expect(looksLikeCron('0 9 *')).toBe(false);
  });

  test('humanizes common cron expressions', () => {
    expect(humanizeCron('* * * * *')).toBe('Every minute');
    expect(humanizeCron('15 * * * *')).toBe('Every hour at :15');
    expect(humanizeCron('*/5 * * * *')).toBe('Every 5 minutes');
    expect(humanizeCron('0 */2 * * *')).toBe('Every 2 hours');
    expect(humanizeCron('30 9 * * *')).toBe('Daily at 09:30');
    expect(humanizeCron('30 9 * * 1')).toBe('Weekly on Mon at 09:30');
  });
});
