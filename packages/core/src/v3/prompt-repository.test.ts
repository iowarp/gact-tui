import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import type { ClioTransport, StreamScope, TransportFrame, TransportRequest } from './transport.js';

class RecordingTransport implements ClioTransport {
  public readonly requests: TransportRequest<unknown>[] = [];

  public constructor(private readonly responses: unknown[]) {}

  public request<T>(request: TransportRequest<T>): Promise<T> {
    this.requests.push(request as TransportRequest<unknown>);
    return Promise.resolve(request.decode(this.responses.shift()));
  }

  public async *stream(
    _scope: StreamScope,
    _cursor?: string,
    _signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return;
  }
}

const profile = {
  name: 'heavy',
  text: 'Keep provenance visible.',
  scope: 'workspace',
  source_path: 'D:/science/.clio/prompts/review--heavy.md',
  provider: 'codex',
  model: 'gpt-5.6-luna',
  checksum: 'abc123',
  metadata: {},
};

const definition = {
  id: 'science.review',
  title: 'Science review',
  default_profile: 'heavy',
  profiles: { heavy: profile },
  scope: 'workspace',
  enabled: true,
  validation_errors: [],
  metadata: {},
};

const resolved = {
  id: 'science.review',
  profile: 'heavy',
  text: 'Keep provenance visible.',
  title: 'Science review',
  scope: 'workspace',
  provider: 'codex',
  model: 'gpt-5.6-luna',
  validation_errors: [],
  metadata: {},
};

describe('PromptRepository', () => {
  it('preserves scoped prompt provenance, validation, rendering, and save contracts', async () => {
    const transport = new RecordingTransport([
      { prompts: [definition] },
      { prompt: resolved },
      { prompt: { ...resolved, text: 'Rendered with the live agent tree.' } },
      { enabled: true, validation_errors: [], prompt: definition },
      { prompt: definition },
      { reload: { prompt_ids: ['science.review'], prompt_count: 1 } },
      { commands: [] },
      {
        command: '/review',
        session_id: 'sess_review',
        result: { type: 'system_message', text: 'Review complete.' },
      },
    ]);
    const repository = new ClioRepository(transport);
    const context = { workspaceId: 'ws_science', sessionId: 'sess_review' };

    expect((await repository.prompts(undefined, context))[0]?.profiles.heavy?.provider).toBe(
      'codex',
    );
    expect((await repository.prompt('science.review', { ...context, profile: 'heavy' })).text).toBe(
      'Keep provenance visible.',
    );
    expect(
      (
        await repository.renderPrompt('science.review', {
          ...context,
          profile: 'heavy',
          context: { 'agents.available_tree': '- station: Station reviewer' },
        })
      ).text,
    ).toContain('live agent tree');
    expect(
      (
        await repository.validatePrompt('science.review', {
          ...context,
          profile: 'heavy',
          text: 'Keep provenance visible.',
        })
      ).enabled,
    ).toBe(true);
    await repository.savePrompt('science.review', {
      ...context,
      scope: 'workspace',
      profile: 'heavy',
      text: 'Keep provenance visible.',
      title: 'Science review',
      provider: 'codex',
      model: 'gpt-5.6-luna',
    });
    await repository.reloadPrompts(context);
    await repository.commands(undefined, context);
    await repository.dispatchCommand('sess_review', '/review', 'results/stations.csv');

    expect(transport.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      {
        method: 'GET',
        path: '/v1/prompts?session_id=sess_review&workspace_id=ws_science',
      },
      {
        method: 'GET',
        path: '/v1/prompts/science.review?profile=heavy&session_id=sess_review&workspace_id=ws_science',
      },
      { method: 'POST', path: '/v1/prompts/science.review/render' },
      { method: 'POST', path: '/v1/prompts/science.review/validate' },
      { method: 'PUT', path: '/v1/prompts/science.review' },
      { method: 'POST', path: '/v1/prompts/reload' },
      {
        method: 'GET',
        path: '/v1/commands?session_id=sess_review&workspace_id=ws_science',
      },
      {
        method: 'POST',
        path: '/v1/sessions/sess_review/commands/review',
      },
    ]);
    expect(transport.requests[4]?.body).toMatchObject({
      scope: 'workspace',
      workspace_id: 'ws_science',
      session_id: 'sess_review',
      provider: 'codex',
      model: 'gpt-5.6-luna',
    });
    expect(transport.requests[7]?.body).toEqual({
      input: 'results/stations.csv',
      caller: { type: 'user' },
    });
  });
});
