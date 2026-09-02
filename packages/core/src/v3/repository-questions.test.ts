import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';

// Split out from repository.test.ts to keep that file under the 800-line
// file-size ceiling (#775) rather than growing an already-large god file.
describe('ClioRepository unscoped question contracts', () => {
  it('reads pending questions from the unscoped endpoint, mirroring pendingApprovals', async () => {
    const transport = new RecordingTransport([
      {
        questions: [
          {
            id: 'question_1',
            session_id: 'sess_background',
            prompt: 'Continue the sweep?',
            status: 'pending',
            kind: 'confirmation',
            options: [],
            created_at: '2026-08-22T00:00:00Z',
            updated_at: '2026-08-22T00:00:00Z',
          },
        ],
      },
    ]);
    const repository = new ClioRepository(transport);

    const questions = await repository.pendingQuestions();

    expect(transport.requests[0]?.path).toBe('/v1/questions?status=pending');
    expect(questions).toEqual([
      expect.objectContaining({ id: 'question_1', session_id: 'sess_background' }),
    ]);
  });

  it('scopes the unscoped question endpoint to one session when asked', async () => {
    const transport = new RecordingTransport([{ questions: [] }]);
    const repository = new ClioRepository(transport);

    await repository.pendingQuestions('sess_1');

    expect(transport.requests[0]?.path).toBe('/v1/questions?session_id=sess_1&status=pending');
  });

  it('lets a missing unscoped questions endpoint surface as a real error instead of an empty result', async () => {
    const transport = new RecordingTransport([new Error('404 Not Found')]);
    const repository = new ClioRepository(transport);

    await expect(repository.pendingQuestions()).rejects.toThrow('404 Not Found');
  });
});
