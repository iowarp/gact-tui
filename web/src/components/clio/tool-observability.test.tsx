import type { ToolInvocation } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import '@/components/ai-elements/markdown';
import { ClioToolInvocation } from './tool-invocation';
import { getToolFailureDetail } from './tool-presentation';
import { PresentationNavigation } from './presentation-navigation';

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
      action: 'Get execution environment',
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
    await user.click(screen.getByRole('button', { name: 'Show result for Create Artifact' }));
    const result = screen.getByRole('region');
    expect(result).toHaveTextContent('Created version 1');
    expect(result).not.toHaveTextContent('RAW SVG DATA');
    await user.click(within(result).getByRole('button', { name: 'raccoon.svg' }));
    expect(opened).toEqual(['D:/workspace/raccoon.svg']);
  });

  it('shows recorded shell failure diagnostics on hover, focus and expansion', async () => {
    const user = userEvent.setup();
    render(<ClioToolInvocation compact tool={shell} />);
    const row = screen.getByRole('button', { name: 'Show result for Run' });
    await user.hover(row);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'CreateProcessWithLogonW failed: 2',
    );
    await user.unhover(row);
    await user.tab();
    expect(row).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'CreateProcessWithLogonW failed: 2',
    );
    await user.keyboard('{Enter}');
    const result = screen.getByRole('region');
    expect(within(result).getByRole('alert')).toHaveTextContent(
      'CreateProcessWithLogonW failed: 2',
    );
    expect(result).toHaveTextContent('Process exited with code 1.');
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
      .click(screen.getByRole('button', { name: 'Show result for Generate widget' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'must contain exactly one id="root" component',
    );
    expect(screen.getByRole('region')).not.toHaveTextContent('ok=false');
  });

  it('keeps the row focused when a running call becomes a semantic failure', async () => {
    const user = userEvent.setup();
    const view = render(
      <ClioToolInvocation
        compact
        tool={{
          ...shell,
          state: 'running',
          presentation: { action: 'Run', summary: '', blocks: [] },
        }}
      />,
    );
    const row = screen.getByRole('button', { name: 'Show result for Run' });
    row.focus();
    view.rerender(<ClioToolInvocation compact tool={shell} />);
    expect(row).toHaveFocus();
    await user.hover(row);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'CreateProcessWithLogonW failed: 2',
    );
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
    expect(row).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
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
    expect(screen.getByRole('region')).toHaveTextContent('No formatted result was recorded');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Technical details for external_tool' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('payload data');
  });
});

describe('recorded failure detail selection', () => {
  it.each([
    { tool: shell, expected: 'windows sandbox failed: CreateProcessWithLogonW failed: 2' },
    {
      tool: {
        ...shell,
        presentation: undefined,
        state: 'denied' as const,
        error: 'Permission denied by user',
      },
      expected: 'Permission denied by user',
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
});
