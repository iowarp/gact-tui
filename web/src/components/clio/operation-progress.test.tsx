import {
  infrastructureOperationSchema,
  type InfrastructureOperation,
  type InfrastructureOperationEvent,
} from '@clio/core/v3';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ infrastructureOperationEvents: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

const xterm = vi.hoisted(() => {
  class MockTerminal {
    static instances: MockTerminal[] = [];
    options: Record<string, unknown>;
    write = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockTerminal.instances.push(this);
    }
  }
  class MockFitAddon {
    fit = vi.fn();
  }
  return { MockTerminal, MockFitAddon };
});
vi.mock('@xterm/xterm', () => ({ Terminal: xterm.MockTerminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: xterm.MockFitAddon }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

import { OperationProgress } from './operation-progress';

const record = (overrides: Record<string, unknown> = {}): InfrastructureOperation =>
  infrastructureOperationSchema.parse({
    id: 'op-1',
    service_id: 'vllm',
    target_id: 'local',
    action: 'install',
    state: 'running',
    progress: 'Pulling the vLLM image',
    logs: '',
    created_at: '2026-10-08T00:00:00Z',
    updated_at: '2026-10-08T00:00:00Z',
    started_at: new Date(Date.now() - 5_000).toISOString(),
    steps: [
      { id: 'inspect', label: 'Inspect host', state: 'succeeded', elapsed_seconds: 2 },
      {
        id: 'pull',
        label: 'Pull image',
        state: 'running',
        progress: { determinate: true, unit: 'bytes', current: 2e9, total: 8e9, fraction: 0.25 },
      },
      { id: 'build', label: 'Build environment', state: 'pending' },
    ],
    ...overrides,
  });

function streamOf(events: InfrastructureOperationEvent[], fail?: Error) {
  return async function* () {
    for (const event of events) yield await Promise.resolve(event);
    if (fail) throw fail;
  };
}

beforeEach(() => {
  repository.infrastructureOperationEvents.mockReset();
  xterm.MockTerminal.instances = [];
});
afterEach(cleanup);

describe('OperationProgress', () => {
  it('lists ordered steps with state, and a determinate bar where measured', async () => {
    repository.infrastructureOperationEvents.mockImplementation(
      streamOf([{ id: 0, type: 'operation.snapshot', operation: record() }]),
    );
    render(<OperationProgress onCancel={vi.fn()} operationId="op-1" title="vLLM install" />);
    const steps = await screen.findByRole('list', { name: 'Steps' });
    const items = within(steps).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Inspect host: Done',
      'Pull image: Running',
      'Build environment: Waiting',
    ]);
    const bar = screen.getByRole('progressbar', { name: 'Pull image progress' });
    expect(bar).toHaveAttribute('data-determinate', 'true');
    expect(within(items[1]!).getByText(/2\.0 GB of 8\.0 GB/u)).toBeVisible();
    expect(screen.getByText(/Elapsed \d+s/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel operation' })).toBeEnabled();
  });

  it('never fakes a percentage: an unmeasured step is indeterminate', async () => {
    repository.infrastructureOperationEvents.mockImplementation(
      streamOf([
        {
          id: 0,
          type: 'operation.snapshot',
          operation: record({
            steps: [
              {
                id: 'pull',
                label: 'Pull image',
                state: 'running',
                progress: { determinate: false, current: 3, unit: 'layers' },
              },
            ],
          }),
        },
      ]),
    );
    render(<OperationProgress operationId="op-1" title="vLLM install" />);
    const bar = await screen.findByRole('progressbar', { name: 'Pull image progress' });
    expect(bar).toHaveAttribute('data-determinate', 'false');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('3 layers')).toBeVisible();
  });

  it('shows reuse notes and offers a reinstall from scratch once finished', async () => {
    const onReinstall = vi.fn();
    const reuse = {
      kind: 'sif',
      thing: 'vLLM image',
      identity: 'sha256:abc',
      path: '/store/vllm.sif',
      message: 'Reusing vLLM image (sha256:abc); skipped 9.8 GB/~12m 34s',
    };
    const done = record({ state: 'succeeded', steps: [], reused: [reuse], elapsed_seconds: 30 });
    repository.infrastructureOperationEvents.mockImplementation(
      streamOf([
        { id: 0, type: 'operation.snapshot', operation: record({ steps: [] }) },
        { id: 1, type: 'operation.reuse', reuse },
        { id: 2, type: 'operation.completed', operation: done },
      ]),
    );
    const user = userEvent.setup();
    render(
      <OperationProgress
        onReinstallFromScratch={onReinstall}
        operationId="op-1"
        title="vLLM install"
      />,
    );
    expect(await screen.findByText(/Reusing vLLM image \(sha256:abc\); skipped/u)).toBeVisible();
    expect(screen.getByText('Elapsed 30s')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reinstall from scratch' }));
    expect(onReinstall).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'succeeded', elapsed_seconds: 30 }),
    );
    expect(screen.queryByRole('button', { name: 'Cancel operation' })).toBeNull();
  });

  it('sets the install expectation while running, and under a minute once reuse is reported', async () => {
    const reuse = {
      kind: 'sif',
      thing: 'vLLM image',
      identity: 'sha256:abc',
      path: '/store/vllm.sif',
      message: '',
    };
    repository.infrastructureOperationEvents.mockImplementation(
      streamOf([
        { id: 0, type: 'operation.snapshot', operation: record() },
        { id: 1, type: 'operation.reuse', reuse },
      ]),
    );
    render(
      <OperationProgress
        expectation={{ thing: 'vLLM', lastSeconds: 600 }}
        operationId="op-1"
        title="vLLM install"
      />,
    );
    expect(
      await screen.findByText(
        'Already available — reusing vLLM image; this should take under a minute.',
      ),
    ).toBeVisible();
  });

  it('keeps the several-minutes expectation for a from-scratch install, and drops it once ended', async () => {
    repository.infrastructureOperationEvents.mockImplementation(
      streamOf([{ id: 0, type: 'operation.snapshot', operation: record({ from_scratch: true }) }]),
    );
    const { rerender } = render(
      <OperationProgress
        expectation={{ thing: 'vLLM', lastSeconds: 600 }}
        operationId="op-1"
        title="vLLM install"
      />,
    );
    expect(await screen.findByText(/This can take several minutes/u)).toHaveTextContent(
      'Last install took ~10 min.',
    );
    repository.infrastructureOperationEvents.mockImplementation(
      streamOf([{ id: 0, type: 'operation.snapshot', operation: record({ id: 'op-2', state: 'succeeded' }) }]),
    );
    rerender(
      <OperationProgress
        expectation={{ thing: 'vLLM' }}
        key="op-2"
        operationId="op-2"
        title="vLLM install"
      />,
    );
    await waitFor(() => expect(screen.queryByText(/several minutes/u)).toBeNull());
  });

  it('writes the live log into the shared terminal view', async () => {
    repository.infrastructureOperationEvents.mockImplementation(
      streamOf([
        { id: 0, type: 'operation.snapshot', operation: record() },
        { id: 1, type: 'operation.log', log: { line: 'Copying blob 1/4', stream: 'stdout' } },
        { id: 2, type: 'operation.log', log: { line: 'Reusing env', stream: 'clio' } },
      ]),
    );
    const user = userEvent.setup();
    render(<OperationProgress operationId="op-1" title="vLLM install" />);
    await user.click(await screen.findByRole('button', { name: /Live log \(2 lines\)/u }));
    await waitFor(() => expect(xterm.MockTerminal.instances).toHaveLength(1));
    const terminal = xterm.MockTerminal.instances[0]!;
    expect(terminal.options).toMatchObject({ disableStdin: true });
    await waitFor(() => expect(terminal.write).toHaveBeenCalledTimes(2));
    expect(terminal.write.mock.calls[0]?.[0]).toBe('Copying blob 1/4\r\n');
    expect(String(terminal.write.mock.calls[1]?.[0])).toContain('Reusing env');
  });

  it('resumes a dropped stream from the last event id it holds', async () => {
    repository.infrastructureOperationEvents
      .mockImplementationOnce(
        streamOf(
          [
            { id: 0, type: 'operation.snapshot', operation: record() },
            { id: 3, type: 'operation.log', log: { line: 'one', stream: 'stdout' } },
          ],
          new Error('connection reset'),
        ),
      )
      .mockImplementation(
        streamOf([
          { id: 0, type: 'operation.snapshot', operation: record() },
          { id: 4, type: 'operation.log', log: { line: 'two', stream: 'stdout' } },
          { id: 5, type: 'operation.completed', operation: record({ id: 'op-2', state: 'succeeded' }) },
        ]),
      );
    render(<OperationProgress operationId="op-1" title="vLLM install" />);
    await waitFor(
      () => expect(repository.infrastructureOperationEvents).toHaveBeenCalledTimes(2),
      { timeout: 3000 },
    );
    expect(repository.infrastructureOperationEvents.mock.calls[0]?.[1]).toBeUndefined();
    expect(repository.infrastructureOperationEvents.mock.calls[1]?.[1]).toBe(3);
    expect(await screen.findByRole('button', { name: /Live log \(2 lines\)/u })).toBeVisible();
  });
});
