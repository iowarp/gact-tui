import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FlowDiagramSpec } from '@/hooks/use-flow-presentation';
const mocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('./diagram-renderer', () => ({ renderPeleDiagram: mocks.render }));
import { FlowDiagram } from './flow-diagram';
import { scaleSvg } from './flow-railroad-marks';

beforeEach(() => {
  mocks.render
    .mockReset()
    .mockResolvedValue(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40"><g class="pele-node"><rect x="0" y="0" width="120" height="24"/><text>researcher</text></g></svg>',
    );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function spec(done: boolean): FlowDiagramSpec {
  const state = done
    ? ({ value: 'completed', label: 'Returned', word: 'returned', tone: 'done' } as const)
    : ({ value: 'running', label: 'Running', word: 'running', tone: 'running' } as const);
  return {
    kind: 'railroad',
    label: 'Research flow',
    railroad: {
      source: 'railroad-beta\n demo = terminal("researcher");',
      boxes: [],
      parallels: [],
      marks: [
        {
          key: 'researcher',
          title: `researcher: ${state.label}`,
          tone: state.tone,
          pick: { kind: 'closing', label: 'researcher', state, flow: 'demo', verdict: {} },
        },
      ],
    },
  };
}

it('updates status and accessible labels without laying out the same graph again', async () => {
  const view = render(<FlowDiagram spec={spec(false)} onSelect={() => undefined} />);
  await screen.findByRole('button', { name: 'researcher: Running' });
  expect(mocks.render).toHaveBeenCalledTimes(1);
  view.rerender(<FlowDiagram spec={spec(true)} onSelect={() => undefined} />);
  await screen.findByRole('button', { name: 'researcher: Returned' });
  expect(screen.getByRole('button', { name: 'researcher: Returned' })).toHaveClass('st-done');
  expect(mocks.render).toHaveBeenCalledTimes(1);
});

it('does not lay out an offscreen flow until it becomes active', async () => {
  const view = render(<FlowDiagram spec={spec(false)} active={false} />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mocks.render).not.toHaveBeenCalled();
  view.rerender(<FlowDiagram spec={spec(false)} active />);
  await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
  view.rerender(<FlowDiagram spec={spec(false)} active={false} />);
  view.rerender(<FlowDiagram spec={spec(false)} active />);
  expect(mocks.render).toHaveBeenCalledTimes(1);
});

it('does not shrink dense graph labels to fit the card', async () => {
  render(
    <FlowDiagram
      spec={{ kind: 'graph', source: 'graph LR; a-->b;', label: 'Graph', note: 'Graph shape' }}
    />,
  );
  await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
  expect(mocks.render.mock.calls[0]?.[2]).toBeUndefined();
  expect(screen.getByRole('img', { name: 'Graph' })).toHaveClass('overflow-auto');
  const svg = new DOMParser().parseFromString('<svg width="1800" height="400"/>', 'image/svg+xml')
    .documentElement as unknown as SVGElement;
  scaleSvg(svg, 1.5, 500);
  expect(svg.getAttribute('width')).toBe('1800');
  expect(svg.getAttribute('height')).toBe('400');
});
