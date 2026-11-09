import type { MessageBehavior } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioComposerBehaviorControls } from './composer-behavior-controls';

afterEach(cleanup);

const behavior: MessageBehavior = {
  confirmation_policy: 'ask',
  execution_mode: 'execute',
  reasoning_effort: 'medium',
};

const ALL_LEVELS = ['off', 'low', 'medium', 'high', 'xhigh'] as const;

function mount(props: Partial<ComponentProps<typeof ClioComposerBehaviorControls>> = {}) {
  const onChange = vi.fn();
  const view = render(
    <TooltipProvider>
      <ClioComposerBehaviorControls
        behavior={behavior}
        modelControl={null}
        onChange={onChange}
        reasoningLevels={ALL_LEVELS}
        {...props}
      />
    </TooltipProvider>,
  );
  return { onChange, view };
}

function renderControls(
  overrides: Partial<MessageBehavior> = {},
  unrecognizedEffort?: string,
  reasoningLevels: readonly (typeof ALL_LEVELS)[number][] = ALL_LEVELS,
) {
  return mount({
    behavior: { ...behavior, ...overrides },
    reasoningLevels,
    unrecognizedEffort,
  }).onChange;
}

describe('ClioComposerBehaviorControls', () => {
  it('labels every value the message contract defines', () => {
    renderControls({
      confirmation_policy: 'spotter-ai',
      execution_mode: 'deep_research',
      reasoning_effort: 'xhigh',
    });

    expect(screen.getByRole('button', { name: 'Reasoning effort: Extra high' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Execution mode: Deep research' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Confirmation policy: SPOTTER review' }),
    ).toBeVisible();
  });

  it('names an unrecognized reasoning effort instead of showing a value nobody chose', () => {
    renderControls({}, 'ultra');

    const control = screen.getByRole('button', { name: /^Reasoning effort:/ });
    expect(control).toHaveAccessibleName('Reasoning effort: Unknown (ultra)');
    expect(control).not.toHaveTextContent('medium');
  });

  it('names an execution mode and a confirmation policy it does not recognize', () => {
    renderControls({
      confirmation_policy: 'triple-checked' as MessageBehavior['confirmation_policy'],
      execution_mode: 'sandboxed' as MessageBehavior['execution_mode'],
    });

    expect(
      screen.getByRole('button', { name: 'Execution mode: Unknown (sandboxed)' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Confirmation policy: Unknown (triple-checked)' }),
    ).toBeVisible();
  });

  it('leaves the unknown effort unselected so a choice is deliberate', async () => {
    const user = userEvent.setup();
    const onChange = renderControls({}, 'ultra');

    await user.click(screen.getByRole('button', { name: /^Reasoning effort:/ }));
    for (const item of screen.getAllByRole('menuitemradio')) {
      expect(item).toHaveAttribute('aria-checked', 'false');
    }

    await user.click(screen.getByRole('menuitemradio', { name: 'High' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: 'high' }));
  });

  it('offers the model default and exactly the levels the selected model reports', async () => {
    const user = userEvent.setup();
    renderControls({ reasoning_effort: 'medium' }, undefined, ['low', 'medium', 'high']);

    await user.click(screen.getByRole('button', { name: 'Reasoning effort: Medium' }));
    expect(screen.getByRole('menu')).toHaveTextContent('Reasoning effort');
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'Model default',
      'Low',
      'Medium',
      'High',
    ]);
    expect(screen.getByRole('menuitemradio', { name: 'Medium' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('returns to the model default by sending no level', async () => {
    const user = userEvent.setup();
    const onChange = renderControls({ reasoning_effort: 'high' });

    await user.click(screen.getByRole('button', { name: 'Reasoning effort: High' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Model default' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: undefined }));
  });

  it('shows no reasoning control for a model that offers no levels', () => {
    renderControls({ reasoning_effort: undefined }, undefined, []);

    expect(screen.queryByRole('button', { name: /^Reasoning effort:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Execution mode: Execute' })).toBeVisible();
  });

  it('describes each mode and policy in the menu rows', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'Execution mode: Execute' }));
    expect(screen.getByRole('menu')).toHaveTextContent('Mode');
    expect(screen.getByRole('menuitemradio', { name: /^Plan/ })).toHaveTextContent(
      'Proposes a plan and waits for you.',
    );
    expect(screen.getByRole('menuitemradio', { name: /^Execute/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('asks before bypassing protected-action checks', async () => {
    const user = userEvent.setup();
    const onChange = renderControls();

    await user.click(screen.getByRole('button', { name: 'Confirmation policy: Ask first' }));
    await user.click(screen.getByRole('menuitemradio', { name: /^Bypass checks/ }));
    expect(onChange).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Bypass protected-action checks?',
    });
    await user.click(screen.getByRole('button', { name: 'Keep asking' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(dialog).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmation policy: Ask first' }));
    await user.click(screen.getByRole('menuitemradio', { name: /^Bypass checks/ }));
    await user.click(await screen.findByRole('button', { name: 'Bypass checks' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ confirmation_policy: 'bypass' }),
    );
  });

  it('opens the mode menu on Ctrl+Shift+M and moves to the next mode on another press', () => {
    const onChange = renderControls();
    const press = () =>
      fireEvent.keyDown(window, { code: 'KeyM', ctrlKey: true, key: 'M', shiftKey: true });

    press();
    expect(screen.getByRole('menu')).toHaveTextContent('Mode');
    expect(onChange).not.toHaveBeenCalled();

    press();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ execution_mode: 'plan' }));
  });

  it('keeps only the most recently opened behavior menu visible', async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole('button', { name: 'Reasoning effort: Medium' }));
    expect(screen.getByRole('menu')).toHaveTextContent('Reasoning effort');

    fireEvent.pointerDown(
      screen.getByRole('button', { hidden: true, name: 'Execution mode: Execute' }),
      { button: 0, ctrlKey: false },
    );
    expect(screen.getByRole('menu')).toHaveTextContent('Mode');
    expect(screen.queryByText('Reasoning effort')).not.toBeInTheDocument();

    fireEvent.pointerDown(
      screen.getByRole('button', { hidden: true, name: 'Confirmation policy: Ask first' }),
      { button: 0, ctrlKey: false },
    );
    expect(screen.getByRole('menu')).toHaveTextContent('Confirmation policy');
    expect(screen.queryByText('Mode')).not.toBeInTheDocument();
  });
});

describe('ClioComposerBehaviorControls SPOTTER availability', () => {
  it('offers unavailable SPOTTER disabled with a short explanation', async () => {
    const user = userEvent.setup();
    const { onChange } = mount({
      spotterAvailability: {
        available: false,
        reason: 'spotter_watcher_provenance_unavailable',
        message: 'SPOTTER surveillance was not armed: no provenance store to read.',
        remedy: 'enable an agentic provenance provider (provenance.agentic.providers: [jsonl])',
        verified: '',
      },
    });

    await user.click(screen.getByRole('button', { name: 'Confirmation policy: Ask first' }));
    const spotter = await screen.findByRole('menuitemradio', { name: /SPOTTER review/ });
    expect(spotter).toHaveAttribute('aria-disabled', 'true');
    expect(spotter).toHaveTextContent('Not available here.');
    await user.click(spotter);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ClioComposerBehaviorControls SPOTTER model', () => {
  const available = { available: true, reason: '', message: '', remedy: '', verified: 'runtime' };
  function renderSpotterModel(
    policy: MessageBehavior['confirmation_policy'],
    spotterAvailability?: typeof available,
  ) {
    mount({
      behavior: { ...behavior, confirmation_policy: policy },
      spotterAvailability,
      spotterModelControl: <button type="button">SPOTTER model control</button>,
    });
  }

  it('shows the SPOTTER model choice only under SPOTTER review the service can arm', () => {
    renderSpotterModel('spotter-ai', available);
    expect(screen.getByRole('button', { name: 'SPOTTER model control' })).toBeVisible();
  });

  it('hides the SPOTTER model choice under another policy', () => {
    renderSpotterModel('ask', available);
    expect(screen.queryByRole('button', { name: 'SPOTTER model control' })).toBeNull();
  });

  it('hides the SPOTTER model choice when SPOTTER cannot be armed or is unknown', () => {
    renderSpotterModel('spotter-ai', { ...available, available: false });
    expect(screen.queryByRole('button', { name: 'SPOTTER model control' })).toBeNull();
    cleanup();
    renderSpotterModel('spotter-ai');
    expect(screen.queryByRole('button', { name: 'SPOTTER model control' })).toBeNull();
  });
});
