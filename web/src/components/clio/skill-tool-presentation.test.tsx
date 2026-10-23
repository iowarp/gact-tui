import type { ToolInvocation } from '@clio/core/v3';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';
import { withSkillPresentation } from './skill-tool-presentation';
import { PresentationNavigation } from './presentation-navigation';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function recordedSkill(file = ''): ToolInvocation {
  return {
    id: file || 'main',
    session_id: 'session',
    name: 'load_skill',
    state: 'succeeded',
    input: { skill_id: 'work-with-ndp', file, files: null },
    output: { skill_id: 'work-with-ndp', file, path: 'D:/skills/work-with-ndp/SKILL.md' },
    presentation: {
      action: 'Load skill',
      subject: 'skill-name',
      summary: '',
      blocks: [
        { id: 'skill-name', type: 'text', text: 'work-with-ndp' },
        {
          id: 'content',
          type: 'markdown',
          text: file
            ? '# Discover scientific collections\n\nRead actual measurements.'
            : '# Work with NDP\n\nFind the relevant observations.',
        },
      ],
    },
  };
}

describe('skill observations at three levels', () => {
  it('distinguishes the main procedure and the exact reference on the compact rows', () => {
    render(
      <>
        <ClioToolInvocation compact tool={recordedSkill()} />
        <ClioToolInvocation compact tool={recordedSkill('references/discovery-and-analysis.md')} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Show result for Load skill' })).toHaveTextContent(
      'Work with NDP',
    );
    const reference = screen.getByRole('button', { name: 'Show result for Read skill reference' });
    expect(reference).toHaveTextContent('references/discovery-and-analysis.md');
    expect(reference).toHaveTextContent('Discover scientific collections');
  });

  it('keeps source and purpose readable, with exact arguments and raw output in technical details', async () => {
    const user = userEvent.setup();
    const tool = recordedSkill('references/discovery-and-analysis.md');
    const before = JSON.stringify(tool);
    render(<ClioToolInvocation compact tool={tool} />);
    await user.click(screen.getByRole('button', { name: 'Show result for Read skill reference' }));
    const result = screen.getByRole('region', { name: 'Read skill reference: Result' });
    expect(result).toHaveTextContent('work-with-ndp');
    expect(result).toHaveTextContent('Read actual measurements.');
    expect(result).toHaveTextContent('File read');
    await user.click(
      screen.getByRole('button', { name: 'Technical details for Read skill reference' }),
    );
    const details = screen.getByRole('dialog');
    expect(within(details).getByRole('heading', { name: 'Arguments' })).toBeVisible();
    expect(details).toHaveTextContent('D:/skills/work-with-ndp/SKILL.md');
    expect(JSON.stringify(tool)).toBe(before);
  });

  it('does not send a reference-file open to the old SKILL.md path', async () => {
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
        <ClioToolInvocation compact tool={recordedSkill('references/catalog.md')} />
      </PresentationNavigation.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'Show result for Read skill reference' }));
    expect(screen.queryByRole('button', { name: 'SKILL.md' })).not.toBeInTheDocument();
    expect(opened).toEqual([]);
  });

  it('counts distinct batched files and preserves modern declared presentations', () => {
    const tool = recordedSkill('references/catalog.md');
    tool.input = {
      kwargs: {
        skill_id: 'work-with-ndp',
        file: 'references/catalog.md',
        files: ['references/catalog.md', 'references/streams.md'],
      },
    };
    expect(withSkillPresentation(tool).presentation?.blocks[0].text).toBe('2 reference files');
    const modern = {
      ...tool,
      presentation: {
        action: 'Read skill reference',
        subject: 'skill-reference',
        summary: 'Scientific data',
        blocks: [{ id: 'skill-reference', type: 'text' as const, text: 'references/catalog.md' }],
      },
    };
    expect(withSkillPresentation(modern)).toBe(modern);
    const failed = { ...tool, state: 'failed' as const, error: 'Reference not found' };
    expect(withSkillPresentation(failed)).toBe(failed);
  });

  it('explains an empty shell result without claiming the folder was empty', async () => {
    const user = userEvent.setup();
    render(
      <ClioToolInvocation
        compact
        tool={{
          id: 'shell',
          session_id: 'session',
          name: 'shell_bash',
          state: 'succeeded',
          presentation: {
            action: 'Run',
            summary: 'exit 0',
            blocks: [
              {
                id: 'terminal',
                type: 'terminal',
                command: 'Get-ChildItem -Force',
                text: '',
                exit_code: 0,
                detail: 'Working directory: D:/workspace',
              },
            ],
          },
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Show result for Run' }));
    expect(screen.getByText('Working directory: D:/workspace')).toBeVisible();
    expect(screen.getByText('No stdout or stderr was recorded.')).toBeVisible();
    expect(screen.getByText('Process exited with code 0.')).toBeVisible();
  });

  it('keeps the recorded discovery description in the full skill viewer and removes loader instructions', async () => {
    const user = userEvent.setup();
    vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(
      Array.from({ length: 45 }, (_, i) => ({
        top: i * 24,
        bottom: (i + 1) * 24,
        width: 100,
        height: 24,
      })) as unknown as DOMRectList,
    );
    const tool = recordedSkill();
    tool.output = {
      ...(tool.output as Record<string, unknown>),
      skill_description: 'Use when the user asks to find and analyze scientific observations.',
    };
    tool.presentation!.blocks[1].text =
      'Skill directory (use as SKILL_ROOT): D:/skills/work-with-ndp\n# Work with NDP\n\nOriginal scientific procedure.';
    const original = JSON.stringify(tool);
    render(<ClioToolInvocation compact tool={tool} />);
    await user.click(screen.getByRole('button', { name: 'Show result for Load skill' }));
    const result = screen.getByRole('region', { name: 'Load skill: Result' });
    expect(result).toHaveTextContent(
      'When to use: Use when the user asks to find and analyze scientific observations.',
    );
    expect(result).not.toHaveTextContent('SKILL_ROOT');
    await user.click(within(result).getByRole('button', { name: 'Show more' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(
      'When to use: Use when the user asks to find and analyze scientific observations.',
    );
    expect(dialog).toHaveTextContent('Original scientific procedure.');
    expect(dialog).not.toHaveTextContent('Full output, kept separate');
    expect(dialog).not.toHaveTextContent('SKILL_ROOT');
    await user.click(within(dialog).getByText('Source', { exact: true }));
    expect(within(dialog).getByText('D:/skills/work-with-ndp', { exact: true })).toBeVisible();
    expect(JSON.stringify(tool)).toBe(original);
  });
});
