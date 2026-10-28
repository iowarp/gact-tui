import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FlowName } from './flow-name';

afterEach(cleanup);

describe('FlowName', () => {
  it('opens what a known flow is: its plugin, what it does and its drawing', async () => {
    const user = userEvent.setup();
    render(
      <FlowName
        info={{
          id: 'arena',
          plugin: 'orchestration',
          description: 'Several contestants attempt the same task; a judge picks one.',
          shape: '',
        }}
        name="arena"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'What the arena flow is' }));
    expect(await screen.findByText('The arena flow')).toBeVisible();
    expect(screen.getByText('From the orchestration plugin')).toBeVisible();
    expect(screen.getByText(/a judge picks one/u)).toBeVisible();
    expect(screen.getByText('No diagram was drawn for this flow.')).toBeVisible();
  });

  it('leaves a flow the agent does not know as plain text', () => {
    render(<FlowName name="mystery" />);
    expect(screen.getByText('mystery')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
