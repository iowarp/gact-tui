import type { MessageBehavior } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioComposerBehaviorControls } from './composer-behavior-controls';

afterEach(cleanup);

const behavior: MessageBehavior = {
  confirmation_policy: 'ask',
  execution_mode: 'execute',
  reasoning_effort: 'medium',
};

function renderControls(overrides: Partial<MessageBehavior> = {}, unrecognizedEffort?: string) {
  const onChange = vi.fn();
  render(
    <ClioComposerBehaviorControls
      behavior={{ ...behavior, ...overrides }}
      modelControl={null}
      onChange={onChange}
      unrecognizedEffort={unrecognizedEffort}
    />,
  );
  return onChange;
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
    expect(control).toHaveTextContent('Unknown (ultra)');
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

    await user.click(screen.getByRole('menuitemradio', { name: 'high' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: 'high' }));
  });
});
