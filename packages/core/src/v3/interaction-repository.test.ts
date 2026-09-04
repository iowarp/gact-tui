import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

describe('ClioRepository normalized interaction contract', () => {
  it('decodes all interaction kinds with ownership and source correlation', async () => {
    const common = {
      attended_session_id: 'sess_root',
      status: 'pending',
      created_at: '2026-09-02T00:00:00Z',
    };
    const transport = new RecordingTransport([
      {
        interactions: [
          {
            ...common,
            id: 'question:q1',
            kind: 'question',
            owner_session_id: 'sess_child',
            title: 'Question from agent',
            prompt: 'Choose a station',
            source: { protocol: 'native' },
            payload: { question_id: 'q1', question_kind: 'choice', options: [] },
            actions: ['answer', 'cancel'],
          },
          {
            ...common,
            id: 'permission:p1',
            kind: 'permission',
            owner_session_id: 'sess_child',
            title: 'Run protected command',
            source: { protocol: 'native', tool_name: 'shell.exec', invocation_id: 'call_1' },
            payload: { permission_id: 'p1', tool_call: { tool_name: 'shell.exec' } },
            actions: ['allow', 'deny'],
          },
          {
            ...common,
            id: 'mcp_task_input:q2',
            kind: 'mcp_task_input',
            owner_session_id: 'sess_child',
            task_id: 'task_1',
            title: 'Task input required',
            source: { protocol: 'mcp', tool_name: 'station.search', invocation_id: 'invoke_1' },
            actions: ['answer', 'cancel'],
          },
          {
            ...common,
            id: 'a2ui:sess_child:surface_1',
            kind: 'a2ui',
            owner_session_id: 'sess_child',
            title: 'Interactive surface',
            source: { protocol: 'native', surface_id: 'surface_1' },
            payload: { revision: 2 },
            actions: ['form.submit'],
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const interactions = await repository.pendingInteractions('root session', true);

    expect(transport.requests[0]?.path).toBe(
      '/v1/sessions/root%20session/interactions?include_children=true&include_recent_resolved=true&resolved_limit=20',
    );
    expect(interactions.map(({ kind }) => kind)).toEqual([
      'question',
      'permission',
      'mcp_task_input',
      'a2ui',
    ]);
    expect(interactions[3]).toMatchObject({
      owner_session_id: 'sess_child',
      attended_session_id: 'sess_root',
      source: { surface_id: 'surface_1' },
    });
  });

  it('decodes form, URL, and agent-routing metadata without making agent work actionable', async () => {
    const transport = new RecordingTransport([
      {
        interactions: [
          {
            id: 'question:agent',
            kind: 'question',
            owner_session_id: 'child',
            attended_session_id: 'root',
            status: 'pending',
            title: 'Question from agent',
            prompt: 'Choose samples',
            requires_human_response: false,
            audience: 'agent',
            routing_state: 'elicitation_routed_to_agent',
            source: { protocol: 'mcp', invocation_id: 'invoke-1' },
            created_at: '2026-09-02T00:00:00Z',
            payload: {
              mode: 'form',
              answer_metadata: { count: 3 },
              fields: [
                {
                  name: 'count',
                  type: 'integer',
                  title: 'Sample count',
                  required: true,
                  default: 3,
                },
              ],
            },
            actions: [],
          },
          {
            id: 'question:url',
            kind: 'question',
            owner_session_id: 'root',
            attended_session_id: 'root',
            status: 'pending',
            title: 'Open link',
            requires_human_response: true,
            source: { protocol: 'mcp' },
            created_at: '2026-09-02T00:00:01Z',
            payload: {
              mode: 'url',
              url: 'https://xn--bcher-kva.example/report',
              container: 'isolated',
              punycode_warning: true,
              punycode_host: 'bücher.example',
              punycode_host_raw: 'xn--bcher-kva.example',
            },
            actions: ['answer', 'cancel'],
          },
        ],
      },
    ]);

    const rows = await new ClioRepository(transport).pendingInteractions('root');

    expect(rows[0]).toMatchObject({
      requires_human_response: false,
      audience: 'agent',
      payload: { answer_metadata: { count: 3 }, fields: [{ type: 'integer' }] },
    });
    expect(rows[1]).toMatchObject({
      requires_human_response: true,
      payload: {
        mode: 'url',
        punycode_warning: true,
        punycode_host_raw: 'xn--bcher-kva.example',
      },
    });
  });

  it('contains one unreadable interaction per item, never failing the whole read', async () => {
    const transport = new RecordingTransport([
      {
        interactions: [
          {
            id: 'question:q1',
            kind: 'question',
            owner_session_id: 'sess_child',
            attended_session_id: 'sess_root',
            status: 'pending',
            title: 'Question from agent',
            source: { protocol: 'native' },
            created_at: '2026-09-02T00:00:00Z',
            actions: ['answer', 'cancel'],
          },
          // Missing the required `title`, `source`, and `created_at` fields —
          // a record no known schema variant can parse.
          {
            id: 'permission:malformed',
            kind: 'permission',
            owner_session_id: 'sess_child',
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const interactions = await repository.pendingInteractions('root session', true);

    expect(interactions).toHaveLength(2);
    expect(interactions[0]).toMatchObject({ id: 'question:q1', kind: 'question' });
    expect(interactions[1]).toMatchObject({
      id: 'permission:malformed',
      kind: 'unknown',
      owner_session_id: 'sess_child',
      status: 'pending',
    });
  });

  it('posts an exact response body to the attended root and encoded interaction id', async () => {
    const transport = new RecordingTransport([{ interaction_id: 'question:q1' }]);
    const repository = new ClioRepository(transport);
    const response = {
      action: 'answer',
      answer: 'Keep the sortable columns visible.',
      selected_options: ['table'],
    };

    await repository.respondInteraction('sess root', 'question:q1', response);

    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/sessions/sess%20root/interactions/question%3Aq1/respond',
      body: response,
    });
  });
});
