import { createRoot } from 'react-dom/client';
import { ForcedTheme } from '../../src/theme/forced-theme';
import type { PendingInteraction } from '@clio/core/v3';
import { QuestionResponse } from '../../src/components/clio/pending-interaction-question-response';
import { ClioPendingInteractions } from '../../src/components/clio/pending-interactions';
import '../../src/index.css';

const mode = new URLSearchParams(location.search).get('mode') ?? 'choice';
const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
const tray = new URLSearchParams(location.search).get('tray') === '1';
const question: PendingInteraction = {
  id: 'question:documentation-example',
  kind: 'question',
  owner_session_id: 'documentation-example',
  attended_session_id: 'documentation-example',
  status: 'pending',
  title: 'Choose a comparison',
  prompt:
    'Which comparison should go in the **report**?\n\nCompare **treatment groups** or inspect `leaf_area` over time. Keep the original measurements unchanged.',
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
if (mode === 'confirmation') {
  question.title = 'Keep the table?';
  question.prompt = 'Keep the **missing-value table** in the report?';
  question.payload = {
    question_kind: 'confirmation',
    options: [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ],
  };
} else if (mode === 'freeform') {
  question.title = 'Choose a timezone';
  question.prompt = 'Which **timezone** should I use to interpret the recorded dates?';
  question.payload = { question_kind: 'freeform' };
} else if (mode === 'multi') {
  question.kind = 'mcp_task_input';
  question.source = { protocol: 'mcp' };
  question.title = 'Choose the outputs';
  question.prompt = 'Which **outputs** should the connected tool include? Choose one or both.';
  question.payload = {
    question_kind: 'multi_choice',
    options: [
      {
        label: 'Table',
        value: 'table',
        description: 'Keep the recorded measurements in sortable columns.',
      },
      { label: 'Plot', value: 'plot', description: 'Show the comparison visually.' },
    ],
  };
} else if (mode === 'form') {
  question.kind = 'mcp_task_input';
  question.source = { protocol: 'mcp' };
  question.title = 'Configure the analysis';
  question.prompt = 'The connected tool needs these details for the **comparison**.';
  question.payload = {
    mode: 'form',
    fields: [
      {
        name: 'dates',
        type: 'string',
        title: 'Dates to include',
        required: true,
        default: '9–12 April 2026',
      },
      {
        name: 'grouping',
        type: 'string',
        title: 'Group by',
        enum: ['treatment', 'time'],
        enum_names: ['Treatment groups', 'Changes over time'],
        default: 'treatment',
        required: true,
      },
      {
        name: 'include_missing',
        type: 'boolean',
        title: 'Keep missing measurements visible',
        default: true,
      },
    ],
  };
} else if (mode === 'url') {
  question.source = { protocol: 'mcp' };
  question.title = 'Open a service in your browser';
  question.prompt = 'A connected service asks you to finish **sign-in** in your browser.';
  question.payload = { mode: 'url', url: 'https://example.org/connect' };
}

createRoot(document.getElementById('root')!).render(
  <ForcedTheme theme={theme}>
    <main className="min-h-dvh bg-background p-6 text-foreground">
      <div className="max-w-3xl space-y-4">
        <header>
          <h1 className="text-lg font-semibold">Answer a question</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Seeded interface example. No model analysis was run.
          </p>
        </header>
        {tray ? (
          <ClioPendingInteractions
            interactions={[question]}
            viewedSessionId={question.owner_session_id}
            onResponse={async (_interaction, answer) => {
              document.getElementById('receipt')!.textContent = JSON.stringify(answer);
            }}
          />
        ) : (
          <QuestionResponse
            interaction={question}
            onResponse={async (_interaction, answer) => {
              document.getElementById('receipt')!.textContent = JSON.stringify(answer);
            }}
            showOwner={false}
          />
        )}
        <output className="sr-only" id="receipt" aria-label="Fixture response receipt" />
      </div>
    </main>
  </ForcedTheme>,
);
