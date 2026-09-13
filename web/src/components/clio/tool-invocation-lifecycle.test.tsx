// Content, subject, and prose-rendering fundamentals live in
// `tool-invocation.test.tsx`; this file covers status semantics, the
// skill/workflow/diff surfaces, and process/child/terminal lifecycle
// rendering.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentationNavigation } from './presentation-navigation';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';

afterEach(cleanup);
// These assertions exercise the completed Markdown view, not lazy-module startup.
beforeAll(async () => {
  await import('@/components/ai-elements/markdown');
});
beforeEach(() => {
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
});

describe('ClioToolInvocation status and lifecycle semantics', () => {
  it('shows one filename and opens its declared full path in the workbench', async () => {
    const openFile = vi.fn();
    const path = 'D:/workspace/evidence.txt';
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}
      >
        <ClioToolInvocation
          tool={{
            id: 'call',
            session_id: 's',
            name: 'arbitrary',
            state: 'succeeded',
            presentation: {
              subject: 'file',
              summary: '12 bytes',
              blocks: [
                { id: 'file', type: 'link', target: 'file', uri: path, label: 'evidence.txt' },
              ],
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'evidence.txt' }));
    expect(openFile).toHaveBeenCalledWith(path);
    expect(screen.queryByText(path)).not.toBeInTheDocument();
    expect(screen.getByText('12 bytes').closest('[data-slot="activity-metadata"]')).not.toBeNull();
    expect(screen.getByText('12 bytes').closest('[data-slot="tool-human-result"]')).toBeNull();
    expect(document.querySelector('[data-slot="tool-action-label"]')).toHaveClass('w-full');
  });
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

  it('shows a loaded skill as a bounded file and opens its declared source path', async () => {
    const openFile = vi.fn();
    const path = 'D:/workspace/.clio/skills/ai-elements/SKILL.md';
    const { container } = render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}
      >
        <ClioToolInvocation
          tool={{
            id: 'tool-skill',
            session_id: 'session-1',
            name: 'load_skill',
            presentation: {
              action: 'Load skill',
              subject: 'skill',
              summary: "loaded skill 'ai-elements' (204 lines)",
              blocks: [
                { id: 'skill', type: 'text', label: 'ai-elements' },
                {
                  id: 'body',
                  type: 'markdown',
                  text: '# Loaded skill body\nUse the real components.',
                },
              ],
            },
            title: 'Load Skill',
            state: 'succeeded',
            output: {
              content: [],
              structuredContent: {
                message: "loaded skill 'ai-elements' (204 lines)",
                skill_id: 'ai-elements',
                path,
              },
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );

    expect(screen.getByText("loaded skill 'ai-elements' (204 lines)")).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Result' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="tool-result-panel"]')).toBeVisible();
    const skill = screen.getByRole('button', { name: 'ai-elements' });
    await userEvent.setup().click(skill);
    expect(openFile).toHaveBeenCalledWith(path);
  });

  it('names a workflow, exposes its request, and opens its canvas resource', async () => {
    const onOpenWorkflow = vi.fn();
    const tool = {
      id: 'tool-workflow',
      session_id: 'session-1',
      name: 'run_workflow',
      title: 'Run Workflow',
      state: 'succeeded' as const,
      duration_ms: 33_000,
      input: { request: 'Inventory and verify the supplied Alpha and Beta facts.' },
      output: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'completed',
            steps: [{ child: 'inventory' }, { child: 'verification' }],
          }),
        },
      ],
    };
    render(
      <PresentationNavigation.Provider value={{ artifacts: {}, subagents: {}, onOpenWorkflow }}>
        <ClioToolInvocation tool={tool} />
      </PresentationNavigation.Provider>,
    );

    expect(screen.getByText('Run workflow')).toBeVisible();
    expect(screen.getByText('inventory → verification')).toBeVisible();
    expect(screen.getByText('2 ordered steps · waited for completion')).toBeVisible();
    expect(
      screen.getByText('Inventory and verify the supplied Alpha and Beta facts.'),
    ).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Open workflow inventory → verification' }));
    expect(onOpenWorkflow).toHaveBeenCalledWith(tool);
  });

  it('renders an exact proposed edit as a visible diff beneath the tool row', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-diff',
          session_id: 'session-1',
          name: 'fs_propose_edit',
          presentation: {
            summary: 'src/example.py',
            blocks: [{ id: 'diff', type: 'diff', text: '@@ -1 +1 @@\n-old\n+new' }],
          },
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
    expect(
      screen.getByRole('button', { name: 'Technical details for fs_propose_edit' }),
    ).toBeVisible();
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
          presentation: {
            summary: '',
            blocks: [
              {
                id: 'terminal',
                type: 'terminal',
                command: 'run checks',
                text: 'collecting tests\n42 passed\n',
              },
            ],
          },
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
          presentation: {
            summary: '',
            blocks: [
              { id: 'terminal', type: 'terminal', text: 'all checks passed\n', exit_code: 0 },
            ],
          },
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

  it('renders child status and wait semantics without summary counts or boxes', () => {
    const { container } = render(
      <PresentationNavigation.Provider
        value={{
          artifacts: {},
          // A session-target item resolves through the real subagent map;
          // without a match, PresentationLink falls back to a react-router
          // Link, which needs a Router this unit test does not provide.
          subagents: { child: { child_session_id: 'session-child-1' } as never },
          onOpenSubagent: vi.fn(),
        }}
      >
        <ClioToolInvocation
          tool={{
            id: 'tool-wait',
            session_id: 'session-1',
            name: 'wait_agent_tasks',
            state: 'succeeded',
            duration_ms: 13_000,
            presentation: {
              action: 'Wait',
              subject: 'task-subject',
              summary: '',
              blocks: [
                {
                  id: 'task-subject',
                  type: 'text',
                  text: 'researcher #1, researcher #2',
                },
                {
                  id: 'task-1',
                  type: 'item',
                  target: 'session',
                  uri: 'session-child-1',
                  label: 'researcher #1',
                  status: 'completed',
                  result_kind: 'completion',
                  duration_ms: 7_000,
                  detail: 'The answer is 11.',
                },
              ],
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );

    expect(screen.getByText('Wait')).toBeVisible();
    expect(screen.getByText('researcher #1, researcher #2')).toBeVisible();
    expect(screen.getByText('researcher #1')).toBeVisible();
    expect(screen.getByText('completed, returned after 7 s')).toBeVisible();
    expect(screen.getByText('Returned')).toBeVisible();
    expect(screen.getByText(/The answer is 11\./u)).toBeVisible();
    expect(screen.queryByText(/task.*completed/iu)).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="tool-result-panel"]')).toBeNull();
  });

  it('shows the observe row as a cursor/pattern watcher, not an internal status snapshot', () => {
    // Wire shape from clio-agent's native_presenters.py on 9f4f7fb9
    // (tests/test_gact/test_tool_presentation_adapters.py
    // test_patterned_observe_presents_match_cursor_status_and_curated_evidence),
    // with _observe_status_line's field join updated from " · " to "; " per
    // the owner rule (separators are layout, no glyph field lists). "Observe"
    // is the retired "Get status" title's replacement; the row is a
    // cursor/pattern watcher, not a blocking status snapshot.
    render(
      <PresentationNavigation.Provider
        value={{
          artifacts: {},
          subagents: { child: { child_session_id: 'session-child-1' } as never },
          onOpenSubagent: vi.fn(),
        }}
      >
        <ClioToolInvocation
          tool={{
            id: 'tool-observe',
            session_id: 'session-1',
            name: 'observe_agent_tasks',
            state: 'succeeded',
            presentation: {
              action: 'Observe',
              subject: 'task-subject',
              summary: '',
              blocks: [
                {
                  id: 'task-subject',
                  type: 'link',
                  target: 'session',
                  uri: 'session-child-1',
                  label: 'Research methodologist #1',
                },
                {
                  id: 'observation',
                  type: 'text',
                  label: 'Observed',
                  text: 'Cursor 7 -> 10; Pattern "station=KOOT" matched; Research methodologist #1: running',
                },
                {
                  id: 'evidence-0',
                  type: 'text',
                  label: 'Evidence · Research methodologist #1',
                  text: 'thought: compare methods | tool: search({"query": "evidence"})',
                },
              ],
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );

    expect(screen.getByText('Observe')).toBeVisible();
    expect(screen.getByText('Observed')).toBeVisible();
    expect(screen.getByText(/Cursor 7 -> 10/u)).toBeVisible();
    expect(screen.getByText(/Research methodologist #1: running/u)).toBeVisible();
    expect(screen.getByText('Evidence · Research methodologist #1')).toBeVisible();
    expect(screen.getByText(/tool: search/u)).toBeVisible();
    // Lifecycle events ("Context received...") are curated out of evidence;
    // only the matched react.step excerpt survives.
    expect(screen.queryByText(/Context received/u)).not.toBeInTheDocument();
  });

  it('bounds a historical Collect result behind Show more', async () => {
    Range.prototype.getClientRects = vi.fn(
      () =>
        [
          { top: 0, bottom: 20, width: 100, height: 20 },
          { top: 20, bottom: 40, width: 100, height: 20 },
          { top: 40, bottom: 60, width: 100, height: 20 },
        ] as unknown as DOMRectList,
    );
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-collect',
          session_id: 'session-1',
          name: 'get_agent_task_output',
          state: 'succeeded',
          presentation: {
            action: 'Collect',
            summary: '',
            blocks: [
              {
                id: 'output',
                type: 'markdown',
                text: '# Result\n\n- First finding\n- Second finding\n- Third finding',
              },
            ],
          },
        }}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Show more' })).toBeVisible();
  });

  it('renders schedules as bounded actionable rows', async () => {
    const openWork = vi.fn();
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenWork: openWork }}
      >
        <ClioToolInvocation
          tool={{
            id: 'tool-schedules',
            session_id: 'session-1',
            name: 'cron_list',
            state: 'succeeded',
            presentation: {
              action: 'List schedules',
              summary: '4 schedules, 1 recurring, 3 one-shot',
              blocks: Array.from({ length: 4 }, (_, index) => ({
                id: `schedule-${index}`,
                type: 'item' as const,
                target: 'work' as const,
                uri: `schedule_${index}`,
                label: `Prepare report ${index}`,
                items: ['One-shot', 'Runs Sep 12, 2026, 9:00 AM', 'Time zone: UTC'],
              })),
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );

    expect(screen.getByRole('list', { name: 'Schedules' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Show more' })).toBeVisible();
    expect(screen.queryByText('Next:')).not.toBeInTheDocument();
    expect(screen.queryByText('schedule_0')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Prepare report 0' }));
    expect(openWork).toHaveBeenCalledOnce();
  });

  it('uses semantic failure status and an error panel for a rejected artifact', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-artifact-rejected',
          session_id: 'session-1',
          name: 'create_artifact',
          state: 'succeeded',
          presentation: {
            action: 'Create Artifact',
            status: 'failed',
            summary: '',
            blocks: [
              {
                id: 'rejection',
                type: 'text',
                label: 'Artifact rejected',
                severity: 'error',
                text: 'The requested path is outside the active workspace.',
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByRole('status', { name: 'Failed' })).toBeVisible();
    expect(screen.getByText('Artifact rejected')).toHaveClass('text-destructive');
    expect(screen.getByText('The requested path is outside the active workspace.')).toBeVisible();
  });
});
