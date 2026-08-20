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

  it('quotes a string first-arg in the collapsed hint (final-sxs ledger #12)', () => {
    const { container } = render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'tool_call',
              id: 'tc1',
              name: 'geo_geocode',
              input: { query: 'Los Angeles, CA' },
            },
          ]),
        ]}
      />,
    );
    // `geo_geocode("Los Angeles, CA")`, never the ambiguous unquoted
    // `geo_geocode(Los Angeles, CA)` — a non-string value (object/number/
    // array) already reads unambiguously via JSON.stringify and is untouched.
    const hint = container.querySelector('.part-toolrow__hint');
    expect(hint).toHaveTextContent('("Los Angeles, CA")');
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

  it('pairs two same-tool, same-args retry calls into TWO independent rows by call_id — never adjacency, never fused (P4R live finding, sess_6d904ef19328)', () => {
    // The exact reported wire shape: a plot_plot_timeseries call that timed
    // out client-side (is_error=true, NO structured_content, duration
    // 180362ms) immediately followed by an identical-args retry that
    // succeeded (structured_content present, duration 132021ms). Both share
    // the same tool_name and input — the ONLY thing that tells them apart is
    // call_id. A row that says failed and shows success is a fabricated
    // fact; the client must render exactly what the wire says, one row per
    // call_id, each paired to ITS OWN result only.
    const plotInput = {
      data_path: 'earthscope_stations_clean.csv',
      x_column: '(deg)',
      y_columns: ['Latitude'],
      output_path: 'earthscope_station_distribution.png',
    };
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'tool_call',
              call_id: 'call_ed36393d9738',
              tool_name: 'plot_plot_timeseries',
              input: plotInput,
            },
            {
              type: 'tool_result',
              call_id: 'call_ed36393d9738',
              is_error: true,
              duration_ms: 180362.64,
              content: [
                {
                  type: 'text',
                  text: '{"status": "success", "plot_type": "timeseries", "data_points": 1101}',
                },
              ],
            },
            {
              type: 'tool_call',
              call_id: 'call_8a5a1dd83799',
              tool_name: 'plot_plot_timeseries',
              input: plotInput,
            },
            {
              type: 'tool_result',
              call_id: 'call_8a5a1dd83799',
              is_error: false,
              duration_ms: 132021.42,
              content: [
                {
                  type: 'text',
                  text: '{"status": "success", "plot_type": "timeseries", "data_points": 1101}',
                },
              ],
              structured_content: { status: 'success', plot_type: 'timeseries', data_points: 1101 },
            },
          ]),
        ]}
      />,
    );

    // TWO rows, not one fused row.
    const rows = screen.getAllByTestId('part-tool');
    expect(rows).toHaveLength(2);

    const [failedRow, successRow] = rows;
    expect(failedRow).toHaveTextContent('✗');
    expect(failedRow).toHaveTextContent('180.4s');
    expect(successRow).toHaveTextContent('✓');
    expect(successRow).toHaveTextContent('132.0s');
    // The failed row's own duration/status never leaks onto the success row
    // or vice versa.
    expect(failedRow).not.toHaveTextContent('132.0s');
    expect(successRow).not.toHaveTextContent('180.4s');

    // Open both wells: the failed one shows raw text, never the polished
    // structured ladder the success one gets.
    fireEvent.click(within(failedRow!).getByRole('button', { name: /plot_plot_timeseries/ }));
    fireEvent.click(within(successRow!).getByRole('button', { name: /plot_plot_timeseries/ }));
    expect(within(failedRow!).queryByTestId('part-tool-result-table')).toBeNull();
    expect(within(successRow!).getByTestId('part-tool-result-table')).toBeInTheDocument();
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

  it('splits a stamped message: the answer part goes in the return card, narration renders normally outside it', () => {
    // Wire contract (owner, 2026-08-05, refined with live evidence from
    // child sess_c025378f8e7f): a child session's returning assistant
    // message carries metadata.delegation_return = { parent_session_id,
    // task_id, parent_agent } — but that message's OWN parts are still a
    // mix of streamed narration (metadata.signature_field_name ==
    // "next_thought", stream_source "live") and the extract-produced
    // response (signature_field_name == "answer", stream_source "batch").
    // The owner's sketch: the child transcript ends with the narration
    // bubble(s) as normal, then a "returned to <parent>" card containing
    // ONLY the answer.
    render(
      <Transcript
        messages={[
          {
            id: 'm1',
            role: 'assistant',
            parts: [
              {
                type: 'text',
                text: 'Resolving the station catalog now.',
                metadata: { signature_field_name: 'next_thought', stream_source: 'live' },
              },
              {
                type: 'text',
                text: 'Center resolved: 34.0537, -118.2428.',
                metadata: { signature_field_name: 'answer', stream_source: 'batch' },
              },
            ],
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
    // The answer lives INSIDE the card, rendered through the normal
    // markdown pipeline...
    expect(within(card).getByText('Center resolved: 34.0537, -118.2428.')).toBeInTheDocument();
    // ...the narration is NOT inside it — it renders normally, outside.
    expect(within(card).queryByText('Resolving the station catalog now.')).toBeNull();
    expect(screen.getByText('Resolving the station catalog now.')).toBeInTheDocument();
  });

  it('falls back to wrapping the whole message when a stamped message has no answer-field part', () => {
    // Edge case: a batch-only shape (or any stamped message where no part
    // carries signature_field_name == "answer") must never silently drop
    // the delegation_return stamp — the whole message wraps instead, same
    // as before the narration/answer split existed.
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

  it('surfaces a routing_decision part through the unknown-kind path, never a "routed to" line (P5-5, gact-tui#348)', () => {
    // The wire no longer emits routing_decision (clio-agent a0e1d9a9) and
    // every old session that carried one was deleted — routing left the
    // transcript entirely. The renderer is GONE, not fixed, so a
    // hypothetical legacy part with this kind must fall through to the
    // registry's own no-silent-drop fallback (RenderedPart in Transcript.tsx)
    // exactly like any other kind this build doesn't know, rather than the
    // old bespoke "routed to X" line.
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { type: 'routing_decision', selected_agent: 'geospatial', rationale: 'place name' },
          ]),
        ]}
      />,
    );
    expect(screen.queryByTestId('part-routing')).toBeNull();
    expect(screen.queryByText(/routed to/i)).toBeNull();
    const unrenderable = screen.getByTestId('part-unrenderable');
    expect(unrenderable).toHaveTextContent('routing_decision');
    expect(unrenderable).toHaveTextContent('this build has no renderer for this part kind');
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
            parts: [
              {
                type: 'text',
                text: 'Geocoding the requested place name.',
                metadata: { signature_field_name: 'next_thought', stream_source: 'live' },
              },
              {
                type: 'text',
                text: 'Resolved LA to center 34.0537, -118.2428.',
                metadata: { signature_field_name: 'answer', stream_source: 'batch' },
              },
            ],
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
    // Only the answer is inside the card...
    expect(within(card).getByText('Resolved LA to center 34.0537, -118.2428.')).toBeInTheDocument();
    // ...the narration renders normally outside it, same context.
    expect(within(card).queryByText('Geocoding the requested place name.')).toBeNull();
    expect(screen.getByText('Geocoding the requested place name.')).toBeInTheDocument();
  });
});

describe('Transcript routes a curated relay-run tool call to the run card (gact-tui#370)', () => {
  it('renders jarvis_run through the run card, not the generic ToolPart row', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'tool_call',
              id: 'tc1',
              call_id: 'tc1',
              tool_name: 'jarvis_run',
              input: { cluster: 'ares', pipeline_id: 'p5run2' },
            },
            {
              type: 'tool_result',
              call_id: 'tc1',
              structured_content: {
                task_id: 'jarvis-1',
                job_id: 'jarvis-1',
                kind: 'jarvis',
                state: 'queued',
                terminal: false,
              },
            },
          ]),
        ]}
      />,
    );
    expect(screen.getByTestId('run-card')).toBeInTheDocument();
    expect(screen.queryByTestId('part-tool')).toBeNull();
  });

  it('an ordinary tool call (not curated as a relay run) still renders through ToolPart', () => {
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            { type: 'tool_call', id: 'tc1', call_id: 'tc1', tool_name: 'jarvis_describe', input: {} },
          ]),
        ]}
      />,
    );
    expect(screen.getByTestId('part-tool')).toBeInTheDocument();
    expect(screen.queryByTestId('run-card')).toBeNull();
  });

  it('threads client/sessionId down to the run card without requiring them', () => {
    // No client/sessionId passed — the card must still render honestly from
    // the static call/result snapshot (no crash, no fabricated live state).
    render(
      <Transcript
        messages={[
          msg('m1', 'assistant', [
            {
              type: 'tool_call',
              id: 'tc1',
              call_id: 'tc1',
              tool_name: 'jarvis_run',
              input: { cluster: 'ares', pipeline_id: 'p1' },
            },
          ]),
        ]}
      />,
    );
    expect(screen.getByTestId('run-card')).toHaveAttribute('data-phase', 'queued');
  });
});
