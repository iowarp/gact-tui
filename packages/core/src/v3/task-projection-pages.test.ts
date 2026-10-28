import { describe, expect, it } from 'vitest';
import { ClioRepository } from './repository.js';
import { RecordingTransport } from './recording-transport.test-helper.js';

describe('task compatibility projection pages', () => {
  it.each(['processes', 'agents', 'questions', 'global-questions'] as const)(
    '%s array reads follow empty continuation pages and preserve cancellation signals',
    async (kind) => {
      const key = kind === 'processes' ? 'processes' : kind === 'agents' ? 'tasks' : 'questions';
      const row =
        kind === 'processes'
          ? {
              kind: 'mcp',
              id: 'display',
              handle: 'original-handle',
              title: 'Work',
              live_state: 'working',
              status: 'working',
            }
          : kind === 'agents'
            ? {
                task_id: 'original-handle',
                parent_session_id: 'sess 1',
                child_session_id: 'child',
                status: 'active',
              }
            : {
                id: 'original-handle',
                session_id: 'sess 1',
                prompt: 'Choose',
                status: 'pending',
                kind: 'confirmation',
                options: [],
                created_at: '',
                updated_at: '',
              };
      const transport = new RecordingTransport([
        { [key]: [], cursor: 'next page', total: null, revision: 4 },
        { [key]: [row], cursor: null, total: null, revision: 5 },
      ]);
      const repository = new ClioRepository(transport);
      const signal = new AbortController().signal;
      const rows =
        kind === 'processes'
          ? await repository.asyncProcesses('sess 1', signal)
          : kind === 'agents'
            ? await repository.sessionAgentTasks('sess 1', signal)
            : kind === 'questions'
              ? await repository.questions('sess 1', signal, 'pending')
              : await repository.pendingQuestions('sess 1', signal);
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).toContain('original-handle');
      expect(transport.requests).toHaveLength(2);
      expect(transport.requests.every((request) => request.signal === signal)).toBe(true);
      const next = new URL(transport.requests[1]!.path, 'http://service');
      expect(next.searchParams.get('cursor')).toBe('next page');
      if (kind.includes('questions')) expect(next.searchParams.get('status')).toBe('pending');
      if (kind === 'global-questions') expect(next.searchParams.get('session_id')).toBe('sess 1');
      else expect(next.pathname).toContain('sess%201');
    },
  );

  it('returns a bounded page with continuation and unknown total without reading history', async () => {
    const transport = new RecordingTransport([
      { processes: [], cursor: 'continue', total: null, revision: 7 },
    ]);
    const repository = new ClioRepository(transport);
    const signal = new AbortController().signal;
    await expect(
      repository.asyncProcessesPage(
        'sess',
        { cursor: 'before', limit: 3, activeOnly: true, includeDescendants: false },
        signal,
      ),
    ).resolves.toEqual({ items: [], cursor: 'continue', total: null, revision: 7 });
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]!.path).toBe(
      '/v1/sessions/sess/async-processes?cursor=before&limit=3&active_only=true&include_descendants=false',
    );
    expect(transport.requests[0]!.signal).toBe(signal);
  });

  it('requests descendants only for an explicit full-tree inspection', async () => {
    const transport = new RecordingTransport([{ processes: [], cursor: null }]);
    const repository = new ClioRepository(transport);
    await repository.asyncProcessesPage('parent', { includeDescendants: true });
    expect(transport.requests[0]!.path).toBe(
      '/v1/sessions/parent/async-processes?include_descendants=true',
    );
  });

  it('rejects a repeated cursor instead of looping or silently truncating', async () => {
    const transport = new RecordingTransport([
      { processes: [], cursor: 'stuck' },
      { processes: [], cursor: 'stuck' },
    ]);
    await expect(new ClioRepository(transport).asyncProcesses('sess')).rejects.toThrow(
      'did not advance',
    );
    expect(transport.requests).toHaveLength(2);
  });

  it('propagates later-page failure rather than claiming a complete empty list', async () => {
    const transport = new RecordingTransport([
      { questions: [], cursor: 'next' },
      new Error('page unavailable'),
    ]);
    await expect(new ClioRepository(transport).pendingQuestions()).rejects.toThrow(
      'page unavailable',
    );
    expect(transport.requests).toHaveLength(2);
  });
});
