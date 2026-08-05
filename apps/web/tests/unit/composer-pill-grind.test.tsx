/**
 * P5 composer-pill grind (docs/p5/conformance/composer-pill.json, PASS 1
 * re-verify). Failing-first locks for the items the map found not-"match":
 * the ctx-side separator's independence from async, the placement chip's
 * click-through + static dot, the async-runs popover (component + wiring),
 * textarea autogrow, and the `@` picker's real workspace-files backing.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { AsyncRunsPopover, type AsyncRunItem } from '../../src/composer/AsyncRunsPopover';
import { Composer } from '../../src/composer/Composer';
import { SessionView } from '../../src/session/SessionView';

describe('pill separators — the ctx-side hairline is independent of async', () => {
  it('renders exactly one separator (placement -> ctx) when there is no async chip', () => {
    const { container } = render(
      <Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" contextPercent={7} />,
    );
    expect(container.querySelectorAll('.composer__pillsep')).toHaveLength(1);
  });

  it('renders both separators when async and ctx are both present', () => {
    const { container } = render(
      <Composer
        onSubmit={vi.fn()}
        placement="ares:/scratch/j4471"
        asyncCount={2}
        contextPercent={41}
      />,
    );
    expect(container.querySelectorAll('.composer__pillsep')).toHaveLength(2);
  });

  it('renders exactly one separator (placement -> async) when there is no ctx chip', () => {
    const { container } = render(
      <Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" asyncCount={2} />,
    );
    expect(container.querySelectorAll('.composer__pillsep')).toHaveLength(1);
  });

  it('renders no separator when only placement is present', () => {
    const { container } = render(
      <Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" />,
    );
    expect(container.querySelectorAll('.composer__pillsep')).toHaveLength(0);
  });
});

describe('placement chip — click-through and the static location dot', () => {
  it('becomes a real button that opens the files browser when onOpenPlacement is wired', () => {
    const onOpenPlacement = vi.fn();
    render(
      <Composer
        onSubmit={vi.fn()}
        placement="ares:/scratch/j4471"
        onOpenPlacement={onOpenPlacement}
      />,
    );
    const chip = screen.getByTitle('Open files');
    expect(chip.tagName).toBe('BUTTON');
    fireEvent.click(chip);
    expect(onOpenPlacement).toHaveBeenCalledTimes(1);
  });

  it('renders as inert text (no button) when onOpenPlacement is not supplied', () => {
    render(<Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" />);
    const chip = screen.getByText('ares:/scratch/j4471').closest('.kit-chip');
    expect(chip?.tagName).toBe('SPAN');
  });

  it('carries a static location dot, not a pulsing activity dot', () => {
    const { container } = render(
      <Composer onSubmit={vi.fn()} placement="ares:/scratch/j4471" />,
    );
    expect(container.querySelector('.composer__placementdot')).not.toBeNull();
    // The pill must not misuse the shared activity vocabulary (running/
    // queued/error) for a control that never pulses.
    expect(container.querySelector('.composer__placementchip .kit-statusdot')).toBeNull();
  });
});

describe('async runs popover — component behavior', () => {
  const TASKS: AsyncRunItem[] = [
    { id: 't1', label: 'visualization #1', status: 'running', placement: 'local', terminal: false },
    { id: 't2', label: 'analysis #1', status: 'completed', terminal: true },
  ];

  it('splits rows into the active list and the recently-finished section', () => {
    render(
      <AsyncRunsPopover
        open
        tasks={TASKS}
        dismissedIds={new Set()}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('visualization #1')).toBeInTheDocument();
    expect(screen.getByText('recently finished')).toBeInTheDocument();
    expect(screen.getByText('analysis #1')).toBeInTheDocument();
  });

  it('dismissing a finished row hides it and calls onDismiss with its id', () => {
    const onDismiss = vi.fn();
    render(
      <AsyncRunsPopover
        open
        tasks={TASKS}
        dismissedIds={new Set()}
        onDismiss={onDismiss}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss analysis #1/i }));
    expect(onDismiss).toHaveBeenCalledWith('t2');
  });

  it('an already-dismissed id is not rendered', () => {
    render(
      <AsyncRunsPopover
        open
        tasks={TASKS}
        dismissedIds={new Set(['t2'])}
        onDismiss={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('recently finished')).toBeNull();
    expect(screen.queryByText('analysis #1')).toBeNull();
    // The active row is untouched by dismissal.
    expect(screen.getByText('visualization #1')).toBeInTheDocument();
  });

  it('the run-history link fires onOpenHistory and closes the popover', () => {
    const onOpenHistory = vi.fn();
    const onClose = vi.fn();
    render(
      <AsyncRunsPopover
        open
        tasks={TASKS}
        dismissedIds={new Set()}
        onDismiss={vi.fn()}
        onOpenHistory={onOpenHistory}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /run history/i }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('states plainly when there are no async runs at all', () => {
    render(
      <AsyncRunsPopover open tasks={[]} dismissedIds={new Set()} onDismiss={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/no async runs/i)).toBeInTheDocument();
  });
});

describe('async runs popover — wired through the composer chip', () => {
  const TASKS: AsyncRunItem[] = [
    { id: 't1', label: 'visualization #1', status: 'running', terminal: false },
    { id: 't2', label: 'analysis #1', status: 'completed', terminal: true },
  ];

  it('opens the popover instead of jumping straight to onOpenAsync when asyncTasks is supplied', () => {
    const onOpenAsync = vi.fn();
    render(
      <Composer onSubmit={vi.fn()} asyncCount={1} asyncTasks={TASKS} onOpenAsync={onOpenAsync} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /async 1/ }));
    expect(screen.getByRole('dialog', { name: /async agents/i })).toBeInTheDocument();
    expect(onOpenAsync).not.toHaveBeenCalled();
  });

  it('falls back to a direct onOpenAsync jump when asyncTasks is omitted (prior behavior)', () => {
    const onOpenAsync = vi.fn();
    render(<Composer onSubmit={vi.fn()} asyncCount={1} onOpenAsync={onOpenAsync} />);
    fireEvent.click(screen.getByRole('button', { name: /async 1/ }));
    expect(onOpenAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /async agents/i })).toBeNull();
  });

  it('shows the recently-finished badge only while an undismissed finished run is pending review', () => {
    const { container } = render(<Composer onSubmit={vi.fn()} asyncCount={1} asyncTasks={TASKS} />);
    expect(container.querySelector('.composer__asyncchip[data-badge="true"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /async 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss analysis #1/i }));
    expect(container.querySelector('.composer__asyncchip[data-badge="true"]')).toBeNull();
  });
});

describe('textarea autogrow', () => {
  it('grows with content up to the 180px cap and shrinks back down when cleared', () => {
    render(<Composer models={[]} modelId="" onModelChange={() => {}} onSubmit={() => {}} />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    let mockScrollHeight = 26;
    Object.defineProperty(box, 'scrollHeight', {
      configurable: true,
      get: () => mockScrollHeight,
    });

    mockScrollHeight = 90;
    fireEvent.change(box, { target: { value: 'line one\nline two\nline three' } });
    expect(box.style.height).toBe('90px');

    mockScrollHeight = 400; // far past the cap
    fireEvent.change(box, { target: { value: 'x'.repeat(2000) } });
    expect(box.style.height).toBe('180px');

    mockScrollHeight = 22;
    fireEvent.change(box, { target: { value: '' } });
    expect(box.style.height).toBe('22px');
  });
});

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
] as unknown as Session[];
const MESSAGES: Message[] = [
  { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'ready' }] },
] as unknown as Message[];

function client(overrides: Record<string, unknown> = {}): Client {
  return {
    baseUrl: 'http://live.test',
    messages: vi.fn(async () => ({ messages: MESSAGES })),
    getSession: vi.fn(async () => ({
      id: 'sess_a',
      workspace_id: 'ws_default',
      mode: 'edit',
      approval_mode: 'ask',
    })),
    workspaces: vi.fn(async () => ({
      workspaces: [{ id: 'ws_default', name: 'clio-agent', root_path: '/work/clio-agent' }],
    })),
    workspaceFiles: vi.fn(async () => ({ files: [], next_cursor: null })),
    commands: vi.fn(async () => ({ commands: [] })),
    get: vi.fn(async (path: string) => {
      if (path.includes('/agent-tasks')) return { tasks: [] };
      if (path.includes('/context/state')) return { used_pct: 0 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    }),
    ...overrides,
  } as unknown as Client;
}

async function selectSession(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
  await screen.findByText('ready');
}

describe('SessionView wiring — the `@` picker is backed by real workspace files', () => {
  it('calls client.workspaceFiles for the session workspace and lists real (non-directory) entries', async () => {
    const workspaceFiles = vi.fn(async () => ({
      files: [
        { path: 'src/App.tsx', type: 'file' },
        { path: 'src/kit', type: 'directory' },
      ],
      next_cursor: null,
    }));
    render(<SessionView client={client({ workspaceFiles })} sessions={SESSIONS} />);
    await selectSession();

    const box = screen.getByRole('textbox', { name: /message/i });
    fireEvent.change(box, { target: { value: '@' } });

    const list = await screen.findByRole('listbox', { name: /files/i });
    expect(within(list).getByText('App.tsx')).toBeInTheDocument();
    // Directories are excluded — the reference picker only offers real files.
    expect(within(list).queryByText('kit')).toBeNull();
    expect(workspaceFiles).toHaveBeenCalledWith('ws_default', expect.objectContaining({ limit: 500 }));
  });
});

describe('SessionView wiring — the placement chip opens this session’s files', () => {
  it('opens the files layer for the active session’s own workspace on click', async () => {
    render(<SessionView client={client()} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByTitle('Open files'));
    const dialog = await screen.findByRole('dialog', { name: 'files' });
    expect(dialog).toHaveTextContent('clio-agent');
  });
});

describe('SessionView wiring — the async chip carries real agent-task rows', () => {
  it('opens a popover fed by the session’s own agent-tasks, classified active vs finished', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes('/agent-tasks')) {
        return {
          tasks: [
            { task_id: 't1', run_label: 'visualization #1', status: 'running' },
            { task_id: 't2', run_label: 'analysis #1', status: 'completed' },
          ],
        };
      }
      if (path.includes('/context/state')) return { used_pct: 10 };
      if (path.includes('/artifacts')) return { artifacts: [] };
      throw new Error(`unstubbed GET ${path}`);
    });
    render(<SessionView client={client({ get })} sessions={SESSIONS} />);
    await selectSession();

    const chip = await screen.findByRole('button', { name: /async 1/ });
    fireEvent.click(chip);

    const popover = await screen.findByRole('dialog', { name: /async agents/i });
    expect(within(popover).getByText('visualization #1')).toBeInTheDocument();
    expect(within(popover).getByText('analysis #1')).toBeInTheDocument();
    expect(within(popover).getByText('recently finished')).toBeInTheDocument();
  });
});
