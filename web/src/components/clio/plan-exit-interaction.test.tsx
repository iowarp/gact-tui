import type { Artifact, PendingInteraction, Session } from '@clio/core/v3';
import { cleanup, render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadMarkdownText } from '@/components/ai-elements/markdown-text-loader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useLiveStore } from '@/store/live-store';
import { PlanExitResponse } from './plan-exit-interaction';

function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: TooltipProvider });
}

beforeAll(async () => {
  await loadMarkdownText();
}, 60_000);

afterEach(() => {
  cleanup();
  useLiveStore.getState().reset();
  vi.restoreAllMocks();
});

const PLAN = [
  '# Soil moisture regrid',
  '',
  'Regrid SMAP L3 for 2020–2023 to 0.25°.',
  '',
  '## Steps',
  '',
  '1. Fix the grid bounds in `align_grids.sh`',
  '2. Regrid 2020–2023 on four ranks',
  '3. Check the 14 Opal sites against the probes',
  '4. Write `out/qc.csv` and a summary plot',
  '',
  '## Risks',
  '',
  '- Two sites sit on a grid edge.',
  '- 2020 granules use the older QC flags.',
].join('\n');

function planInteraction(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: 'question:plan_exit',
    kind: 'question',
    owner_session_id: 'sess_root',
    attended_session_id: 'sess_root',
    status: 'pending',
    title: 'Review execution plan',
    prompt: 'Approve the saved plan?',
    source: { protocol: 'native', tool_name: 'plan_exit' },
    created_at: '2026-09-02T00:00:00Z',
    actions: ['answer', 'cancel'],
    payload: {
      options: [
        { label: 'Approve — ask first', value: 'ask' },
        { label: 'Approve — workspace edits', value: 'auto-edits' },
        { label: 'Approve — AI review', value: 'ai-review' },
        { label: 'Approve — SPOTTER review', value: 'spotter-ai' },
        { label: 'Approve — bypass checks', value: 'bypass' },
        { label: 'Exit plan mode only', value: 'exit_only' },
        { label: 'Reject — keep planning', value: 'reject' },
        { label: 'Also clear context (modifier)', value: 'clear_context' },
      ],
      plan_exit: {
        recommended_mode: 'interactive',
        default_option: 'ask',
        plan_file: 'D:/workspace/plans/soil-regrid.md',
        plan_content: PLAN,
        plan_content_status: 'complete',
      },
    },
    ...overrides,
  };
}

/** A card from before plans ran in a confirmation policy. */
function legacyInteraction(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  const base = planInteraction();
  return planInteraction({
    ...overrides,
    payload: {
      ...base.payload,
      options: [
        { label: 'Approve — auto-execute', value: 'auto' },
        { label: 'Approve — interactive', value: 'interactive' },
        { label: 'Exit plan mode only', value: 'exit_only' },
        { label: 'Reject — keep planning', value: 'reject' },
        { label: 'Also clear context (modifier)', value: 'clear_context' },
      ],
      plan_exit: { ...base.payload!.plan_exit, recommended_mode: 'interactive' },
      ...overrides.payload,
    },
  });
}

function withPlan(
  plan: NonNullable<NonNullable<PendingInteraction['payload']>['plan_exit']>,
  overrides: Partial<PendingInteraction> = {},
) {
  const base = planInteraction();
  return planInteraction({ ...overrides, payload: { ...base.payload, plan_exit: plan } });
}

function card() {
  return document.querySelector<HTMLElement>('[data-slot="ask-card"]')!;
}

// user-event is slow on a busy machine.
describe('PlanExitResponse', { timeout: 30_000 }, () => {
  it('previews the plan, says what it holds, and executes in the mode chosen inside the button', async () => {
    const user = userEvent.setup();
    const interaction = planInteraction();
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );

    expect(card()).toHaveAttribute('data-ask-kind', 'plan');
    expect(card()).toHaveAttribute('id', expect.stringContaining('plan_exit'));
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeVisible();
    expect(screen.getByText('plans/soil-regrid.md')).toHaveAttribute(
      'title',
      'D:/workspace/plans/soil-regrid.md',
    );
    expect(
      await screen.findByRole('heading', { name: 'Soil moisture regrid' }, { timeout: 10_000 }),
    ).toBeVisible();
    // The glance runs from the summary into the numbered steps; the outline still counts them.
    expect(screen.queryByRole('heading', { name: 'Steps' })).not.toBeInTheDocument();
    expect(screen.getByText('4 steps, execution recommendation, 2 risks')).toBeVisible();
    expect(screen.getByText('Plan ready')).toBeVisible();
    // The recommendation is the default; the trigger names it.
    await user.click(screen.getByRole('button', { name: 'Execution mode, Ask first' }));
    // The confirmation policies read as in the composer, then Exit Plan mode only.
    expect(screen.getByText('Confirmation policy')).toBeVisible();
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'Ask firstAsk before edits or commands.Recommended',
      'Workspace editsEdit files without asking.',
      'AI reviewLet AI review each action.',
      'SPOTTER reviewAn AI agent watches the session.',
      'Bypass checks…Run without asking.',
      'Exit Plan mode only',
    ]);
    await user.click(screen.getByRole('menuitemradio', { name: /^Workspace edits/u }));
    expect(screen.getByRole('button', { name: 'Execution mode, Workspace edits' })).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: /Clear context first/u }));
    await user.click(screen.getByRole('button', { name: 'Execute plan' }));

    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['auto-edits', 'clear_context'],
    });
  });

  it('answers to the card keys: C toggles clear context, Enter executes', async () => {
    const user = userEvent.setup();
    const interaction = planInteraction();
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );
    card().focus();
    await user.keyboard('c');
    expect(screen.getByRole('checkbox', { name: /Clear context first/u })).toBeChecked();
    card().focus();
    await user.keyboard('{Enter}');
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['ask', 'clear_context'],
    });
  });

  it("falls back to the conversation's own confirmation policy", async () => {
    const user = userEvent.setup();
    useLiveStore.getState().replaceSnapshots({
      sessions: { sess_root: { id: 'sess_root', approval_mode: 'ai-review' } as Session },
    });
    // A card from a service that does not name the pre-plan mode.
    const base = planInteraction();
    const interaction = planInteraction({
      payload: {
        ...base.payload,
        plan_exit: { ...base.payload!.plan_exit, default_option: undefined },
      },
    });
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );
    expect(screen.getByRole('button', { name: 'Execution mode, AI review' })).toBeVisible();
    card().focus();
    await user.keyboard('{Enter}');
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['ai-review'],
    });
  });

  it('starts in the mode the conversation had before planning, not the hint', async () => {
    const user = userEvent.setup();
    useLiveStore.getState().replaceSnapshots({
      sessions: { sess_root: { id: 'sess_root', approval_mode: 'ask' } as Session },
    });
    const base = planInteraction();
    const interaction = planInteraction({
      payload: {
        ...base.payload,
        plan_exit: {
          ...base.payload!.plan_exit,
          default_option: 'auto-edits',
          recommended_mode: 'exit_only',
        },
      },
    });
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Execution mode, Workspace edits' }));
    // The agent's hint is shown where it points, and never chosen for the person.
    expect(screen.getByRole('menuitemradio', { name: /^Exit Plan mode only/u })).toHaveTextContent(
      'Exit Plan mode onlyRecommended',
    );
  });

  it("keeps an older card's Auto-execute and Interactive modes", async () => {
    const user = userEvent.setup();
    useLiveStore.getState().replaceSnapshots({
      sessions: { sess_root: { id: 'sess_root', approval_mode: 'ai-review' } as Session },
    });
    const interaction = legacyInteraction();
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Execution mode, Interactive' }));
    expect(screen.queryByText('Confirmation policy')).not.toBeInTheDocument();
    // Interactive leads, as on the cards these modes come from; the menu fits its words.
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'InteractiveRecommended',
      'Auto-execute',
      'Exit Plan mode only',
    ]);
    expect(screen.getByRole('menu')).not.toHaveClass('w-[24rem]');
    await user.click(screen.getByRole('menuitemradio', { name: 'Auto-execute' }));
    await user.click(screen.getByRole('button', { name: 'Execute plan' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['auto'],
    });
  });

  it('asks before running with checks bypassed, as the composer does', async () => {
    const user = userEvent.setup();
    const interaction = planInteraction();
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Execution mode, Ask first' }));
    await user.click(screen.getByRole('menuitemradio', { name: /^Bypass checks…/u }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Bypass protected-action checks?',
    });
    expect(onResponse).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep asking' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Execution mode, Ask first' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Execution mode, Ask first' }));
    await user.click(screen.getByRole('menuitemradio', { name: /^Bypass checks…/u }));
    await user.click(await screen.findByRole('button', { name: 'Bypass checks' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Execute plan' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Execution mode, Bypass checks' })).toBeVisible();
    expect(onResponse).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Execute plan' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['bypass'],
    });
  });

  it('offers SPOTTER review only where the service can arm it', async () => {
    const user = userEvent.setup();
    useLiveStore.getState().replaceSnapshots({
      sessions: { sess_root: { id: 'sess_root', approval_mode: 'spotter-ai' } as Session },
    });
    const interaction = planInteraction();
    render(
      <PlanExitResponse
        interaction={interaction}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
        spotterAvailability={{
          available: false,
          reason: 'watcher_missing',
          message: 'No SPOTTER watcher is installed.',
          remedy: '',
          verified: 'static',
        }}
      />,
    );
    // The conversation's SPOTTER review cannot run here, so Ask first stands in.
    await user.click(screen.getByRole('button', { name: 'Execution mode, Ask first' }));
    const spotter = screen.getByRole('menuitemradio', { name: /^SPOTTER review/u });
    expect(spotter).toHaveAttribute('aria-disabled', 'true');
    expect(spotter).toHaveTextContent('SPOTTER reviewNot available here.');
    expect(spotter).toHaveAttribute('title', 'No SPOTTER watcher is installed.');
  });

  it('requests changes with a one-line note that survives closing it', async () => {
    const user = userEvent.setup();
    const interaction = planInteraction();
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request changes' }));
    const note = screen.getByRole('textbox', { name: 'What should change?' });
    await waitFor(() => expect(note).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.type(note, 'Add rollback steps.');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request changes' })).toHaveFocus();
    expect(onResponse).not.toHaveBeenCalled();
    await user.keyboard('2');
    expect(screen.getByRole('textbox')).toHaveValue('Add rollback steps.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      answer: 'Add rollback steps.',
      selected_options: ['reject'],
    });
  });

  it('never executes an unavailable plan but can still leave Plan mode', async () => {
    const user = userEvent.setup();
    const interaction = withPlan(
      {
        summary: 'Plan review failed to load.',
        plan_file: 'D:/workspace/plans/plan.md',
        plan_content_status: 'unavailable',
        plan_content_error: 'File not found',
      },
      { actions: ['answer'] },
    );
    const onResponse = vi.fn(async () => undefined);
    render(
      <PlanExitResponse interaction={interaction} onResponse={onResponse} showOwner={false} />,
    );

    expect(screen.getByText('Plan unavailable')).toBeVisible();
    expect(screen.getByText(/saved plan could not be loaded/iu)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Execute plan' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Execution mode, Ask first' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Exit Plan mode only' }));
    await user.click(screen.getByRole('button', { name: 'Leave Plan mode' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['exit_only'],
    });
  });

  it('says when the plan is still being written or cut short', () => {
    const { unmount } = render(
      <PlanExitResponse
        interaction={withPlan({ summary: 'Drafting' })}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
      />,
    );
    expect(screen.getByText('Plan still writing…')).toBeVisible();
    expect(screen.getByText('The agent is still writing the plan.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Execute plan' })).toBeDisabled();
    unmount();

    render(
      <PlanExitResponse
        interaction={withPlan({
          plan_content: '# Long plan',
          plan_content_status: 'truncated',
          plan_content_chars: 4800,
          plan_content_included_chars: 1200,
        })}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
      />,
    );
    expect(screen.getByText('Plan truncated')).toBeVisible();
    expect(screen.getByText('Showing 1,200 of 4,800 characters')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Execute plan' })).toBeDisabled();
  });

  it('opens the saved plan beside the conversation with O', async () => {
    const user = userEvent.setup();
    const onOpenArtifact = vi.fn();
    const artifact = { artifact_id: 'plan_v1' } as unknown as Artifact;
    render(
      <PlanExitResponse
        artifact={artifact}
        interaction={planInteraction()}
        onOpenArtifact={onOpenArtifact}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
      />,
    );
    card().focus();
    await user.keyboard('o');
    expect(onOpenArtifact).toHaveBeenCalledWith(artifact);
    await user.click(screen.getByRole('button', { name: /Open plan/u }));
    expect(onOpenArtifact).toHaveBeenCalledTimes(2);
  });

  it('shows all of a long plan in place when there is nowhere to open it', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(400);
    render(
      <PlanExitResponse
        interaction={planInteraction()}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
      />,
    );
    const preview = document.querySelector('[data-slot="plan-preview"] > div')!;
    expect(preview).toHaveAttribute('data-plan-clipped', 'true');
    await user.click(screen.getByRole('button', { name: /Show all/u }));
    expect(preview).not.toHaveAttribute('data-plan-clipped');
    expect(screen.getByRole('button', { name: /Show less/u })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('reports its own failure, offers no ×, and stays disabled while answering', () => {
    const interaction = planInteraction();
    const onResponse = vi.fn(async () => undefined);
    const { rerender } = render(
      <PlanExitResponse
        interaction={interaction}
        onResponse={onResponse}
        responseError={new Error('Session closed')}
        showOwner
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Response unavailableSession closed');
    expect(screen.getByText('Session not listed yet')).toBeVisible();
    // The spec's plan header is the icon, Plan and the file; cancel is not a header ×.
    expect(interaction.actions).toContain('cancel');
    expect(screen.queryByRole('button', { name: 'Dismiss plan review' })).not.toBeInTheDocument();
    rerender(
      <PlanExitResponse disabled interaction={interaction} onResponse={onResponse} showOwner />,
    );
    expect(screen.getByRole('button', { name: 'Execute plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Clear context first/u })).toBeDisabled();
  });

  it('offers only what the server offered', () => {
    const base = planInteraction();
    render(
      <PlanExitResponse
        interaction={{
          ...base,
          actions: ['answer', 'defer'],
          payload: { ...base.payload, options: [{ label: 'Auto', value: 'auto' }] },
        }}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Request changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Execution mode, Auto-execute' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'defer' })).toHaveAttribute(
      'title',
      'This client cannot offer "defer" yet.',
    );
  });

  it('folds an approved plan into one row and keeps the plan a click away', async () => {
    const user = userEvent.setup();
    const interaction = planInteraction({
      status: 'answered',
      requires_human_response: false,
      actions: [],
      payload: {
        ...planInteraction().payload,
        answer_metadata: { selected_options: ['auto-edits', 'clear_context'] },
      },
    });
    render(
      <PlanExitResponse
        interaction={interaction}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
      />,
    );
    // The decided plan folds into one activity row; its chevron shows the plan again.
    // One phrase on hover; a narrow row cuts "context cleared", then the lead-in, before the mode.
    const phrase = screen.getByTitle('Approved in Workspace edits, context cleared');
    expect(phrase).toHaveTextContent('Approved in Workspace edits, context cleared');
    expect(phrase.querySelector('[data-slot="plan-mode-name"]')).toHaveTextContent(
      /^Workspace edits$/,
    );
    const row = phrase.closest('[data-plan-decision]');
    expect(row?.querySelector('[data-slot="activity-outcome"]')).toBeNull();
    expect(row).toHaveAttribute('data-plan-decision', 'auto-edits');
    expect(screen.getByRole('img', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Execute plan' })).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Expand Approved in Workspace edits, context cleared' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Soil moisture regrid' }, { timeout: 10_000 }),
    ).toBeVisible();
  });

  it("names an older card's mode on the folded row", () => {
    render(
      <PlanExitResponse
        interaction={legacyInteraction({
          status: 'answered',
          requires_human_response: false,
          actions: [],
          payload: { answer_metadata: { selected_options: ['interactive'] } },
        })}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
      />,
    );
    expect(screen.getByTitle('Approved in Interactive')).toBeVisible();
  });

  it('keeps the requested changes on the folded row', () => {
    const interaction = planInteraction({
      status: 'answered',
      requires_human_response: false,
      actions: [],
      payload: {
        ...planInteraction().payload,
        answer_metadata: {
          answer: 'Add rollback and verification steps.',
          selected_options: ['reject'],
        },
      },
    });
    render(
      <PlanExitResponse
        interaction={interaction}
        onResponse={vi.fn(async () => undefined)}
        showOwner={false}
      />,
    );
    const row = screen.getByText('Changes requested').closest('[data-plan-decision]');
    expect(row).toHaveAttribute('data-plan-decision', 'reject');
    expect(row).toHaveTextContent('Add rollback and verification steps.');
    expect(screen.getByRole('img', { name: 'Closed' })).toBeInTheDocument();
  });
});
