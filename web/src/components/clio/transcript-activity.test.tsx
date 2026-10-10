import type { ToolInvocation } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { ConversationTurn } from './conversation-turn';
import type { ConversationIteration } from './conversation-turn-model';
import { ClioToolInvocation } from './tool-invocation';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PresentationNavigation } from './presentation-navigation';

afterEach(cleanup);
it.each([true, false])(
  'shows a reasoning-only update as full text without a brain disclosure (streaming=%s)',
  async (streaming) => {
    const text = 'Creating inline SVG animation';
    const iteration: ConversationIteration = {
      id: 'i',
      index: 0,
      agentId: 'main',
      thinking: [{ id: 'r', text, label: 'Thinking', streaming }],
      nextThoughts: [],
      activity: [],
      tools: [],
      tasks: [],
      terminal: !streaming,
      interrupted: false,
      streaming,
      summary: text,
    };
    render(<ConversationTurn iterations={[iteration]} mode="chain" subagents={{}} />);
    expect(
      screen.queryByRole('button', { name: /^(Thinking|Reasoning):/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Activity:/ })).not.toBeInTheDocument();
    expect(await screen.findByText(text)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^(Thinking|Reasoning):/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByText('Thinking', { exact: true })).toHaveLength(0);
  },
);

it('keeps updates visible and opens complete tool details inline', async () => {
  const tool: ToolInvocation = {
    id: 'read',
    session_id: 's',
    name: 'fs_read_file',
    title: 'Read',
    state: 'succeeded',
    input: { path: 'notes.md' },
    output: 'Complete recorded file contents.',
    presentation: {
      action: 'Read',
      summary: '61 lines',
      subject: 'file',
      blocks: [
        { id: 'file', type: 'link', target: 'file', uri: 'D:/review/notes.md', label: 'notes.md' },
      ],
    },
  };
  const text = 'Read the notes before preparing the report.';
  const iteration: ConversationIteration = {
    id: 'i',
    index: 0,
    agentId: 'main',
    thinking: [{ id: 'r', text, label: 'Thinking', streaming: false }],
    nextThoughts: [text, 'The notes are ready for the report.'],
    activity: [{ kind: 'tool', id: tool.id, tool }],
    tools: [tool],
    tasks: [],
    terminal: true,
    interrupted: false,
    streaming: false,
    summary: text,
  };
  const openFile = vi.fn();
  const view = render(
    <PresentationNavigation.Provider value={{ artifacts: {}, subagents: {}, onOpenFile: openFile }}>
      <ConversationTurn iterations={[iteration]} mode="chain" subagents={{}} />
    </PresentationNavigation.Provider>,
  );
  expect(screen.getByRole('button', { name: 'Activity: Read files' })).toBeVisible();
  expect(await screen.findByText('The notes are ready for the report.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Reasoning:/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Activity:/ }));
  expect(await screen.findAllByText(text)).toHaveLength(2);
  expect(view.container.querySelector('[data-slot="transcript-activity-timeline"]')).not.toBeNull();
  expect(screen.queryByRole('button', { name: /Expand activity/ })).not.toBeInTheDocument();
  const detail = screen.getByRole('button', { name: 'Technical details for Read' });
  expect(detail).toHaveTextContent('notes.md');
  expect(detail).toHaveTextContent('61 lines');
  fireEvent.click(detail);
  expect(await screen.findByRole('region', { name: 'Read: Technical details' })).toHaveTextContent(
    'Complete recorded file contents.',
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'notes.md' }));
  expect(openFile).toHaveBeenCalledWith('D:/review/notes.md');
  view.rerender(
    <TooltipProvider>
      <ClioToolInvocation compact tool={tool} attention={{ share: 0.25, bucket: 1 }} />
    </TooltipProvider>,
  );
  expect(view.container.querySelector('[data-slot="attention-tool-badge"]')).toHaveTextContent(
    '25.0%',
  );
});
