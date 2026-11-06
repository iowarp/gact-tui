import { cleanup, render, screen } from '@testing-library/react';
import { agentEntrySchema } from '@clio/core/v3';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationAgentControls } from './conversation-agent-controls';

afterEach(cleanup);

it('keeps an unlisted pinned agent selected instead of displaying a different installed agent', () => {
  render(
    <ConversationAgentControls
      agentRef="clio/earthscope@1.0.0"
      agentLabel="EarthScope"
      agents={[
        agentEntrySchema.parse({
          ref: 'clio/standard',
          id: 'standard',
          name: 'CLIO',
          kind: 'agent',
          plugins: [],
          description: '',
        }),
      ]}
      onSelect={vi.fn()}
      onCustomize={vi.fn()}
    />,
  );
  expect(screen.getByRole('combobox', { name: 'Conversation agent' })).toHaveValue(
    'clio/earthscope@1.0.0',
  );
  expect(screen.getByRole('option', { name: 'EarthScope' })).toHaveProperty('selected', true);
  expect(screen.getByRole('option', { name: 'CLIO' })).toHaveProperty('selected', false);
});

it('keeps known agent details available while choices are loading or unavailable', () => {
  const props = {
    agentRef: 'clio/earthscope',
    agentLabel: 'EarthScope',
    onCustomize: vi.fn(),
    onSelect: vi.fn(),
  };
  const view = render(<ConversationAgentControls {...props} pending />);
  expect(screen.getByRole('combobox', { name: 'Conversation agent' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'EarthScope' })).toHaveProperty('selected', true);
  expect(screen.getByRole('button', { name: 'Customize the agent' })).toBeEnabled();
  view.rerender(
    <ConversationAgentControls {...props} pending={false} agentsError="Could not list agents" />,
  );
  expect(screen.getByRole('combobox', { name: 'Conversation agent' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Conversation agent' })).toHaveAttribute(
    'title',
    'Could not list agents',
  );
});
