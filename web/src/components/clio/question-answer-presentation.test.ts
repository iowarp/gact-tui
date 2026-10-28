import type { PendingInteraction } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { questionAnswerPresentation } from './question-answer-presentation';
import { injectionPresentation } from './injection-presentation';

const question: PendingInteraction = {
  id: 'question:task_question',
  kind: 'question',
  task_id: 'task_question',
  owner_session_id: 's',
  attended_session_id: 's',
  status: 'answered',
  title: 'Choose how to proceed',
  prompt: 'Which execution mode should we use?',
  source: { protocol: 'native' },
  actions: [],
  created_at: '',
  payload: { options: [{ value: 'auto', label: 'Automatic' }] },
};

it('preserves both the selected option label and extra answer text using the actual question', () => {
  const raw =
    '[CLIO; question_answer; Question task_question: completed; notification m]\n' +
    JSON.stringify({ selected_options: ['auto'], answer: 'Only for these files.' });
  const result = injectionPresentation('question_answer', raw, [question]);
  expect(result?.text).toContain('Which execution mode should we use?');
  expect(result?.text).toContain('Selected: Automatic');
  expect(result?.text).toContain('Only for these files.');
  expect(result?.text).not.toContain('Selected: auto');
});

it('identifies attachment-only answers without dumping the reference or claiming no answer', () => {
  const result = questionAnswerPresentation({
    parts: [
      { type: 'resource_link', name: 'survey.csv', mime_type: 'text/csv', uri: 'artifact:survey' },
    ],
  });
  expect(result.text).toBe('Attachment: survey.csv (text/csv)');
  expect(result.text).not.toContain('No answer');
});

it('pairs every structured bundle answer with its own prompt and keeps shared attachments', () => {
  const bundled: PendingInteraction = {
    ...question,
    title: 'Workshop constraints',
    prompt: '',
    payload: {
      metadata: {
        question_bundle: {
          questions: [
            { id: 'a', question: 'Which start time?', options: [] },
            {
              id: 'b',
              question: 'Which format?',
              options: [{ value: 'local', label: 'Local Python' }],
            },
          ],
        },
      },
    },
  };
  const result = questionAnswerPresentation(
    {
      metadata: {
        answers: {
          a: { answer: '09:00' },
          b: { selected_options: ['local'], answer: 'No internet.' },
        },
      },
      parts: [{ type: 'image', name: 'room.png', media_type: 'image/png' }],
    },
    bundled,
  );
  expect(result.label).toBe('Your answers');
  expect(result.text).toContain('Which start time?\n09:00');
  expect(result.text).toContain('Which format?\nSelected: Local Python\n\nNo internet.');
  expect(result.text).toContain('Attachment: room.png');
});
