import type { Message } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { transcriptMessagePreviews } from './transcript-message-preview';
import { messageMarkIds } from './message-marks';

const message = (id: string, role: Message['role'], text: string): Message => ({
  id,
  role,
  session_id: 'session',
  created_at: '',
  blocks: [{ id, type: 'text', text }],
});

describe('conversation landmark excerpts', () => {
  it('pairs a short prompt with its answer, within its own turn', () => {
    const rows = [
      message('u1', 'user', 'continue'),
      message('a1', 'assistant', '**Calibration complete.**\nAll readings were retained.'),
      message('u2', 'user', 'Try another method'),
      message('a2', 'assistant', 'Offset applied.'),
    ];
    const previews = transcriptMessagePreviews(rows);
    expect(previews.get('u1')).toEqual({
      title: 'continue',
      body: 'Calibration complete.\nAll readings were retained.',
    });
    expect(previews.get('a1')).toEqual({
      title: 'Calibration complete.',
      body: 'All readings were retained.',
    });
    expect(previews.get('u2')?.body).toBe('Offset applied.');
  });
  it('keeps unanswered prompts independent and cleans Markdown into readable text', () => {
    const previews = transcriptMessagePreviews([
      message('u', 'user', '# Compare [stations](https://example.org)\n- Keep the **source**.'),
    ]);
    expect(previews.get('u')).toEqual({ title: 'Compare stations', body: 'Keep the source.' });
  });
  it('preserves file names and identifiers while removing emphasis', () => {
    expect(
      transcriptMessagePreviews([
        message('file', 'assistant', '**Saved** station_counts.csv and `sample_id`.'),
      ]).get('file')?.title,
    ).toBe('Saved station_counts.csv and sample_id.');
  });
  it('bounds title and excerpt together, without duplicating a title boundary', () => {
    const rows = [
      message('long', 'assistant', 'x'.repeat(96) + '\nDetails'),
      message('huge', 'assistant', 'ground truth '.repeat(10000)),
    ];
    const previews = transcriptMessagePreviews(rows);
    expect(previews.get('long')?.body).toBe('Details');
    for (const preview of previews.values()) {
      expect(preview.title.length).toBeLessThanOrEqual(96);
      expect(preview.title.length + preview.body.length).toBeLessThanOrEqual(320);
    }
  });
  it('names a message without text from what it carries, in sentence case', () => {
    const blocks = (id: string, role: Message['role'], body: Message['blocks']): Message => ({
      id,
      role,
      session_id: 'session',
      created_at: '',
      blocks: body,
    });
    const previews = transcriptMessagePreviews([
      blocks('u', 'user', []),
      blocks('a', 'assistant', []),
      blocks('t', 'assistant', [
        { id: 't1', type: 'tool', tool_id: 'x' },
        { id: 't2', type: 'tool', tool_id: 'y' },
        { id: 't3', type: 'subagent', subagent_id: 'z' },
      ] as Message['blocks']),
      blocks('e', 'assistant', [
        { id: 'e1', type: 'error', code: 'x', message: 'Quota exceeded', recoverable: true },
      ] as Message['blocks']),
    ]);
    expect([...previews.values()].map((preview) => preview.title)).toEqual([
      'Error: Quota exceeded',
      'Activity: 2 tools, 1 delegate',
      'Reply',
      'Your message',
    ]);
  });
  it('uses only strictly saved marks from old or malformed metadata', () => {
    expect([
      ...messageMarkIds({ message_marks: { saved: true, removed: false, invalid: 1 } }),
    ]).toEqual(['saved']);
    expect(messageMarkIds({ message_marks: [] }).size).toBe(0);
    expect(messageMarkIds(undefined).size).toBe(0);
  });
});
