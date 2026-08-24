import { describe, expect, it } from 'vitest';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';
import { ClioRepository } from './repository.js';

class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public async request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    const value = this.responses.shift();
    return request.decode(value);
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}

describe('SessionObservabilityRepository diff mutations', () => {
  it('applies and rejects only the explicitly selected server paths', async () => {
    const transport = new RecordingTransport([
      { applied: ['src/analysis.py'] },
      { rejected: ['notes/draft.md'] },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.applySessionDiffs('sess 1', ['src/analysis.py'])).resolves.toEqual({
      applied: ['src/analysis.py'],
    });
    await expect(repository.rejectSessionDiffs('sess 1', ['notes/draft.md'])).resolves.toEqual({
      rejected: ['notes/draft.md'],
    });

    expect(transport.requests.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/diffs/apply',
        body: { paths: ['src/analysis.py'] },
      },
      {
        method: 'POST',
        path: '/v1/sessions/sess%201/diffs/reject',
        body: { paths: ['notes/draft.md'] },
      },
    ]);
  });

  it('preserves per-path write failures from the server', async () => {
    const transport = new RecordingTransport([
      {
        applied: [],
        write_errors: { 'src/analysis.py': 'permission denied' },
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.applySessionDiffs('sess', ['src/analysis.py'])).resolves.toEqual({
      applied: [],
      write_errors: { 'src/analysis.py': 'permission denied' },
    });
  });
});

describe('SessionObservabilityRepository agent iterations', () => {
  it('projects exact ReAct steps and keeps terminal submit out of the tool ledger', async () => {
    const transport = new RecordingTransport([
      {
        events: [
          {
            event_id: 'event_1',
            event_type: 'react.step.completed',
            occurred_at: '2026-08-24T12:00:00Z',
            session_id: 'sess 1',
            turn_id: 'turn_1',
            summary: 'React step completed',
            payload: {
              expert_id: 'main',
              step_span_id: 'step_1',
              step_index: 0,
              reasoning: 'Inspect the evidence before choosing an action.',
              thought: 'I will read the evidence file.',
              tool_name: 'fs_read_file',
              tool_args: { path: 'evidence.json' },
              observation: { status: 'ready' },
              is_finish: false,
            },
          },
          {
            event_id: 'event_2',
            event_type: 'react.step.completed',
            session_id: 'sess 1',
            turn_id: 'turn_1',
            payload: {
              step_span_id: 'step_2',
              step_index: 1,
              reasoning: 'The evidence is sufficient.',
              thought: 'I can now provide the result.',
              tool_name: 'submit',
              tool_args: { answer: 'Ready' },
              observation: 'submitted',
              is_finish: true,
            },
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    await expect(repository.agentIterations('sess 1')).resolves.toEqual([
      expect.objectContaining({
        id: 'step_1',
        step_index: 0,
        thinking: 'Inspect the evidence before choosing an action.',
        next_thought: 'I will read the evidence file.',
        terminal: false,
        tool: expect.objectContaining({ name: 'fs_read_file', state: 'succeeded' }),
      }),
      expect.objectContaining({
        id: 'step_2',
        step_index: 1,
        next_thought: 'I can now provide the result.',
        terminal: true,
        tool: undefined,
      }),
    ]);
    expect(transport.requests[0]?.path).toBe(
      '/v1/sessions/sess%201/trace?scope=react.step.completed&limit=2000',
    );
  });
});
