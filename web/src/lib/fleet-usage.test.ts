import { describe, expect, it } from 'vitest';
import {
  busiestWindow,
  formatTokens,
  observedAgo,
  resetsIn,
  spendDetails,
  spendLabel,
} from './fleet-usage';
import { callModel } from './flow-run-usage';
import { turnModelExhausted } from './turn-model-exhausted';

const NOW = Date.parse('2026-10-23T10:00:00Z');

describe('fleet usage presentation', () => {
  it('says when a window resets in hours, days or minutes', () => {
    expect(resetsIn('2026-10-23T12:14:00Z', NOW)).toBe('resets in 2 h 14 min');
    expect(resetsIn('2026-10-25T13:00:00Z', NOW)).toBe('resets in 2 d 3 h');
    expect(resetsIn('2026-10-23T10:05:00Z', NOW)).toBe('resets in 5 min');
    expect(resetsIn('2026-10-23T09:00:00Z', NOW)).toBe('resets now');
    expect(resetsIn('not a time', NOW)).toBe('');
  });

  it('dates an old value', () => {
    expect(observedAgo('2026-10-23T09:48:00Z', NOW)).toBe('observed 12 min ago');
    expect(observedAgo('2026-10-23T10:00:00Z', NOW)).toBe('observed just now');
  });

  it('labels spend with tokens and a cost only when one was reported', () => {
    const spend = {
      tokens_input: 0,
      tokens_cached: 0,
      tokens_output: 0,
      tokens: 1_250_000,
      cost_usd: 0,
      turns_without_cost: 3,
      turns: 3,
    };
    expect(spendLabel(spend)).toBe('1.3M tokens');
    expect(spendLabel({ ...spend, tokens: 4200, cost_usd: 0.25 })).toBe('4k tokens, $0.25');
    expect(spendDetails({ ...spend, tokens: 40_000, cost_usd: 0.005 })).toEqual({
      tokens: '40k tokens',
      cost: 'under $0.01',
    });
    expect(formatTokens(950)).toBe('950');
  });

  it('finds the busiest window for the readout marker', () => {
    const snapshot = {
      account: 'claude_code',
      state: 'metered' as const,
      observed_at: '',
      source: '',
      windows: [
        { name: '5-hour', used_percent: 15, resets_at: '', window_minutes: 300 },
        { name: 'Weekly', used_percent: 84, resets_at: '', window_minutes: 10080 },
      ],
      balance: null,
      status: '',
      read_failure: '',
      read_failed_at: '',
    };
    expect(busiestWindow(snapshot)?.name).toBe('Weekly');
    expect(busiestWindow(null)).toBeUndefined();
  });

  it('names the model a call ran on and why', () => {
    const usage = {
      models: [],
      windows: [],
      calls: {
        task_1: {
          model: 'claude_code/claude-haiku-5-5',
          choice: { asked: 'haiku', source: 'explicit', reasons: [] },
        },
      },
    };
    expect(callModel(usage, 'task_1')).toBe('claude-haiku-5-5 (named for this call)');
    expect(callModel(usage, 'task_2')).toBeUndefined();
  });

  it('reads a person-chosen model_exhausted record and ignores Clio-chosen ones', () => {
    const record = {
      model: 'claude_code/opus',
      resets_at: '2026-10-23T12:00:00Z',
      chooser: 'person',
      alternatives: ['codex/gpt-5.5'],
    };
    expect(turnModelExhausted({ details: { model_exhausted: record } })).toEqual({
      model: 'claude_code/opus',
      resetsAt: '2026-10-23T12:00:00Z',
      alternatives: ['codex/gpt-5.5'],
    });
    expect(
      turnModelExhausted({ details: { model_exhausted: { ...record, chooser: 'clio' } } }),
    ).toBeUndefined();
    expect(turnModelExhausted(undefined)).toBeUndefined();
  });
});
