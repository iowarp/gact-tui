import { expect, it } from 'vitest';
import { taskProgressLabel } from './task-progress-label';

it('shows canonical Shell byte progress instead of its transport envelope', () => {
  expect(
    taskProgressLabel(
      {
        completed: 225,
        unit: 'bytes',
        message: '{"type":"clio.terminal.chunk","stream":"stdout","text":"processing"}',
      },
      'Shell',
    ),
  ).toBe('225 B output');
});

it('retains actual download totals and indexing counts', () => {
  expect(taskProgressLabel({ completed: 250, total: 500, unit: 'bytes' }, 'Download')).toBe(
    '250 B / 500 B',
  );
  expect(taskProgressLabel({ completed: 48, unit: 'entries' }, 'Indexing')).toBe(
    '48 entries indexed',
  );
});

it('does not invent a unit or total for owner-reported numeric progress', () => {
  expect(taskProgressLabel({ completed: 7 })).toBe('7');
  expect(taskProgressLabel({ completed: 7, total: 10, unit: 'items' })).toBe('7 / 10 items');
});

it('preserves legacy counters and plain messages when canonical counts are absent', () => {
  expect(taskProgressLabel({ bytes: 225 }, 'Shell')).toBe('225 B output');
  expect(taskProgressLabel({ entries_done: 48 }, 'Indexing')).toBe('48 entries indexed');
  expect(taskProgressLabel({ message: 'Waiting for your answer' }, 'Question')).toBe(
    'Waiting for your answer',
  );
});
