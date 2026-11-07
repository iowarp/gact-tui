import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ToolInvocation } from '@clio/core/v3';
import '@/components/ai-elements/markdown';
import { ClioToolInvocation } from './tool-invocation';
import { PresentationNavigation } from './presentation-navigation';
import { withOperationOutcome } from './tool-operation-outcome';
import { ToolOperationValue } from './tool-operation-value';
import { ConversationTurn } from './conversation-turn';

afterEach(cleanup);
beforeEach(() => {
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
});
const tool = (name: string, input?: unknown, output?: unknown): ToolInvocation => ({
  id: 'call',
  session_id: 'parent',
  name,
  state: 'succeeded',
  input,
  output,
});
const children = {
  a: {
    id: 'a',
    session_id: 'parent',
    child_session_id: 'a-session',
    title: 'Build package',
    state: 'completed' as const,
  },
  b: {
    id: 'b',
    session_id: 'parent',
    child_session_id: 'b-session',
    title: 'Independent audit',
    state: 'completed' as const,
  },
};

describe('production operation readers', () => {
  it('opens an initial readable result without opening technical details', async () => {
    render(
      <ClioToolInvocation
        compact
        defaultOpen
        tool={tool(
          'get_task_result',
          { handle: 'audit' },
          { answer: '# Retained report\n\nActual result.' },
        )}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Retained report' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('renders a delegated assignment once inside the actual conversation activity', async () => {
    const call = tool(
      'spawn_agent_task',
      { name: 'Independent audit', agent: 'standard', task: 'Check the observations.' },
      { handle: 'b', session_id: 'b-session' },
    );
    const open = vi.fn();
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: children, onOpenSubagent: open }}
      >
        <ConversationTurn
          mode="chain"
          subagents={children}
          iterations={[
            {
              id: 'iteration',
              index: 0,
              agentId: 'main',
              thinking: [],
              nextThoughts: [],
              activity: [{ kind: 'tool', id: call.id, tool: call }],
              tools: [call],
              tasks: [],
              terminal: true,
              interrupted: false,
              streaming: false,
              summary: '',
            },
          ]}
        />
      </PresentationNavigation.Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Activity: Used tools' }));
    const links = screen.getAllByRole('button', { name: 'Independent audit' });
    expect(links).toHaveLength(1);
    await userEvent.click(links[0]);
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByText('Check the observations.')).not.toBeInTheDocument();
  });
  it('defers nested data until its disclosure opens, without dropping extra columns', async () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({
      a: i,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
      extra: { nested: { value: 'Retained hidden value' } },
    }));
    render(<ToolOperationValue value={rows} />);
    expect(screen.getAllByRole('row')).toHaveLength(13);
    expect(screen.queryByText('Retained hidden value')).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByText('All fields')[0]);
    await userEvent.click(screen.getByText('1 field'));
    expect(screen.getByText('Retained hidden value')).toBeVisible();
  });
  it('puts the actual returned reports in named tabs and mounts only the selected answer', async () => {
    render(
      <PresentationNavigation.Provider value={{ artifacts: {}, subagents: children }}>
        <ClioToolInvocation
          compact
          tool={tool(
            'wait_tasks',
            { tasks: ['a', 'b'] },
            {
              outcomes: [
                {
                  handle: 'a',
                  status: 'completed',
                  result: { answer: '# Build report\n\nOriginal inputs preserved.' },
                },
                {
                  handle: 'b',
                  status: 'completed',
                  result: { answer: '# Audit report\n\nCalibration gap retained.' },
                },
              ],
              pending: [],
            },
          )}
        />
      </PresentationNavigation.Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show result for Wait for' }));
    expect(await screen.findByRole('heading', { name: 'Build report' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Audit report' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Independent audit' }));
    expect(await screen.findByRole('heading', { name: 'Audit report' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Build report' })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Pending when|Return when|result collected/u),
    ).not.toBeInTheDocument();
  });
  it('separates task navigation from expanding the assignment', async () => {
    const open = vi.fn();
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: children, onOpenSubagent: open }}
      >
        <ClioToolInvocation
          compact
          tool={tool(
            'spawn_agent_task',
            {
              agent: 'reviewer',
              name: 'Independent audit',
              task: 'Audit every calibration interval.',
            },
            {
              handle: 'b',
              session_id: 'b-session',
              accepted: true,
              model: { ran: { model_id: 'model-1' } },
            },
          )}
        />
      </PresentationNavigation.Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Independent audit' }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByText('Audit every calibration interval.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show result for Delegate to' }));
    expect(screen.getByText('Audit every calibration interval.')).toBeVisible();
    expect(screen.queryByText(/Queued|Work:|inherited/u)).not.toBeInTheDocument();
  });
  it('paginates a large model table without building all its rows', async () => {
    render(
      <ClioToolInvocation
        compact
        tool={tool(
          'list_models',
          {},
          {
            models: Array.from({ length: 240 }, (_, i) => ({
              name: `Model ${i}`,
              context_tokens: 128000,
              vision: true,
              tools: true,
            })),
          },
        )}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show result for Find models' }));
    expect(screen.getAllByRole('row')).toHaveLength(13);
    expect(screen.queryByText('Model 239')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Model 12')).toBeVisible();
  });
  it('keeps structured literal data distinct from an escaped transport dump', async () => {
    render(
      <ClioToolInvocation
        compact
        tool={tool('third_party', {}, { enabled: false, count: 0, missing: null, text: '' })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show result for third_party' }));
    expect(screen.getByText('false')).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.getByText('null')).toBeVisible();
    expect(screen.getByText('Empty text')).toBeVisible();
    expect(screen.queryByText(/"enabled"/u)).not.toBeInTheDocument();
  });
  it('links the scope to a scoped memory list, not a nonexistent memory document', async () => {
    render(
      <MemoryRouter>
        <ClioToolInvocation
          compact
          tool={tool(
            'create_memory',
            { scope: 'account', subject: 'Colors' },
            { fact: { id: 'f', text: 'Blue' } },
          )}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show result for Remember' }));
    expect(screen.getByRole('link', { name: 'Personal' })).toHaveAttribute(
      'href',
      '/settings/memory?scope=user',
    );
  });
  it('marks explicit failed web requests as failures without rewriting arbitrary provider statuses', () => {
    const failed = tool('web_fetch', {}, { ok: false, error: 'Resource exceeds the fetch limit' });
    expect(withOperationOutcome(failed).presentation?.status).toBe('failed');
    const arbitrary = tool('third_party', {}, { status: 'failed' });
    expect(withOperationOutcome(arbitrary)).toBe(arbitrary);
    render(<ClioToolInvocation compact tool={failed} />);
    expect(screen.getByRole('status', { name: 'Failed' })).toBeVisible();
  });
  it('keeps exact source in the independent technical viewer', async () => {
    render(
      <ClioToolInvocation
        compact
        tool={tool('usage', { account: 'lab' }, { accounts: [{ name: 'Lab', cost: 0 }] })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Technical details for Read usage' }));
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'Arguments' }),
    ).toBeVisible();
  });
});
