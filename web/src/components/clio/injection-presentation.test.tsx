import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import '@/components/ai-elements/markdown';
import { HarnessInjection } from './conversation-harness-injection';
import { injectionPresentation } from './injection-presentation';

afterEach(cleanup);

it('shows committed question answers as readable text while retaining the exact reply', async () => {
  const user = userEvent.setup();
  const reply = {
    schema_version: 1,
    answer: 'What times work?\n09:00–16:00.\n\nWhich format?\nLocal.',
    metadata: { answers: { hours: { answer: '09:00–16:00.' }, format: { answer: 'Local.' } } },
    responder_human: 'human_id',
  };
  const text = `[CLIO; question_answer; Question task_question: completed; notification mail_question]\n${JSON.stringify(reply)}`;
  const { container } = render(
    <HarnessInjection
      block={{ id: 'answer', type: 'injection', source: 'question_answer', text }}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Injection Your answers' }));
  expect(container.textContent).toContain('What times work?');
  expect(container.textContent).toContain('09:00–16:00.');
  expect(container.textContent).not.toContain('schema_version');
  expect(container.textContent).not.toContain('responder_human');
  expect(container.querySelector('[data-slot="harness-injection"] pre')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Technical details for Your answers' }));
  expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(text);
});

it('shows selections and declines without serializing their bookkeeping', () => {
  const header =
    '[CLIO; question_answer; Question task_question: completed; notification mail_question]\n';
  expect(
    injectionPresentation(
      'question_answer',
      header + JSON.stringify({ selected_options: ['Local'] }),
    ),
  ).toMatchObject({ label: 'Your answer', text: 'Selected: Local', format: 'text' });
  expect(
    injectionPresentation('question_answer', header + JSON.stringify({ action: 'decline' })),
  ).toMatchObject({ text: 'You declined to answer.' });
});

function notification(kind: string, value: unknown, status = 'completed'): string {
  return `[CLIO; task_result; ${kind} task_example: ${status}; notification outcome:example]\n${JSON.stringify(value)}`;
}

const shell = {
  command: 'cat report.py',
  stdout: 'import json\nprint("result")\n',
  stderr: 'A recorded warning\n',
  exit_code: 0,
  timed_out: false,
};

it('unwraps canonical shell output once, preserving real newlines and errors', () => {
  const value = injectionPresentation(
    'task_result',
    notification('Shell', {
      task_id: 'native-id',
      result_type: 'complete',
      result: {
        structuredContent: shell,
        content: [{ type: 'text', text: JSON.stringify(shell) }],
      },
    }),
  );
  expect(value?.label).toBe('Shell completed');
  expect(value?.terminal?.command).toBe('cat report.py');
  expect(value?.terminal?.text).toBe(
    'import json\nprint("result")\n\n\nStandard error:\nA recorded warning\n',
  );
  expect(value?.terminal?.exit_code).toBe(0);
  expect(value?.terminal?.text).not.toContain('structuredContent');
});

it('uses the recorded logical failure even when native transport completed', () => {
  const value = injectionPresentation(
    'task_result',
    notification(
      'Shell',
      { result_type: 'complete', result: { structuredContent: { ...shell, exit_code: 1 } } },
      'failed',
    ),
  );
  expect(value?.label).toBe('Shell failed');
  expect(value?.terminal?.exit_code).toBe(1);
});

it('retains explicit truncation and timeout information', () => {
  const value = injectionPresentation(
    'task_result',
    notification('Shell', {
      ...shell,
      stdout_truncated: true,
      timed_out: true,
    }),
  );
  expect(value?.notice).toContain('truncated');
  expect(value?.terminal?.timed_out).toBe(true);
});

it('reads a text-only MCP result without requiring structured content', () => {
  expect(
    injectionPresentation(
      'task_result',
      notification('MCP', {
        result_type: 'complete',
        result: { content: [{ type: 'text', text: '**Report ready.**' }] },
      }),
    ),
  ).toEqual({ label: 'MCP completed', text: '**Report ready.**', format: 'markdown' });
});

it('formats structured MCP output without duplicating its text encoding', () => {
  const value = injectionPresentation(
    'task_result',
    notification('MCP', {
      result_type: 'complete',
      result: {
        structuredContent: { count: 48, paths: ['a', 'b'] },
        content: [{ type: 'text', text: 'duplicate encoding' }],
      },
    }),
  );
  expect(value?.text).toBe('{\n  "count": 48,\n  "paths": [\n    "a",\n    "b"\n  ]\n}');
  expect(value?.format).toBe('json');
});

it('keeps native failures with no result readable', () => {
  expect(
    injectionPresentation(
      'task_result',
      notification(
        'MCP',
        {
          result_type: 'error',
          result: null,
          error: 'Connection lost.',
        },
        'failed',
      ),
    )?.text,
  ).toBe('Connection lost.');
});

it.each([
  'unstructured historical result',
  '[CLIO; task_result; Shell task_x: completed]\n{broken',
  '[CLIO; peer; Shell task_x: completed]\n{"stdout":"unrelated"}',
])('retains unrecognized or malformed evidence without guessing: %s', (text) => {
  expect(injectionPresentation('task_result', text)).toBeNull();
});

it('shows the result readably and keeps the exact envelope behind a separate control', async () => {
  const user = userEvent.setup();
  const text = notification('Shell', {
    result_type: 'complete',
    result: { structuredContent: shell },
  });
  const { container } = render(
    <HarnessInjection block={{ id: 'result', type: 'injection', source: 'task_result', text }} />,
  );
  expect(screen.queryByText(/import json/u)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Injection Shell completed' }));
  expect(screen.getByLabelText('Command output').textContent).toContain(
    'import json\nprint("result")',
  );
  expect(container.textContent).not.toContain('result_type');
  expect(container.querySelectorAll('[data-slot="run-command"]')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Technical details for Shell completed' }));
  expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(text);
});

it('renders peer message content while retaining sender and reply metadata in exact details', async () => {
  const user = userEvent.setup();
  const text =
    '[Agent session sess_peer; peer; notification mail_example]\n' +
    JSON.stringify({ text: 'Please keep **accessibility support**.', reply_to: 'mail_original' });
  render(<HarnessInjection block={{ id: 'peer', type: 'injection', source: 'peer', text }} />);
  await user.click(screen.getByRole('button', { name: 'Received message from an agent' }));
  expect(screen.queryByText('From session sess_peer')).toBeNull();
  expect(await screen.findByText('accessibility support')).toHaveAttribute(
    'data-streamdown',
    'strong',
  );
  expect(screen.queryByText(/reply_to/u)).toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'Technical details for Received message from an agent' }),
  );
  expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(text);
});

it('keeps unknown task envelopes in the normal info control, reachable before expansion', async () => {
  const user = userEvent.setup();
  const text = '[CLIO; task_result; MCP task_old: failed]\n{unknown historical body';
  const { container } = render(
    <HarnessInjection
      block={{ id: 'historical', type: 'injection', source: 'task_result', text }}
    />,
  );
  const info = screen.getByRole('button', { name: 'Technical details for Task result' });
  expect(screen.queryByRole('button', { name: 'Open exact details' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Injection Task result' }));
  expect(container.textContent).not.toContain('unknown historical body');
  info.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(text);
});
