/**
 * Transcript contract (gact-tui#333).
 *
 * ONE part-renderer registry. The legacy tree's dual pipeline dies with it —
 * there is exactly one path from a wire part to a rendered part, and an
 * unknown kind is SURFACED, never dropped.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { ChildFocusView } from '../../src/session/ChildFocusView';
import { Transcript } from '../../src/transcript/Transcript';
import { PART_RENDERERS } from '../../src/transcript/registry';

function msg(id: string, role: Message['role'], parts: unknown[]): Message {
  return { id, role, parts: parts as Message['parts'] };
}

describe('part renderer registry', () => {
  it('covers the part kinds the backend actually emits today', () => {
    // Kinds proven present in clio-agent develop. a2ui/permission are P3 and
    // deliberately absent until the backend emits them.
    for (const kind of [
      'text',
      'thinking',
      'tool_call',
      'tool_result',
      'expert_handoff',
      'routing_decision',
      'resource_link',
      'file_diff',
      'compaction',
      'error',
      // Shipped in P2.11 / P2.14 — verified against the emitters:
      // gact/agent_messaging.py:116 and gact/background_exit.py:46.
      'background_exit',
      'agent_message',
    ]) {
      expect(PART_RENDERERS[kind], `no renderer for "${kind}"`).toBeDefined();
    }
  });
});

describe('Transcript', () => {
  it('renders a user message', () => {
    render(<Transcript messages={[msg('m1', 'user', [{ type: 'text', text: 'hello' }])]} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders assistant text', () => {
    render(
      <Transcript messages={[msg('m1', 'assistant', [{ type: 'text', text: 'the answer' }])]} />,
    );
    expect(screen.getByText('the answer')).toBeInTheDocument();
  });

  it('collapses thinking by default and expands on click', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { type: 'thinking', thinking: 'internal reasoning here', tokens: 77 },
          ]),
        ]}
      />,
    );
    const toggle = screen.getByRole('button', { name: /thinking/i });
    // Collapsed: the body is not rendered. No token count appears even though
    // the fixture carries one — the real wire has no such field
    // (clio-agent#1177) and a number the backend never sent must not render.
    expect(toggle).not.toHaveTextContent('77');
    expect(screen.queryByText('internal reasoning here')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('internal reasoning here')).toBeInTheDocument();
  });

  it('renders a tool call as a collapsed row that opens to prose params (E3/E4/E6)', () => {
    const { container } = render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'tool_call',
              id: 'tc1',
              name: 'geo_geocode',
              input: { query: 'Los Angeles, California', countrycodes: 'us' },
            },
          ]),
        ]}
      />,
    );
    // Closed by default — the prototype's isToolSeg fold, not a permanently
    // open card. The params are not in the DOM at all until opened.
    expect(screen.getByText('geo_geocode')).toBeInTheDocument();
    expect(container.querySelector('.part-toolrow__well')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /geo_geocode/ }));

    // The dt/dd grid died with slice E: args are key/value prose, not a
    // semantic definition list.
    expect(container.querySelector('.part-toolrow dl')).toBeNull();
    const args = container.querySelector('.part-toolrow__grid');
    expect(args?.textContent).toContain('Los Angeles, California');
  });

  it('renders an expert handoff as the prototype Call(child) heading', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'expert_handoff',
              child_agent: 'geospatial',
              stage: 'delegate.started',
              status: 'running',
              // The real wire nests the question under `metadata`
              // (contract/testdata/observed-parts-v0.3.json), never top-level
              // — `text` on this kind is router-only arrow prose instead.
              metadata: { question: 'Resolve Los Angeles into coordinates' },
            },
          ]),
        ]}
      />,
    );
    // One heading, not a bare name — `Call(geospatial)` is the prototype's form.
    expect(screen.getByText('Call(geospatial)')).toBeInTheDocument();
    expect(screen.getByText(/Resolve Los Angeles/)).toBeInTheDocument();
  });

  it('renders a returning handoff as its own child card, not parent prose', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'subagent_result',
              expert: 'geospatial',
              duration: '1m 12s',
              excerpt: 'Los Angeles resolves to 34.0537 N, 118.2428 W.',
            },
          ]),
        ]}
      />,
    );
    const card = screen.getByTestId('part-child-card');
    expect(card).toHaveTextContent('geospatial');
    expect(card).toHaveTextContent('1m 12s');
    expect(card).toHaveTextContent(/34.0537/);
  });

  it('merges tool_call + tool_result into ONE collapsible row, closed by default (E3/E6)', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'tool_call',
              call_id: 'call_1',
              tool_name: 'stage_resource',
              input: { resource: 'earthscope_stations.csv' },
            },
            {
              type: 'tool_result',
              call_id: 'call_1',
              is_error: false,
              duration_ms: 412,
              content: [{ type: 'text', text: 'staged 1,101 rows' }],
            },
          ]),
        ]}
      />,
    );
    // ONE row for the pair, not two permanently-open cards — and only ONE
    // wrench glyph, not a mismatched wrench-then-gear stack.
    expect(screen.getAllByTestId('part-tool')).toHaveLength(1);
    expect(screen.getAllByText('stage_resource')).toHaveLength(1);
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('0.4s')).toBeInTheDocument();
    // The full params/result well is closed by default (a short one-line
    // preview may still show — it's the SAME text, just not yet the well).
    expect(screen.queryByText('resource')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /stage_resource/ }));
    expect(screen.getByText('staged 1,101 rows')).toBeInTheDocument();
    expect(screen.getByText('resource')).toBeInTheDocument();
  });

  it('shows a failed tool result in full once opened — nothing cut mid-token (E6)', () => {
    const longError = "{'support': ".repeat(20) + 'x';
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { type: 'tool_call', call_id: 'call_2', tool_name: 'geo_geocode', input: {} },
            {
              type: 'tool_result',
              call_id: 'call_2',
              is_error: true,
              content: [{ type: 'text', text: longError }],
            },
          ]),
        ]}
      />,
    );
    expect(screen.getByText('✗')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /geo_geocode/ }));
    // The old truncator cut this at 120 chars mid-object; the full string
    // (well over 120 chars) must be present, verbatim.
    expect(longError.length).toBeGreaterThan(120);
    expect(screen.getByText(longError)).toBeInTheDocument();
  });

  it('renders a JSON-object tool result as a key/value table, not a raw blob (owner point d)', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { type: 'tool_call', call_id: 'call_3', tool_name: 'pandas_profile_csv', input: {} },
            {
              type: 'tool_result',
              call_id: 'call_3',
              is_error: false,
              content: [
                {
                  type: 'text',
                  text: '{"rows": 1101, "columns": ["time", "value"], "path": "gnss.csv"}',
                },
              ],
            },
          ]),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /pandas_profile_csv/ }));
    const table = screen.getByTestId('part-tool-result-table');
    // Every key/value from the wire renders — restructured, never dropped.
    expect(table).toHaveTextContent('rows');
    expect(table).toHaveTextContent('1101');
    expect(table).toHaveTextContent('columns');
    expect(table).toHaveTextContent('time');
    expect(table).toHaveTextContent('gnss.csv');
    // The raw single-blob <pre> is gone for this shape.
    expect(document.querySelector('.part-toolrow__result')).toBeNull();
  });

  it('renders resource_link parts as an icon-tile artifact grid, not a bare link', () => {
    const { container } = render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'resource_link',
              uri: 'artifact://ws_default/earthscope_stations.csv@1',
              name: 'earthscope_stations.csv',
              mime_type: 'text/csv',
            },
            {
              type: 'resource_link',
              uri: 'artifact://ws_default/notes.md@1',
              name: 'notes.md',
              mime_type: 'text/markdown',
            },
          ]),
        ]}
      />,
    );
    expect(screen.getByText('artifacts (2)')).toBeInTheDocument();
    const chips = container.querySelectorAll('.part-artchip');
    expect(chips).toHaveLength(2);
    expect(screen.getByText('earthscope_stations.csv')).toBeInTheDocument();
    // No fabricated size/row count when the wire carries neither (no
    // `metadata` on this fixture) — the real mime_type is shown instead.
    expect(chips[0]?.textContent).toContain('text/csv');
  });

  it('grounds the artifact meta line in the real metadata.size_bytes, not mime_type (PASS 3)', () => {
    // Live-observed shape (sess_db1a38403472, visualization task): clio-agent
    // gact/artifacts/wire.py:resource_link_metadata mints size_bytes/kind onto
    // EVERY real artifact resource_link's metadata — a prior pass read this
    // field as absent from the wire; it is real.
    const { container } = render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'resource_link',
              uri: 'artifact://ws_default/MTA1.CI.LY_.30_timeseries.png@v1',
              name: 'MTA1.CI.LY_.30_timeseries.png',
              mime_type: 'image/png',
              metadata: {
                artifact_id: 'artifact_64025a4401054b88b32dd863f435c438',
                sha256: 'fdecc2c2',
                size_bytes: 123120,
                kind: 'image',
                version: 1,
                custody: 'cas',
                fetch_url: '/v1/artifacts/artifact_64025a4401054b88b32dd863f435c438/bytes',
                producer_activity_id: 'call_126e124a6217',
                mechanism: 'tool-schema',
                workspace_id: 'ws_default',
                name: 'MTA1.CI.LY_.30_timeseries.png',
              },
            },
          ]),
        ]}
      />,
    );
    const chip = container.querySelector('.part-artchip');
    // Real formatted byte size (123120 bytes -> 120.2 KB), not the mime_type.
    expect(chip?.textContent).toContain('120.2 KB');
    expect(chip?.textContent).not.toContain('image/png');
    // metadata.kind="image" selects the dedicated photo icon, not the generic
    // diamond or the doc icon a mime-type guess of "image/png" would miss.
    expect(chip?.querySelector('svg')?.getAttribute('data-icon')).toBe('image');
  });

  it('selects the dataset (csv) icon from metadata.kind even when mime_type would not match', () => {
    const { container } = render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'resource_link',
              uri: 'artifact://ws_default/results.parquet@v1',
              name: 'results.parquet',
              mime_type: 'application/vnd.apache.parquet',
              metadata: { kind: 'dataset', size_bytes: 4096 },
            },
          ]),
        ]}
      />,
    );
    const chip = container.querySelector('.part-artchip');
    expect(chip?.querySelector('svg')?.getAttribute('data-icon')).toBe('csv');
  });

  it('suppresses the global link-hover underline on the artifact card (PASS 4)', () => {
    // The global `a:hover` rule (styles/base.css) sets text-decoration:underline,
    // which draws a line through every descendant's text regardless of their
    // own color — live-verified this pass (screenshots/side-by-side/
    // artchip-after.png before the fix) to bleed through onto BOTH the
    // filename and meta line. Pixel-confirmed against the prototype's own
    // card hover (screenshots/side-by-side/proto-artcard-hover-after.png):
    // it tints the border only, never underlines the tile like a text link.
    const css = readFileSync(resolve(__dirname, '../../src/transcript/parts/parts.css'), 'utf8');
    expect(css).toMatch(/\.part-artchip:hover\s*{[^}]*text-decoration:\s*none/s);
  });

  it('marks assistant narration with the prototype\'s mono bullet, not a bar', () => {
    const { container } = render(
      <Transcript messages={[msg('m1', 'assistant', [{ type: 'text', text: 'hello' }])]} />,
    );
    expect(container.querySelector('.part-textdot')?.textContent).toBe('●');
    expect(container.querySelector('.part-gutterbar')).toBeNull();
  });

  it('SURFACES an unknown part kind rather than dropping it', () => {
    // No silent fallback: a kind this build cannot render must be visible and
    // named, so a wire change can never quietly erase content.
    render(
      <Transcript
        messages={[msg('m1', 'assistant', [{ type: 'some_future_kind', payload: 1 }])]}
      />,
    );
    const unknown = screen.getByTestId('part-unrenderable');
    expect(unknown).toHaveTextContent('some_future_kind');
  });

  it('never renders an empty message frame', () => {
    const { container } = render(<Transcript messages={[msg('m1', 'assistant', [])]} />);
    expect(container.querySelector('.transcript__message')).toBeNull();
  });

  it('keeps every part of a message in wire order', () => {
    const { container } = render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { type: 'text', text: 'first' },
            { type: 'thinking', thinking: 'second', tokens: 3 },
            { type: 'text', text: 'third' },
          ]),
        ]}
      />,
    );
    const frames = container.querySelectorAll('.kit-partcard');
    expect(frames).toHaveLength(3);
    expect(frames[0]).toHaveTextContent('first');
    expect(frames[2]).toHaveTextContent('third');
  });

  it('labels each message by its role for assistive tech', () => {
    render(<Transcript messages={[msg('m1', 'user', [{ type: 'text', text: 'hi' }])]} />);
    expect(screen.getByRole('article', { name: /user/i })).toBeInTheDocument();
  });

  it('renders an error part in the error tone with its message', () => {
    render(
      <Transcript
        messages={[msg('m1', 'assistant', [{ type: 'error', message: 'tool exploded' }])]}
      />,
    );
    const err = screen.getByTestId('part-error');
    expect(within(err).getByText(/tool exploded/)).toBeInTheDocument();
  });

  it('renders a background_exit with its run handle and exit status', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'background_exit',
              child_agent: 'data',
              handle_id: 'task_b899efeeca04',
              run_label: 'data #1',
              live_state: 'completed',
              host: 'ares',
              placement: 'relay:ares',
              exit_status: 'completed',
            },
          ]),
        ]}
      />,
    );
    const part = screen.getByTestId('part-background-exit');
    expect(part).toHaveTextContent('data #1');
    expect(part).toHaveTextContent('completed');
    // Placement is load-bearing: a run that exited on a remote host is not the
    // same event as one that exited locally.
    expect(part).toHaveTextContent('ares');
  });

  it('renders an agent_message with its action and target child', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'agent_message',
              child_agent: 'data',
              run_label: 'data #1',
              message_action: 'queue',
              status: 'accepted',
              text: 'also profile the uncertainty columns',
            },
          ]),
        ]}
      />,
    );
    const part = screen.getByTestId('part-agent-message');
    expect(part).toHaveTextContent('queue');
    expect(part).toHaveTextContent('also profile the uncertainty columns');
  });

  it('wraps a message stamped with metadata.delegation_return in the return card', () => {
    // Wire contract (owner, 2026-08-05): a child session's returning
    // assistant message carries metadata.delegation_return = {
    // parent_session_id, task_id, parent_agent } on GET
    // /v1/sessions/{child_sid}/messages — the server's own "this message is
    // my response to my parent" stamp, never inferred from position.
    render(
      <Transcript
        messages={[
          {
            id: 'm1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Center resolved: 34.0537, -118.2428.' }],
            metadata: {
              delegation_return: {
                parent_session_id: 'sess_parent',
                task_id: 'task_8562bd68e4d5',
                parent_agent: 'main',
              },
            },
          } as unknown as Message,
        ]}
      />,
    );
    const card = screen.getByTestId('return-card');
    expect(card).toHaveTextContent('returned to main');
    // The body still renders through the normal markdown pipeline.
    expect(within(card).getByText('Center resolved: 34.0537, -118.2428.')).toBeInTheDocument();
  });

  it('renders a message with no delegation_return metadata unchanged (interim wire honesty)', () => {
    // Older sessions written before the stamp landed carry no metadata at
    // all — they must render exactly as any other assistant message, never
    // wrapped and never inferred to be a return just because it's the last one.
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [{ type: 'text', text: 'plain assistant reply' }]),
        ]}
      />,
    );
    expect(screen.getByText('plain assistant reply')).toBeInTheDocument();
    expect(screen.queryByTestId('return-card')).toBeNull();
  });

  it('names the routed agent using the wire field the backend actually sends', () => {
    // `selected_agent` per gact/tool_observer.py:533. Guessing `expert` here
    // produced a bare "routed to" with no name against a live backend.
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { type: 'routing_decision', selected_agent: 'geospatial', rationale: 'place name' },
          ]),
        ]}
      />,
    );
    const part = screen.getByTestId('part-routing');
    expect(part).toHaveTextContent('geospatial');
    expect(part).toHaveTextContent('place name');
  });
});

describe('return card in the child transcript views', () => {
  it('renders the return card inside ChildFocusView, sharing the same transcript pipeline', () => {
    // The center child view (and AgentPeekView, which mounts ChildFocusView
    // for the read-only right panel) both render through <Transcript>, so a
    // stamped message must show the card wherever the child's own
    // transcript renders — this is the message-level wrapper, not a
    // ChildFocusView-specific special case.
    render(
      <ChildFocusView
        agent="geospatial"
        parentLabel="main"
        status="completed"
        messages={[
          msg('c1', 'user', [{ type: 'text', text: 'Resolve LA into coordinates.' }]),
          {
            id: 'c2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Resolved LA to center 34.0537, -118.2428.' }],
            metadata: {
              delegation_return: {
                parent_session_id: 'sess_parent',
                task_id: 'task_8562bd68e4d5',
                parent_agent: 'main',
              },
            },
          } as unknown as Message,
        ]}
      />,
    );
    expect(screen.getByTestId('child-focus-view')).toBeInTheDocument();
    const card = screen.getByTestId('return-card');
    expect(card).toHaveTextContent('returned to main');
    expect(within(card).getByText('Resolved LA to center 34.0537, -118.2428.')).toBeInTheDocument();
  });
});
