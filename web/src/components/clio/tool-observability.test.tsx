import type { ToolInvocation } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import '@/components/ai-elements/markdown';
import { ClioToolInvocation } from './tool-invocation';
import { getToolFailureDetail } from './tool-presentation';
import { PresentationNavigation } from './presentation-navigation';
import { TooltipProvider } from '@/components/ui/tooltip';
import { renderWithTooltips } from '@/test/render-with-tooltips';
import { expectStatusMark } from '@/test/status-mark';

afterEach(cleanup);

// Minimal recorded shapes from the reported export, without its private payloads.
const shell: ToolInvocation = {
  id: 'shell',
  session_id: 's',
  name: 'shell_bash',
  state: 'succeeded',
  input: { command: 'Get-Location', cwd: null },
  output: {
    content: [],
    structuredContent: {
      exit_code: 1,
      stderr: 'windows sandbox failed: CreateProcessWithLogonW failed: 2\n',
    },
  },
  presentation: {
    action: 'Run',
    status: 'failed',
    summary: '',
    blocks: [
      {
        id: 'terminal',
        type: 'terminal',
        command: 'Get-Location',
        exit_code: 1,
        text: 'windows sandbox failed: CreateProcessWithLogonW failed: 2\n',
      },
    ],
  },
};

// The status mark names the recorded shell reason as a sentence.
const SHELL_FAILURE = 'Failed: windows sandbox failed: CreateProcessWithLogonW failed: 2.';

describe('readable compact tool results', () => {
  it.each([
    {
      name: 'load_skill',
      action: 'Load skill',
      block: {
        id: 'skill',
        type: 'markdown' as const,
        text: '# Loaded procedure\n\nRead **source evidence** first.',
      },
      expected: 'source evidence',
    },
    {
      name: 'prepare_execution_runtime',
      action: 'Inspect execution environment',
      block: { id: 'python', type: 'text' as const, text: 'Python version: 3.13.16' },
      expected: 'Python version: 3.13.16',
    },
  ])(
    'opens the curated $name view before technical JSON',
    async ({ name, action, block, expected }) => {
      const user = userEvent.setup();
      render(
        <ClioToolInvocation
          compact
          tool={{
            id: 'call',
            session_id: 's',
            name,
            state: 'succeeded',
            input: { kwargs: { internal: 'EXACT ARGUMENT' } },
            output: { exact: 'EXACT RESULT' },
            presentation: { action, summary: '', blocks: [block] },
          }}
        />,
      );
      const row = screen.getByRole('button', { name: `Show result for ${action}` });
      const info = screen.getByRole('button', { name: `Technical details for ${action}` });
      expect(screen.queryByText(expected)).not.toBeInTheDocument();
      await user.click(row);
      const result = screen.getByRole('region', { name: `${action}: Result` });
      expect(await within(result).findByText(expected)).toBeVisible();
      expect(within(result).queryByRole('heading', { name: 'Arguments' })).not.toBeInTheDocument();
      expect(result).not.toHaveTextContent('EXACT RESULT');
      await user.click(info);
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('heading', { name: 'Arguments' })).toBeVisible();
      expect(dialog).toHaveTextContent('EXACT ARGUMENT');
      expect(dialog).toHaveTextContent('EXACT RESULT');
      await user.keyboard('{Escape}');
      expect(info).toHaveFocus();
      expect(result).toBeVisible();
      await user.click(row);
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    },
  );

  it('retains artifact navigation inside the readable result', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    render(
      <PresentationNavigation.Provider
        value={{
          artifacts: {},
          subagents: {},
          onOpenFile: (path) => {
            opened.push(path);
          },
        }}
      >
        <ClioToolInvocation
          compact
          tool={{
            id: 'artifact',
            session_id: 's',
            name: 'create_artifact',
            state: 'succeeded',
            input: { content: 'RAW SVG DATA' },
            presentation: {
              action: 'Create Artifact',
              subject: 'file',
              summary: 'Created version 1',
              blocks: [
                {
                  id: 'file',
                  type: 'link',
                  target: 'file',
                  uri: 'D:/workspace/raccoon.svg',
                  label: 'raccoon.svg',
                },
              ],
            },
          }}
        />
      </PresentationNavigation.Provider>,
    );
    const link = screen.getByRole('button', { name: 'raccoon.svg' });
    // The compact link keeps the file's stem and extension apart so the stem can truncate.
    expect(link).toHaveTextContent(/^raccoon\.svg$/u);
    expect(document.body.textContent?.match(/raccoon\.svg/gu)).toHaveLength(1);
    expect(screen.queryByText('RAW SVG DATA')).not.toBeInTheDocument();
    await user.click(link);
    expect(opened).toEqual(['D:/workspace/raccoon.svg']);
  });

  it('shows recorded shell failure diagnostics on the status mark and expansion', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ClioToolInvocation compact tool={shell} />
      </TooltipProvider>,
    );
    const row = screen.getByRole('button', { name: 'Show result for Run command' });
    await expectStatusMark(SHELL_FAILURE, SHELL_FAILURE);
    row.focus();
    await user.keyboard('{Enter}');
    const result = screen.getByRole('region', { name: 'Run command: Result' });
    // The command body's output already carries the error, so it is not repeated below it.
    expect(within(result).getAllByText(/CreateProcessWithLogonW failed: 2/u)).toHaveLength(1);
    expect(within(result).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(result).queryByRole('heading', { name: 'Arguments' })).not.toBeInTheDocument();
  });

  it('retains semantic rejection reasons even when transport succeeded', async () => {
    const tool: ToolInvocation = {
      ...shell,
      name: 'create_a2ui_surface',
      presentation: {
        action: 'Generate widget',
        status: 'failed',
        summary: '',
        blocks: [
          {
            id: 'error',
            type: 'text',
            severity: 'error',
            text: 'A2UI surface components must contain exactly one id="root" component',
          },
        ],
      },
      error: 'ok=false: A2UI surface components must contain exactly one id="root" component',
    };
    render(<ClioToolInvocation compact tool={tool} />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Show result for Create widget' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'must contain exactly one id="root" component',
    );
    expect(screen.getByRole('region')).not.toHaveTextContent('ok=false');
  });

  it('keeps the row focused when a running call becomes a semantic failure', async () => {
    const view = renderWithTooltips(
      <ClioToolInvocation
        compact
        tool={{
          ...shell,
          state: 'running',
          presentation: { action: 'Run', summary: '', blocks: [] },
        }}
      />,
    );
    const row = screen.getByRole('button', { name: 'Show result for Run command' });
    row.focus();
    view.rerender(<ClioToolInvocation compact tool={shell} />);
    expect(row).toHaveFocus();
    await expectStatusMark(SHELL_FAILURE, SHELL_FAILURE);
    view.rerender(
      <ClioToolInvocation
        compact
        tool={{
          ...shell,
          presentation: { action: 'Run', status: 'succeeded', summary: '', blocks: [] },
        }}
      />,
    );
    expect(row).toHaveFocus();
    expect(screen.queryByRole('img', { name: /^Failed/ })).not.toBeInTheDocument();
  });

  it('keeps undeclared results accessible without inventing failure semantics', async () => {
    const tool: ToolInvocation = {
      id: 'unknown',
      session_id: 's',
      name: 'external_tool',
      state: 'succeeded',
      output: { status: 'error', error: 'payload data' },
    };
    expect(getToolFailureDetail(tool)).toBeUndefined();
    render(<ClioToolInvocation compact tool={tool} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show result for external_tool' }));
    expect(screen.getByRole('region')).toHaveTextContent('payload data');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Technical details for external_tool' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('payload data');
  });

  it('names the refused action on a denied decision row', () => {
    render(
      <TooltipProvider>
        <ClioToolInvocation
          compact
          tool={{
            id: 'write',
            session_id: 's',
            name: 'fs_write_file',
            state: 'denied',
            input: { path: '/workspace/notes/plan.md', content: 'x' },
            error: 'Denied by you',
            presentation: {
              action: 'Write',
              subject: 'file-link',
              summary: '',
              blocks: [
                {
                  id: 'file-link',
                  type: 'link',
                  label: 'plan.md',
                  target: 'file',
                  uri: '/workspace/notes/plan.md',
                },
              ],
            },
          }}
        />
      </TooltipProvider>,
    );
    // The visible decision word stays in the name, and the name keeps the action.
    const name = screen.getByRole('button', { name: 'Show result for denied Write file' });
    expect(name).toHaveTextContent('Denied');
    expect(screen.getByText('you denied it')).toBeInTheDocument();
  });
});

describe('recorded failure detail selection', () => {
  it.each(['failed', 'succeeded'] as const)(
    'does not suppress a catalog failure with transport state %s',
    async (state) => {
      render(
        <ClioToolInvocation
          compact
          tool={{
            id: 'catalog',
            session_id: 's',
            name: 'load_skill',
            state,
            input: { kwargs: { skill_id: 'a2ui-catalog-clio-workspace' } },
            presentation: {
              status: 'failed',
              summary: '',
              blocks: [
                {
                  id: 'error',
                  type: 'text',
                  severity: 'error',
                  text: 'Catalog component was not found.',
                },
              ],
            },
          }}
        />,
      );
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Show result for Inspect widget catalog' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Catalog component was not found.');
      expect(screen.getByRole('region')).not.toHaveTextContent('Widget catalog loaded.');
    },
  );
  it.each([
    { tool: shell, expected: 'windows sandbox failed: CreateProcessWithLogonW failed: 2' },
    {
      tool: {
        ...shell,
        presentation: undefined,
        state: 'denied' as const,
        error: 'Writes outside /workspace are blocked by the folder policy',
      },
      expected: 'Writes outside /workspace are blocked by the folder policy',
    },
    {
      tool: {
        ...shell,
        presentation: { ...shell.presentation!, blocks: [], diagnostic: 'Runtime unavailable' },
      },
      expected: 'Runtime unavailable',
    },
    {
      tool: {
        ...shell,
        presentation: {
          ...shell.presentation!,
          blocks: [{ id: 't', type: 'terminal' as const, timed_out: true }],
        },
      },
      expected: 'Process timed out.',
    },
    {
      tool: {
        ...shell,
        presentation: {
          ...shell.presentation!,
          blocks: [{ id: 't', type: 'terminal' as const, exit_code: 1 }],
        },
      },
      expected: 'Process exited with code 1. No diagnostic output was recorded.',
    },
  ])('preserves the reason: $expected', ({ tool, expected }) => {
    expect(getToolFailureDetail(tool)).toBe(expected);
  });
  // The denied row already says Denied and who decided, so a reason that only restates
  // the refusal is not repeated in the opened body.
  it.each(['Permission denied by user', 'Denied by you', 'denied.'])(
    'does not repeat a refusal that only restates the decision: %s',
    (error) => {
      const tool = { ...shell, presentation: undefined, state: 'denied' as const, error };
      expect(getToolFailureDetail(tool)).toBeUndefined();
      expect(getToolFailureDetail({ ...tool, state: 'failed' })).toBe(error);
    },
  );
});
