import { scienceLogSchema, type ScienceStudy } from '@clio/core/v3';
import { studyGraphFixture as study } from '../../../tests/fixtures/science-log-graph';
import {
  cleanup,
  render as renderBare,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScienceLogView } from './science-log-tab';
import { studyGraph, studyGraphNeighborhood, studyGraphOverview } from './study-graph-model';
import { TooltipProvider } from '@/components/ui/tooltip';

const render = (ui: ReactElement, options?: RenderOptions) =>
  renderBare(ui, { wrapper: TooltipProvider, ...options });

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  BackgroundVariant: { Dots: 'dots' },
  MarkerType: { ArrowClosed: 'closed' },
  useReactFlow: () => ({ setViewport: () => Promise.resolve(true) }),
  // A phone-width pane at the readable floor, scrolled to the drawing's top-left.
  useStore: (select: (state: unknown) => unknown) =>
    select({ transform: [0, 0, 0.85], width: 368, height: 600 }),
  Handle: () => null,
  Background: () => null,
  Controls: () => null,
  ReactFlow: ({
    nodes,
    nodeTypes,
    children,
  }: {
    nodes: { id: string; data: Record<string, unknown> }[];
    nodeTypes: Record<string, (props: { data: Record<string, unknown> }) => ReactNode>;
    children: ReactNode;
  }) => (
    <div>
      {nodes.map((node) => (
        <div key={node.id}>{nodeTypes['science-entry']!({ data: node.data })}</div>
      ))}
      {children}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const entry = (
  id: string,
  branch: string,
  type: string,
  fields: Record<string, unknown>,
  links: { to: string; relation: string }[] = [],
  status = '',
) => ({
  id,
  branch,
  session: branch,
  type,
  fields,
  links,
  status,
  created_at: `2026-10-27T10:00:00Z`,
  invocation: `call-${id}`,
});

/** One experiment observed 20 times, and one evidence entry citing every observation. */
const trialsStudy = (): ScienceStudy =>
  scienceLogSchema.parse({
    ...study,
    entries: [
      entry('q', 'root', 'question', { statement: 'Which strategy is best?' }),
      entry('h', 'root', 'hypothesis', { claim: 'A beats B' }, [{ to: 'q', relation: 'question' }]),
      entry('e', 'trial', 'experiment', { method: '20 trials' }, [
        { to: 'h', relation: 'hypothesis' },
      ]),
      ...Array.from({ length: 20 }, (_, i) =>
        entry(`o${i}`, 'trial', 'observation', { result: `trial ${i}` }, [
          { to: 'e', relation: 'experiment' },
        ]),
      ),
      entry('v', 'trial', 'evidence', { interpretation: 'A wins' }, [
        ...Array.from({ length: 20 }, (_, i) => ({ to: `o${i}`, relation: 'observation' })),
        { to: 'h', relation: 'supports' },
      ]),
    ],
  }) as ScienceStudy;

describe('study overview', () => {
  it("draws an experiment's observations as one node with counted links", () => {
    const overview = studyGraphOverview(trialsStudy());
    expect(overview.nodes.map((node) => node.id).sort()).toEqual(['e', 'group:e', 'h', 'q', 'v']);
    expect(overview.nodes.find((node) => node.id === 'group:e')).toMatchObject({
      title: '20 observations',
      members: Array.from({ length: 20 }, (_, i) => `o${i}`),
    });
    expect(overview.edges).toContainEqual(
      expect.objectContaining({
        source: 'group:e',
        target: 'e',
        relation: 'experiment',
        count: 20,
      }),
    );
    expect(overview.edges).toContainEqual(
      expect.objectContaining({
        source: 'v',
        target: 'group:e',
        relation: 'observation',
        count: 20,
      }),
    );
  });

  it('shows every grouped observation in the log from the graph', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView sessionId="root" study={trialsStudy()} />);
    await user.click(screen.getByRole('tab', { name: 'Study graph' }));
    const frame = screen.getByRole('toolbar', { name: 'Science log' });
    expect(within(frame).getByText('24 entries')).toBeVisible();
    expect(within(frame).getByText('43 links')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Observations: 20 observations/u }));
    await user.click(within(frame).getByRole('button', { name: 'Show in log' }));
    expect(screen.getByRole('tab', { name: 'Log' })).toHaveAttribute('aria-selected', 'true');
    expect(within(frame).getByText('20 observations')).toBeVisible();
    const log = screen.getByRole('list', { name: 'Science log entries' });
    expect(within(log).getAllByText(/^trial \d+$/u)).toHaveLength(20);
  });
});

describe('recorded study graph', () => {
  it('keeps citation direction, cross-branch links, hypothesis states and conflict links', () => {
    const graph = studyGraph(study);
    expect(graph.nodes).toHaveLength(7);
    expect(graph.edges).toHaveLength(7);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: 'c', target: 'e', relation: 'cites' }),
    );
    expect(graph.edges.filter((edge) => edge.source === 'x').map((edge) => edge.target)).toEqual([
      'h',
      'h2',
    ]);
    expect(graph.nodes.find((node) => node.id === 'h')).toMatchObject({
      branch: 'Original trial',
      state: { label: 'supported' },
    });
    expect(graph.nodes.find((node) => node.id === 'h2')).toMatchObject({
      branch: 'Alternative trial',
      state: { label: 'open' },
    });
    expect(graph.edges).not.toContainEqual(expect.objectContaining({ source: 'h', target: 'h2' }));
  });

  it('keeps unresolved targets visible instead of dropping their references', () => {
    const missing = {
      ...study,
      entries: [
        entry('a', 'root', 'evidence', {}, [{ relation: 'supports', to: 'missing' }]),
        entry('b', 'root', 'evidence', {}, [{ relation: 'cites', to: 'missing' }]),
      ],
    } as ScienceStudy;
    const graph = studyGraph(missing);
    expect(graph.nodes.filter((node) => node.missing)).toEqual([
      expect.objectContaining({
        id: 'missing',
        missing: true,
        state: { label: 'unavailable', tone: 'neutral' },
      }),
    ]);
    expect(graph.edges).toHaveLength(2);
  });

  it('focuses both incoming and outgoing links without adding transitive relations', () => {
    const graph = studyGraphNeighborhood(studyGraph(study), 'x');
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(['c', 'h', 'h2', 'x']);
    expect(graph.edges).toHaveLength(3);
    expect(graph.nodes.some((node) => node.id === 'q')).toBe(false);
  });

  it('preserves cycles and relation labels rather than forcing a scientific DAG', () => {
    const cyclic = {
      ...study,
      entries: [
        entry('a', 'root', 'evidence', {}, [{ relation: 'related_to', to: 'b' }]),
        entry('b', 'root', 'evidence', {}, [{ relation: 'related_to', to: 'a' }]),
      ],
    } as ScienceStudy;
    expect(studyGraph(cyclic).edges).toMatchObject([
      { source: 'a', target: 'b', relation: 'related to' },
      { source: 'b', target: 'a', relation: 'related to' },
    ]);
    expect(studyGraph({ ...study, entries: [] })).toEqual({ nodes: [], edges: [] });
  });
});

describe('science log graph navigation', () => {
  const facts = () => screen.getByRole('toolbar', { name: 'Science log' });

  it('selects a graph node, narrows to its links and shows it in the log', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView study={study} sessionId="root" />);
    expect(screen.getByRole('group', { name: 'Study tree' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Study graph' }));
    const scope = within(facts()).getByRole('button', {
      name: 'Only the selected entry and its links',
    });
    expect(scope).toHaveAttribute('aria-disabled', 'true');
    const graph = screen.getByRole('region', { name: 'Study relationship graph' });
    const node = within(graph).getByRole('button', {
      name: /Hypothesis: Square-root temperature law/u,
    });
    await user.click(node);
    expect(node).toHaveAttribute('aria-pressed', 'true');
    await user.click(scope);
    expect(scope).toHaveAttribute('aria-pressed', 'true');
    expect(within(facts()).getByText('3 entries')).toBeVisible();
    expect(within(facts()).getByText('2 links')).toBeVisible();
    await user.click(within(facts()).getByRole('button', { name: 'Show in log' }));
    expect(screen.getByRole('tab', { name: 'Log' })).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('listitem', { name: 'Hypothesis: Square-root temperature law' }),
    ).toHaveAttribute('data-focused', 'true');
  });

  it('marks the edge the graph continues past when it opens at the readable floor', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView study={study} sessionId="root" />);
    await user.click(screen.getByRole('tab', { name: 'Study graph' }));
    const graph = screen.getByRole('region', { name: 'Study relationship graph' });
    const more = [...graph.querySelectorAll('[data-graph-more]')].map((edge) =>
      edge.getAttribute('data-graph-more'),
    );
    expect(more).toEqual(['right']);
  });

  it('renders new recorded links on a study update and never enables an unavailable entry', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ScienceLogView study={study} sessionId="root" />);
    await user.click(screen.getByRole('tab', { name: 'Study graph' }));
    expect(within(facts()).getByText('7 entries')).toBeVisible();
    expect(within(facts()).getByText('7 links')).toBeVisible();
    const extra = entry('later', 'root', 'evidence', { interpretation: 'A new check' }, [
      { relation: 'cites', to: 'unavailable' },
    ]);
    rerender(
      <ScienceLogView
        study={{ ...study, entries: [...study.entries, extra] as ScienceStudy['entries'] }}
        sessionId="root"
      />,
    );
    expect(
      screen.getByRole('button', { name: /Entry: Unavailable entry unavailable/u }),
    ).toBeDisabled();
    expect(within(facts()).getByText('9 entries')).toBeVisible();
    expect(within(facts()).getByText('8 links')).toBeVisible();
  });

  it('keeps a log selection and the graph scope when switching modes', async () => {
    const user = userEvent.setup();
    render(<ScienceLogView study={study} sessionId="root" />);
    await user.click(
      screen.getByRole('button', { name: /^Conflict: Functional form remains unresolved/u }),
    );
    await user.click(screen.getByRole('tab', { name: 'Study graph' }));
    expect(
      screen.getByRole('button', { name: /^Conflict: Functional form remains unresolved/u }),
    ).toHaveAttribute('aria-pressed', 'true');
    const scope = within(facts()).getByRole('button', {
      name: 'Only the selected entry and its links',
    });
    await user.click(scope);
    expect(within(facts()).getByText('4 entries')).toBeVisible();
    expect(within(facts()).getByText('3 links')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Log' }));
    expect(document.getElementById('science-entry-x')).toHaveAttribute('data-focused', 'true');
    await user.click(screen.getByRole('tab', { name: 'Study graph' }));
    expect(within(facts()).getByText('4 entries')).toBeVisible();
    expect(
      within(facts()).getByRole('button', { name: 'Only the selected entry and its links' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not move document focus away from a graph selection', async () => {
    const user = userEvent.setup();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    render(<ScienceLogView study={study} sessionId="root" />);
    await user.click(screen.getByRole('tab', { name: 'Study graph' }));
    focus.mockClear();
    const graph = screen.getByRole('region', { name: 'Study relationship graph' });
    await user.click(
      within(graph).getByRole('button', { name: /Hypothesis: Square-root temperature law/u }),
    );
    expect(focus.mock.contexts).not.toContain(document.getElementById('science-entry-h2'));
    focus.mockRestore();
  });
});
