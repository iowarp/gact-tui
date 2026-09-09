import { cleanup, render, screen, within } from '@testing-library/react';
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

describe('ClioToolInvocation', () => {
  it('does not create an empty panel for empty declared prose', () => {
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'empty',
          session_id: 's',
          name: 'declared_empty',
          state: 'succeeded',
          presentation: {
            summary: 'No schedules',
            blocks: [{ id: 'none', type: 'text', text: '' }],
          },
        }}
      />,
    );
    expect(screen.getByText('No schedules')).toBeVisible();
    expect(container.querySelector('[data-slot="tool-result-panel"]')).toBeNull();
  });
  it('insets rendered Markdown and keeps table action chrome out of the preview', async () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'markdown-preview',
          session_id: 's',
          name: 'declared_document',
          state: 'succeeded',
          presentation: {
            summary: '',
            blocks: [
              {
                id: 'document',
                type: 'markdown',
                text: '# Readable result\n\n| Feature | Value |\n| --- | --- |\n| Format | Markdown |',
              },
            ],
          },
        }}
      />,
    );
    const heading = await screen.findByRole('heading', { name: 'Readable result' });
    expect(heading.parentElement).toHaveClass('px-2', 'py-1');
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Copy table' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View fullscreen' })).not.toBeInTheDocument();
  });
  it('renders a declared action and clickable subject once in the row, never the payload', async () => {
    const openFile = vi.fn();
    const path = 'D:/workspace/long-readable-evidence.txt';
    const { container } = render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}
      >
        <ClioToolInvocation
          tool={{
            id: 'call',
            session_id: 's',
            name: 'internal_overloaded_tool_name',
            state: 'succeeded',
            duration_ms: 42,
            input: { payload: 'RAW PAYLOAD' },
            presentation: {
              action: 'Write',
              subject: 'file',
              summary: '',
              blocks: [
                {
                  id: 'file',
                  type: 'link',
                  target: 'file',
                  uri: path,
                  label: 'long-readable-evidence.txt',
                },
                {
                  id: 'effect',
                  type: 'diff',
                  text: '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n',
                },
              ],
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );
    const row = container.querySelector('[data-slot="activity-row"]')!;
    const file = screen.getByRole('button', { name: 'long-readable-evidence.txt' });
    expect(row).toContainElement(file);
    expect(row).toHaveTextContent('Write');
    expect(container.querySelector('[data-slot="tool-human-result"]')).not.toContainElement(file);
    expect(container).not.toHaveTextContent('RAW PAYLOAD');
    expect(container.querySelector('[data-diff-line="addition"]')).toHaveTextContent('+new');
    expect(container.querySelector('[data-diff-line="deletion"]')).toHaveTextContent('-old');
    expect(container.querySelectorAll('[data-diff-line]')).toHaveLength(5);
    await userEvent.setup().click(file);
    expect(openFile).toHaveBeenCalledWith(path);
  });
  it('does not hide content if a declared subject is not a text or link block', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'c',
          session_id: 's',
          name: 'unknown',
          state: 'succeeded',
          presentation: {
            action: 'Inspect',
            subject: 'body',
            summary: '',
            blocks: [{ id: 'body', type: 'code', text: 'preserved content' }],
          },
        }}
      />,
    );
    expect(screen.getByText('preserved content')).toBeVisible();
  });
  it('uses the file subject language for persisted read results without a declaration', () => {
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'read-python',
          session_id: 's',
          name: 'fs_read_file',
          state: 'succeeded',
          presentation: {
            action: 'Read',
            subject: 'file-link',
            summary: '46 bytes',
            blocks: [
              {
                id: 'file-link',
                type: 'link',
                target: 'file',
                uri: 'D:\\workspace\\example.py',
                label: 'example.py',
              },
              { id: 'file', type: 'code', text: 'def answer():\n    return 43' },
            ],
          },
        }}
      />,
    );
    expect(container.querySelector('[data-language="python"]')).toBeInTheDocument();
  });
  it('wraps qualifying result metadata instead of clipping it in a narrow pane', () => {
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'rejected-artifact',
          session_id: 's',
          name: 'create_artifact',
          state: 'succeeded',
          duration_ms: 369,
          presentation: {
            action: 'Create Artifact',
            summary: 'rejected: escapes_root',
            blocks: [],
          },
        }}
      />,
    );
    const metadata = container.querySelector('[data-slot="activity-row"]')?.children[1]
      ?.firstElementChild;
    expect(metadata).toHaveClass('flex-wrap');
    expect(screen.getByText('rejected: escapes_root')).toHaveClass('max-w-full', 'shrink-0');
  });
  it('renders declared media rather than binary text and rejects active MIME content', () => {
    const { rerender } = render(
      <ClioToolInvocation
        tool={{
          id: 'call',
          session_id: 's',
          name: 'anything',
          state: 'succeeded',
          presentation: {
            summary: '',
            blocks: [
              {
                id: 'image',
                type: 'media',
                media_type: 'image/png',
                text: 'AAAA',
                label: 'Preview image',
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Preview image' })).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA',
    );
    expect(screen.queryByText('AAAA')).not.toBeInTheDocument();
    rerender(
      <ClioToolInvocation
        tool={{
          id: 'call',
          session_id: 's',
          name: 'anything',
          state: 'succeeded',
          presentation: {
            summary: '',
            blocks: [{ id: 'image', type: 'media', media_type: 'text/html', text: 'AAAA' }],
          },
        }}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable for text/html.')).toBeVisible();
  });
  it('opens technical JSON in a separate accessible dialog from the row icon', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ClioToolInvocation
        tool={{
          id: 'call',
          session_id: 's',
          name: 'arbitrary',
          state: 'succeeded',
          input: { exact: 'argument' },
          output: { raw: 'value' },
        }}
      />,
    );
    const icon = screen.getByRole('button', { name: 'Technical details for arbitrary' });
    expect(container).not.toHaveTextContent('argument');
    await user.click(icon);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Arguments' })).toBeVisible();
    expect(container.querySelector('[data-slot="tool-activity"]')).not.toContainElement(dialog);
    await user.keyboard('{Escape}');
    expect(icon).toHaveFocus();
  });
  it('renders declared checklist states without status-word or tool-name inference', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'call',
          session_id: 's',
          name: 'arbitrary',
          state: 'succeeded',
          presentation: {
            summary: '',
            blocks: [
              { id: 'a', type: 'check', state: 'pending', text: 'First task' },
              { id: 'b', type: 'check', state: 'in_progress', text: 'Second task' },
              { id: 'c', type: 'check', state: 'completed', text: 'Third task' },
            ],
          },
        }}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Pending' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'In progress' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Completed' })).toBeInTheDocument();
  });
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

  it('shows a declared human result without opening technical JSON', () => {
    render(
      <ClioToolInvocation
        tool={{
          id: 'tool-skill',
          session_id: 'session-1',
          name: 'load_skill',
          presentation: {
            summary: "loaded skill 'ai-elements' (204 lines)",
            blocks: [
              {
                id: 'skill',
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
      />,
    );

    expect(screen.getByText('Wait')).toBeVisible();
    expect(screen.getByText('researcher #1, researcher #2')).toBeVisible();
    expect(screen.getByText('researcher #1')).toBeVisible();
    expect(screen.getByText('returned after 7 s')).toBeVisible();
    expect(screen.getByText('Context received')).toBeVisible();
    expect(screen.getByText(/The answer is 11\./u)).toBeVisible();
    expect(screen.queryByText(/task.*completed/iu)).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="tool-result-panel"]')).toBeNull();
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
