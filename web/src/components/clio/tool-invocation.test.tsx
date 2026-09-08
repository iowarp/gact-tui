import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';

afterEach(cleanup);
beforeEach(() => { Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList); });

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

    expect(screen.getByText('Cancelled')).toBeVisible();
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

  it('shows a declared human result without opening technical JSON', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-skill',
          session_id: 'session-1',
          name: 'load_skill',
          presentation: { summary: "loaded skill 'ai-elements' (204 lines)", blocks: [{ id: 'skill', type: 'markdown', text: '# Loaded skill body\nUse the real components.' }] },
          title: 'Load Skill',
          state: 'succeeded',
          output: {
            content: [],
            structuredContent: {
              message: "loaded skill 'ai-elements' (204 lines)",
              skill_id: 'ai-elements',
              path: 'skills/ai-elements/SKILL.md',
            },
          },
        }}
      />,
    );

    expect(screen.getByText("loaded skill 'ai-elements' (204 lines)")).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Result' })).not.toBeInTheDocument();
  });

  it('renders an exact proposed edit as a visible diff beneath the tool row', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-diff',
          session_id: 'session-1',
          name: 'fs_propose_edit',
          presentation: { summary: 'src/example.py', blocks: [{ id: 'diff', type: 'diff', text: '@@ -1 +1 @@\n-old\n+new' }] },
          state: 'succeeded',
          output: {
            content: [],
            structuredContent: {
              path: 'src/example.py',
              unified_diff: '@@ -1 +1 @@\n-old\n+new',
            },
          },
        }}
      />,
    );

    expect(screen.getByText('src/example.py')).toBeVisible();
    expect(screen.getByText('+new')).toBeVisible();
    expect(screen.getByText('Technical details')).toBeVisible();
  });

  it('shows live terminal output and preserves the technical disclosure', () => {
    render(
      <ClioToolInvocation
        defaultOpen
        tool={{
          id: 'tool-shell',
          session_id: 'session-1',
          name: 'shell_bash',
          state: 'running',
          presentation: { summary: '', blocks: [{ id: 'terminal', type: 'terminal', command: 'run checks', text: 'collecting tests\n42 passed\n' }] },
          input: { command: 'run checks' },
          output_stream: 'collecting tests\n42 passed\n',
        }}
      />,
    );

    expect(screen.getByLabelText('Command')).toHaveTextContent('run checks');
    expect(screen.getByText(/collecting tests/u)).toBeVisible();
    expect(screen.getByText(/42 passed/u)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Arguments' })).toBeVisible();
  });

  it('renders completed stdout and the real process exit code', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-shell-complete',
          session_id: 'session-1',
          name: 'shell_bash',
          state: 'succeeded',
          presentation: { summary: '', blocks: [{ id: 'terminal', type: 'terminal', text: 'all checks passed\n', exit_code: 0 }] },
          output: {
            content: [],
            structuredContent: { stdout: 'all checks passed\n', stderr: '', exit_code: 0 },
          },
        }}
      />,
    );

    expect(screen.getByText(/all checks passed/u)).toBeVisible();
    expect(screen.getByText('Process exited with code 0.')).toBeVisible();
    expect(screen.queryByLabelText('Command')).not.toBeInTheDocument();
  });
});
