import { flowOutcomeSchema } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { FlowStall } from './flow-run-parts';

afterEach(cleanup);

// Live 2026-11-17: a planner parse error's message carried the model's whole reply, and
// the run card's headline was 2,000 characters of JSON that stopped mid-object.
const reply = `{"directions": [${'{"focus": "occurrence in drinking water"}, '.repeat(60)}`;
const parseError = flowOutcomeSchema.parse({
  reason: 'flow_error',
  error: 'AdapterParseError',
  message: `The planner's reply could not be read as a plan.\n\nLM Response: ${reply}`,
  message_truncated_chars: 1180,
});

it('headlines an error by its first line and keeps the full message in Details', async () => {
  render(<FlowStall cancelled={false} details onOpenHandle={vi.fn()} outcome={parseError} />);
  const headline = document.querySelector('[data-slot="flow-stall-headline"]')!;
  expect(headline).toHaveTextContent("The planner's reply could not be read as a plan.");
  expect(headline.textContent).not.toContain('LM Response');
  expect(headline.className).toContain('line-clamp-2');
  expect(screen.getByText('The flow hit an error:')).toBeVisible();

  await userEvent.click(screen.getByText('Details'));
  expect(screen.getByText('AdapterParseError')).toBeVisible();
  expect(
    screen.getByText('Message (the record kept its start; 1,180 more characters were cut)'),
  ).toBeVisible();
  expect(screen.getByText(/LM Response: \{"directions"/u)).toBeVisible();
});

it('keeps a one-line message as the headline without repeating it in Details', async () => {
  const stall = flowOutcomeSchema.parse({
    reason: 'flow_stall',
    message: 'No researcher returned a finding.',
  });
  render(<FlowStall cancelled={false} details onOpenHandle={vi.fn()} outcome={stall} />);
  expect(screen.getByText('No researcher returned a finding.')).toBeVisible();
  await userEvent.click(screen.getByText('Details'));
  expect(screen.queryByText('Message')).toBeNull();
  expect(screen.getAllByText('No researcher returned a finding.')).toHaveLength(1);
});
