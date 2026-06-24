import { render, screen, cleanup, within, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionTree } from '../../src/components/ExecutionTree.js';
import type { ProjectedExecutionNode } from '../../src/components/executionProjectionTypes.js';

afterEach(cleanup);

/**
 * The hierarchical agent-execution tree (TUI parity, cf.
 * tui/internal/ui/execution_render.go) renders projected nodes as an indented,
 * interactive hierarchy: depth-driven indentation, a "↳ parent → child"
 * delegation header, and a tool result collapsed to ~3 lines that expands on
 * click. These guard that behaviour.
 */
describe('ExecutionTree', () => {
  it('indents nodes by delegation depth', () => {
    const nodes: ProjectedExecutionNode[] = [
      { kind: 'text', agent: 'main', depth: 0, text: 'Working on it.' },
      { kind: 'handoff', agent: 'data', parent: 'main', depth: 1, question: 'go' },
      { kind: 'handoff', agent: 'ndp_expert', parent: 'data', depth: 2, question: 'rank' },
    ];
    render(() => <ExecutionTree nodes={nodes} />);
    const all = screen.getAllByTestId('execution-tree-node');
    expect(all).toHaveLength(3);
    const r0 = all[0]!;
    const r1 = all[1]!;
    const r2 = all[2]!;
    expect(r0.getAttribute('data-depth')).toBe('0');
    expect(r1.getAttribute('data-depth')).toBe('1');
    expect(r2.getAttribute('data-depth')).toBe('2');

    // Indentation grows strictly with depth (one level deeper per delegation).
    const pad = (node: HTMLElement) => {
      const row = node.querySelector('.extree__row') as HTMLElement;
      return parseInt(row.style.paddingLeft || '0', 10);
    };
    expect(pad(r0)).toBe(0);
    expect(pad(r1)).toBeGreaterThan(pad(r0));
    expect(pad(r2)).toBeGreaterThan(pad(r1));
  });

  it('renders a "parent → child" delegation header for a handoff', () => {
    const nodes: ProjectedExecutionNode[] = [
      {
        kind: 'handoff',
        agent: 'geospatial',
        parent: 'main',
        depth: 1,
        question: 'Resolve the bounding box.',
      },
    ];
    render(() => <ExecutionTree nodes={nodes} />);
    const handoff = screen
      .getAllByTestId('execution-tree-node')
      .find((n) => n.getAttribute('data-kind') === 'handoff')!;
    const head = handoff.querySelector('.extree__handoff-head') as HTMLElement;
    expect(within(head).getByText('main')).toBeTruthy();
    expect(within(head).getByText('geospatial')).toBeTruthy();
    expect(head.textContent).toContain('→');
    // The handoff question is shown as prose under the header.
    expect(handoff.textContent).toContain('Resolve the bounding box.');
  });

  it('collapses a tool observation to a preview and expands it on click', () => {
    // A long, generic observation (not a tool with a bespoke short preview) so
    // the collapse-to-~3-lines + expand path is genuinely exercised.
    const observation =
      'a much longer trailing body that only appears when the observation is expanded. '.repeat(8);
    const nodes: ProjectedExecutionNode[] = [
      {
        kind: 'step',
        agent: 'data',
        depth: 1,
        reasoning: 'Inspect the staged dataset before ranking.',
        toolName: 'inspect_dataset',
        toolArgs: { path: '/tmp/run/stations.csv' },
        observation,
        isFinish: false,
      },
    ];
    render(() => <ExecutionTree nodes={nodes} />);

    // The tool call is queryable by tool name.
    expect(screen.getByTestId('execution-tree-tool')).toBeTruthy();
    expect(screen.getByTestId('toolcall-inspect_dataset')).toBeTruthy();

    // The observation is a <details> that starts collapsed and opens on click.
    const obs = screen.getByTestId('execution-tree-observation') as HTMLDetailsElement;
    expect(obs.open).toBe(false);
    expect(screen.getByTestId('execution-tree-observation-toggle')).toBeTruthy();
    fireEvent.click(obs.querySelector('summary')!);
    expect(obs.open).toBe(true);
  });

  it('renders an agent report header', () => {
    const nodes: ProjectedExecutionNode[] = [
      {
        kind: 'report',
        agent: 'geospatial',
        depth: 1,
        text: 'Los Angeles resolved.',
        structured: { region_name: 'Los Angeles', center_lat: 34.05, center_lon: -118.24 },
      },
    ];
    render(() => <ExecutionTree nodes={nodes} />);
    const report = screen
      .getAllByTestId('execution-tree-node')
      .find((n) => n.getAttribute('data-kind') === 'report')!;
    expect(report.textContent).toContain('geospatial');
    expect(report.textContent).toContain('returned');
  });
});
