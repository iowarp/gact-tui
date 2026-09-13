import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';

afterEach(cleanup);

describe('ClioToolInvocation', () => {
  it('keeps the authoritative succeeded state when the result payload carries its own status', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-status-error',
          session_id: 'session-1',
          name: 'ndp_search_datasets',
          title: 'Search datasets',
          state: 'succeeded',
          output: { status: 'error' },
        }}
      />,
    );

    expect(screen.getByText('Succeeded')).toBeVisible();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('does not invent a degraded badge from an unrecognized payload status', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-status-staged',
          session_id: 'session-1',
          name: 'ndp_stage_resource',
          title: 'Stage dataset',
          state: 'succeeded',
          output: { status: 'staged' },
        }}
      />,
    );

    expect(screen.getByText('Succeeded')).toBeVisible();
    expect(screen.queryByText('Staged')).not.toBeInTheDocument();
  });

  it('keeps runtime cancellation diagnostics out of the compact summary', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-cancelled',
          session_id: 'session-1',
          name: 'v2ex_staller',
          title: 'Staller',
          state: 'cancelled',
          error: "CancellationError('tool call cancelled by client')",
        }}
      />,
    );

    expect(screen.getByText('The action was cancelled.')).toBeVisible();
    expect(screen.queryByText(/CancellationError/u)).not.toBeInTheDocument();
  });

  it('keeps tool arguments available under the approved heading', () => {
    render(
      <ClioToolInvocation
        defaultOpen
        tool={{
          id: 'tool-1',
          session_id: 'session-1',
          name: 'create_a2ui_surface',
          title: 'Create Interactive Surface',
          state: 'succeeded',
          input: { surface_id: 'earthscope-map' },
          output: { state: 'ready' },
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Arguments' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Result' })).toBeVisible();
  });

  it('renders an empty argument map when a persisted no-argument call decodes as null', () => {
    render(
      <ClioToolInvocation
        defaultOpen
        tool={{
          id: 'tool-no-arguments',
          session_id: 'session-1',
          name: 'v2ex_agent_guarded_input',
          title: 'Agent Guarded Input',
          state: 'succeeded',
          input: null,
          output: [{ type: 'text', text: 'agent-answered' }],
        }}
      />,
    );

    expect(screen.getByText('{}')).toBeVisible();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });
});
