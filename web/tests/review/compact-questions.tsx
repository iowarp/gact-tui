import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ForcedTheme } from '../../src/theme/forced-theme';
import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { QuestionResponse } from '../../src/components/clio/pending-interaction-question-response';
import '../../src/index.css';

const question: PendingInteraction = {
  id: 'question:review',
  kind: 'question',
  owner_session_id: 'review',
  attended_session_id: 'review',
  status: 'pending',
  title: 'Choose a comparison',
  prompt:
    'Which comparison should go in the **report**?\n\nKeep the original measurements unchanged. I can compare **treatment groups** or inspect `leaf_area` over time. The difference is \\(\\Delta A=A_2-A_1\\).',
  source: { protocol: 'native' },
  created_at: '2026-10-13T00:00:00Z',
  actions: ['answer', 'cancel'],
  payload: {
    question_kind: 'choice',
    allow_freeform: true,
    options: [
      {
        label: 'Treatment groups',
        value: 'treatment',
        description: 'Compare **control** and treated plants.',
      },
      {
        label: 'Changes over time',
        value: 'time',
        description: 'Use the recorded `leaf_area` measurements.',
      },
    ],
  },
};

function Review() {
  const [multi, setMulti] = useState(false);
  const [response, setResponse] = useState<PendingInteractionResponse>();
  const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
  return (
    <ForcedTheme theme={theme}>
      <main className="min-h-dvh bg-background p-4 text-foreground">
        <div className="mx-auto max-w-3xl space-y-4">
          <header>
            <h1 className="text-lg font-semibold">Answer a question</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Interface example with a seeded question. No model analysis was run.
            </p>
          </header>
          <QuestionResponse
            key={String(multi)}
            interaction={{
              ...question,
              payload: { ...question.payload, question_kind: multi ? 'multi_choice' : 'choice' },
            }}
            onResponse={async (_interaction, answer) => {
              setResponse(answer);
            }}
            showOwner={false}
          />
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => {
              setMulti((value) => !value);
              setResponse(undefined);
            }}
            type="button"
          >
            {multi ? 'Show single choice' : 'Show multiple choice'}
          </button>
          {response ? (
            <pre
              aria-label="Submitted response"
              className="whitespace-pre-wrap rounded-md border p-3 text-xs"
            >
              {JSON.stringify(response, null, 2)}
            </pre>
          ) : null}
        </div>
      </main>
    </ForcedTheme>
  );
}

createRoot(document.getElementById('root')!).render(<Review />);
