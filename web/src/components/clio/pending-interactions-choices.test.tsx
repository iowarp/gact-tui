import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { pending, renderPending } from './pending-interactions.test-helpers';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
  a2uiCatalogs: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

beforeEach(() => {
  repository.a2uiCatalogs.mockResolvedValue({ rows: [CLIO_WORKSPACE_CATALOG_ROW], rejected: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  repository.a2uiAction.mockClear();
  repository.a2uiCatalogs.mockClear();
});


describe('ClioPendingInteractions answers a short choice on its buttons', () => {
  // Live 2026-11-19: this consent was a radio list, a "Choice" heading and Send response.
  it('answers a form that is one short choice with one button per option', async () => {
    const user = userEvent.setup();
    const interaction = pending('mcp_task_input', {
      prompt: 'Allow searches through the literature sources?',
      requires_human_response: true,
      actions: ['answer', 'cancel'],
      payload: {
        mode: 'form',
        fields: [
          {
            name: 'choice',
            type: 'string',
            title: 'Choice',
            enum: ['approve', 'decline'],
            enum_names: [
              'Allow searches through the literature sources',
              "Don't use the literature sources",
            ],
            default: 'approve',
            required: true,
          },
        ],
      },
    });
    const onResponse = renderPending([interaction]);

    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send response' })).toBeNull();
    expect(
      screen.getByRole('button', { name: /Allow searches through the literature sources/u }),
    ).toBeVisible();
    // Like yes/no, Enter gives no consent the person did not choose.
    screen
      .getByRole('button', { name: /Allow searches through the literature sources/u })
      .closest<HTMLElement>('[data-slot="ask-card"]')!
      .focus();
    await user.keyboard('{Enter}');
    expect(onResponse).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Don't use the literature sources/u }));
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      metadata: { choice: 'decline' },
    });
  });

  it('renders structured defaults and submits the complete field map', async () => {
    const user = userEvent.setup();
    const interaction = pending('mcp_task_input', {
      prompt: 'Configure the analysis',
      requires_human_response: true,
      actions: ['answer', 'cancel'],
      payload: {
        mode: 'form',
        answer_metadata: { count: 3, method: 'robust', include_uncertain: true },
        fields: [
          {
            name: 'count',
            type: 'integer',
            title: 'Sample count',
            required: true,
            default: 2,
          },
          {
            name: 'method',
            type: 'string',
            title: 'Method',
            enum: ['fast', 'robust'],
            enum_names: ['Fast', 'Robust'],
            required: true,
          },
          {
            name: 'include_uncertain',
            type: 'boolean',
            title: 'Include uncertain samples',
          },
          {
            name: 'outputs',
            type: 'array',
            item_type: 'string',
            title: 'Outputs',
            enum: ['table', 'plot'],
            multi: true,
            min_items: 1,
            max_items: 2,
            required: true,
          },
        ],
      },
    });
    const onResponse = renderPending([interaction]);

    expect(screen.getByLabelText('Sample count')).toHaveValue(3);
    expect(screen.getByRole('radio', { name: 'Robust' })).toBeChecked();
    // The server's prefill must not answer a yes/no field for the person.
    expect(screen.getByRole('radio', { name: 'Yes' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'No' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Send response' }));
    expect(screen.getByText('Choose at least 1.')).toBeVisible();
    expect(onResponse).not.toHaveBeenCalled();
    // The field to fix takes focus, so it is in view even under the card's cap.
    expect(screen.getByRole('checkbox', { name: 'table' })).toHaveFocus();

    await user.click(screen.getByRole('checkbox', { name: 'table' }));
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.clear(screen.getByLabelText('Sample count'));
    await user.type(screen.getByLabelText('Sample count'), '7');
    await user.click(screen.getByRole('button', { name: 'Send response' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      metadata: {
        count: 7,
        method: 'robust',
        include_uncertain: true,
        outputs: ['table'],
      },
    });
  });

  it('answers an approval with a folded setting on its buttons, sending the setting too', async () => {
    const user = userEvent.setup();
    const approval = pending('question', {
      source: { protocol: 'mcp', tool_name: 'mcp_elicitation' },
      prompt: 'Start the pipeline as a service?',
      requires_human_response: true,
      actions: ['answer', 'cancel'],
      payload: {
        mode: 'form',
        question_kind: 'freeform',
        answer_metadata: { running_services: 'keep them running' },
        fields: [
          {
            name: 'approve',
            type: 'string',
            title: 'Answer',
            enum: ['approve', 'decline'],
            enum_names: ['Approve', 'Decline'],
            required: true,
          },
          {
            name: 'running_services',
            type: 'string',
            title: "The site's running services",
            description: 'A service of relay still runs on Ares.',
            enum: ['end them when this job is submitted', 'keep them running'],
            default: 'keep them running',
          },
        ],
      },
    });
    const onResponse = renderPending([approval]);

    expect(screen.queryByRole('button', { name: 'Send response' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'keep them running' })).toBeChecked();
    expect(screen.getByText('A service of relay still runs on Ares.')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'end them when this job is submitted' }));
    await user.click(screen.getByRole('button', { name: /Approve/u }));
    expect(onResponse).toHaveBeenCalledWith(approval, {
      action: 'answer',
      metadata: { approve: 'approve', running_services: 'end them when this job is submitted' },
    });
  });

  it('never answers a yes/no approval until the person chooses Yes or No', async () => {
    const user = userEvent.setup();
    const approval = pending('question', {
      source: { protocol: 'mcp', tool_name: 'mcp_elicitation' },
      prompt: 'Start the pipeline as a service? It may use up to 1 node-hours.',
      requires_human_response: true,
      actions: ['answer', 'cancel'],
      payload: {
        mode: 'form',
        question_kind: 'confirmation',
        answer_metadata: { approve: false },
        fields: [
          { name: 'approve', type: 'boolean', title: 'Approve', default: false, required: true },
        ],
      },
    });
    const onResponse = renderPending([approval]);
    const approvalCard = () =>
      screen.getByRole('button', { name: 'Yes' }).closest<HTMLElement>('[data-slot="ask-card"]')!;

    // The incident: a click aimed at a prior card's "Send response" landed on this one.
    expect(screen.queryByRole('button', { name: 'Send response' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    approvalCard().focus();
    await user.keyboard('{Enter}');
    expect(onResponse).not.toHaveBeenCalled();

    // 1 and 2 are the person's explicit Yes and No.
    await user.keyboard('2');
    expect(onResponse).toHaveBeenLastCalledWith(approval, {
      action: 'answer',
      metadata: { approve: false },
    });
    approvalCard().focus();
    await user.keyboard('1');
    expect(onResponse).toHaveBeenLastCalledWith(approval, {
      action: 'answer',
      metadata: { approve: true },
    });

    await user.click(screen.getByRole('button', { name: 'No' }));
    expect(onResponse).toHaveBeenLastCalledWith(approval, {
      action: 'answer',
      metadata: { approve: false },
    });
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onResponse).toHaveBeenLastCalledWith(approval, {
      action: 'answer',
      metadata: { approve: true },
    });
  });
});
