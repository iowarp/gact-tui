import {
  infrastructureOperationSchema,
  type InfrastructureOperationEvent,
  type OperationStep,
} from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  initialOperationStream,
  operationElapsedSeconds,
  operationStreamReducer,
  reuseNote,
  stepCounter,
  stepFraction,
} from './operation-progress-model';

const operation = infrastructureOperationSchema.parse({
  id: 'op-1',
  service_id: 'vllm',
  target_id: 'local',
  action: 'install',
  state: 'running',
  progress: 'Pulling',
  logs: '',
  created_at: '2026-10-08T00:00:00Z',
  updated_at: '2026-10-08T00:00:00Z',
  steps: [{ id: 'pull', label: 'Pull image', state: 'running' }],
});

const run = (events: InfrastructureOperationEvent[]) =>
  events.reduce(operationStreamReducer, initialOperationStream());

const step = (progress: Partial<NonNullable<OperationStep['progress']>>): OperationStep => ({
  id: 's',
  label: 'Step',
  state: 'running',
  message: '',
  progress: { determinate: false, detail: '', ...progress },
});

describe('operation stream reducer', () => {
  it('folds snapshot, progress, log, reuse and completion in order', () => {
    const reuse = { kind: 'sif', thing: 'vLLM image', identity: 'sha256:1', path: '', message: '' };
    const state = run([
      { id: 0, type: 'operation.snapshot', operation },
      {
        id: 1,
        type: 'operation.progress',
        progress: { current_step: 0, elapsed_seconds: 4 },
      },
      { id: 2, type: 'operation.log', log: { line: 'pulling layer 1', stream: 'stdout' } },
      { id: 3, type: 'operation.reuse', reuse },
      { id: 4, type: 'operation.reuse', reuse },
      { id: 5, type: 'operation.completed', operation: { ...operation, state: 'succeeded' } },
    ]);
    expect(state.cursor).toBe(5);
    expect(state.lines).toEqual([{ id: 2, line: 'pulling layer 1', stream: 'stdout' }]);
    expect(state.completed).toBe(true);
    expect(state.operation?.state).toBe('succeeded');
  });

  it('keeps fields a progress patch leaves out and dedupes reuse notes', () => {
    const reuse = { kind: 'sif', thing: 'vLLM image', identity: 'sha256:1', path: '', message: '' };
    const state = run([
      { id: 0, type: 'operation.snapshot', operation },
      { id: 1, type: 'operation.progress', progress: { elapsed_seconds: 9 } },
      { id: 2, type: 'operation.reuse', reuse },
      { id: 3, type: 'operation.reuse', reuse },
    ]);
    expect(state.operation?.steps).toHaveLength(1);
    expect(state.operation?.elapsed_seconds).toBe(9);
    expect(state.operation?.reused).toHaveLength(1);
  });

  it('ignores events replayed after a reconnect and marks a log gap', () => {
    const first = run([
      { id: 0, type: 'operation.snapshot', operation },
      { id: 7, type: 'operation.log', log: { line: 'a', stream: 'stdout' } },
    ]);
    const resumed = [
      { id: 0, type: 'operation.snapshot', operation },
      { id: 7, type: 'operation.log', log: { line: 'a', stream: 'stdout' } },
      { id: 0, type: 'stream.gap', first_retained_id: 3 },
      { id: 8, type: 'operation.log', log: { line: 'b', stream: 'stdout' } },
    ] satisfies InfrastructureOperationEvent[];
    const state = resumed.reduce(operationStreamReducer, first);
    expect(state.lines.map((row) => row.line)).toEqual(['a', 'b']);
    expect(state.gap).toBe(true);
  });
});

describe('step progress', () => {
  it('reports a fraction only when the service measured one', () => {
    expect(stepFraction(step({ determinate: true, fraction: 0.4 }))).toBe(0.4);
    expect(stepFraction(step({ determinate: false, fraction: 0.4 }))).toBeUndefined();
    expect(stepFraction(step({ determinate: true }))).toBeUndefined();
    expect(stepFraction(step({ determinate: true, fraction: 1.7 }))).toBe(1);
  });

  it('words the counter by unit', () => {
    const bytes = step({ unit: 'bytes', current: 1_500_000, total: 4_000_000 });
    expect(stepCounter(bytes.progress)).toBe('1.5 MB of 4.0 MB');
    expect(stepCounter(step({ unit: 'packages', current: 12, total: 80 }).progress)).toBe(
      '12 of 80 packages',
    );
    expect(stepCounter(step({ unit: 'layers', current: 3 }).progress)).toBe('3 layers');
    expect(stepCounter(step({ detail: 'building wheel' }).progress)).toBe('building wheel');
    expect(stepCounter(undefined)).toBeUndefined();
  });

  it('says what was reused and what it skipped', () => {
    expect(
      reuseNote({
        kind: 'sif',
        thing: 'vLLM image',
        identity: 'sha256:0123456789abcdef0123',
        path: '',
        size_bytes: 9_800_000_000,
        saved_seconds: 754,
        message: '',
      }),
    ).toBe('Reusing vLLM image (sha256:0123456789ab…); skipped 9.8 GB/~12m 34s');
    expect(
      reuseNote({ kind: 'venv', thing: 'env', identity: 'x', path: '', message: 'From CLIO' }),
    ).toBe('From CLIO');
  });

  it('ticks elapsed time while running and keeps the recorded value after', () => {
    const started = '2026-10-08T00:00:00Z';
    const now = Date.parse(started) + 65_000;
    expect(operationElapsedSeconds({ started_at: started, elapsed_seconds: 3 }, now, true)).toBe(
      65,
    );
    expect(operationElapsedSeconds({ started_at: started, elapsed_seconds: 70 }, now, false)).toBe(
      70,
    );
  });
});
