import { describe, expect, it } from 'vitest';
import { infrastructureOperationSchema, serverParameterSchema } from './infrastructure-contract.js';
import { decodeInfrastructureOperationEvent } from './infrastructure-repository.js';
import { ClioRepository } from './repository.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

const operation = {
  id: 'op-1',
  service_id: 'vllm',
  target_id: 'local',
  action: 'install',
  state: 'running',
  progress: 'Pulling image',
  logs: '',
  created_at: '2026-10-08T00:00:00Z',
  updated_at: '2026-10-08T00:00:00Z',
};

const controls = {
  semantics: 'deployment',
  maximum: 131072,
  maximum_reason: 'config.json max_position_embeddings',
  minimum: 256,
  current: 65536,
  current_choice: 'fit_to_gpu',
  current_reason: 'KV cache fits 65536 tokens in 0.9 of 1 GPU',
  fit_to_gpu: {
    available: true,
    reason: '',
    strategy: 'fit_to_gpu',
    strategies: [{ id: 'fit_to_gpu', label: 'Largest that fits', description: 'd' }],
    value: 65536,
  },
};

const frame = (eventName: string, id: number, payload: unknown): TransportFrame => ({
  cursor: id ? String(id) : '',
  eventName,
  data: { id, type: eventName, operation_id: 'op-1', at: '', payload },
  receivedAt: '',
});

class RecordingTransport implements ClioTransport {
  public requests: TransportRequest<unknown>[] = [];
  public streams: { scope: StreamScope; cursor?: string }[] = [];

  public constructor(
    private readonly responses: unknown[] = [],
    private readonly frames: TransportFrame[] = [],
  ) {}

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    return Promise.resolve(request.decode(this.responses.shift()));
  }

  public async *stream(scope: StreamScope, cursor?: string): AsyncIterable<TransportFrame> {
    this.streams.push({ scope, cursor });
    for (const item of this.frames) yield await Promise.resolve(item);
  }
}

describe('operation progress contract', () => {
  it('decodes an operation from an older service with no progress fields', () => {
    const decoded = infrastructureOperationSchema.parse(operation);
    expect(decoded.steps).toEqual([]);
    expect(decoded.reused).toEqual([]);
    expect(decoded.from_scratch).toBe(false);
    expect(decoded.log_cursor).toBe(0);
  });

  it('keeps fraction only as reported and tolerates unknown step states', () => {
    const decoded = infrastructureOperationSchema.parse({
      ...operation,
      steps: [
        {
          id: 'pull',
          label: 'Pull image',
          state: 'running',
          progress: { determinate: true, unit: 'bytes', current: 5, total: 10, fraction: 0.5 },
        },
        { id: 'wait', label: 'Wait for server', state: 'brand-new-state' },
      ],
      current_step: 0,
      reused: [{ kind: 'sif', thing: 'vLLM image', identity: 'sha256:abc', message: 'Reusing' }],
      log_cursor: 12,
    });
    expect(decoded.steps[0]?.progress?.fraction).toBe(0.5);
    expect(decoded.steps[1]?.state).toBe('pending');
    expect(decoded.steps[1]?.progress).toBeUndefined();
    expect(decoded.reused[0]?.thing).toBe('vLLM image');
  });

  it('decodes stream frames and ignores unknown event types', () => {
    expect(decodeInfrastructureOperationEvent(frame('operation.log', 7, { line: 'hi' }))).toEqual({
      id: 7,
      type: 'operation.log',
      log: { line: 'hi', stream: 'stdout', step: undefined },
    });
    expect(decodeInfrastructureOperationEvent(frame('operation.snapshot', 0, operation))?.id).toBe(
      0,
    );
    expect(decodeInfrastructureOperationEvent(frame('operation.future', 9, {}))).toBeUndefined();
    expect(
      decodeInfrastructureOperationEvent(frame('stream.gap', 0, { first_retained_id: 40 })),
    ).toEqual({ id: 0, type: 'stream.gap', first_retained_id: 40 });
  });

  it('streams an operation from its own path and resumes with Last-Event-ID', async () => {
    const transport = new RecordingTransport(
      [],
      [frame('operation.snapshot', 0, operation), frame('operation.log', 13, { line: 'x' })],
    );
    const repository = new ClioRepository(transport);
    const events = [];
    for await (const event of repository.infrastructureOperationEvents('op 1', 12)) {
      events.push(event.type);
    }
    expect(events).toEqual(['operation.snapshot', 'operation.log']);
    expect(transport.streams[0]).toEqual({
      scope: { connection_id: '', path: '/v1/infrastructure/operations/op%201/events' },
      cursor: '12',
    });
  });
});

describe('context sizing contract', () => {
  it('reads the context parameter control from the catalog', () => {
    const row = serverParameterSchema.parse({
      id: 'max_model_len',
      label: 'Context length',
      description: 'd',
      kind: 'integer',
      delivery: 'flag',
      name: '--max-model-len',
      minimum: 16,
      maximum: 10_000_000,
      context_sizing: {
        strategies: [{ id: 'fit_to_gpu', label: 'Largest that fits', description: '' }],
        fit_to_gpu_available: false,
        fit_to_gpu_reason: 'CPU variant has no GPU budget',
      },
    });
    expect(row.context_sizing?.choice_key).toBe('context.choice');
    expect(row.context_sizing?.fit_to_gpu_available).toBe(false);
    expect(
      serverParameterSchema.parse({ ...row, context_sizing: null }).context_sizing,
    ).toBeUndefined();
  });

  it('previews deployment sizing and saves a model working context', async () => {
    const transport = new RecordingTransport([
      controls,
      { ...controls, semantics: 'model' },
      { ...controls, semantics: 'model', current: 8192, current_choice: 'number' },
      { operation_id: 'op-1', state: 'running', lines: [], next_cursor: 4 },
    ]);
    const repository = new ClioRepository(transport);
    const preview = await repository.previewContextSizing('vllm', {
      target_id: 'local',
      variant_id: 'cuda',
      configuration: { model: 'Qwen/Qwen3-4B', 'context.choice': 'fit_to_gpu' },
    });
    await repository.workingContext('openai', 'Qwen/Qwen3-4B');
    const saved = await repository.saveWorkingContext('openai', {
      model: 'Qwen/Qwen3-4B',
      choice: 'number',
      tokens: 8192,
    });
    const log = await repository.infrastructureOperationLog('op-1', 3);

    expect(preview.fit_to_gpu.available).toBe(true);
    expect(saved.current).toBe(8192);
    expect(log.next_cursor).toBe(4);
    expect(transport.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'POST /v1/infrastructure/services/vllm/context-sizing',
      'GET /v1/providers/openai/working-context?model=Qwen%2FQwen3-4B',
      'PUT /v1/providers/openai/working-context',
      'GET /v1/infrastructure/operations/op-1/log?after=3&limit=500',
    ]);
  });
});
