/**
 * B) Result render ladder (owner design 2026-08-05), replacing "print the
 * JSON string and hope":
 *   1. structured_content: object -> KV table, uniform array -> real table
 *      (first 20 rows + show more).
 *   2. content blocks by mime type: image/* -> inline bounded <img>,
 *      text/csv -> the same table path.
 *   3. RAW ALWAYS ONE KEYPRESS AWAY: whenever a renderer interpreted the
 *      payload, a small 'raw' toggle reveals the verbatim original text.
 * Unknown shapes fall through to the existing verbatim <pre> -- pinned here
 * as a regression case (absence of every new field/shape).
 *
 * Round-6 live finding fix: a WRAPPER object ({ points: [72 station
 * objects], count: 72, ok: true }) was collapsing its uniform array into a
 * single opaque KV value instead of a table. Scalar keys still render as
 * the KV grid; a uniform-object-array VALUE with more than one row now
 * gets pulled out as its own labeled table beneath ('points (72)'), first
 * 20 rows + the same show-more idiom. Non-uniform / single-row array
 * values stay in the KV grid, verbatim.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolPart } from '../../src/transcript/parts/ToolPart';
import type { WirePart } from '../../src/transcript/registry';

function toolCall(toolName: string, input: unknown = {}, id = 'call_1'): WirePart {
  return { type: 'tool_call', id, call_id: id, tool_name: toolName, input };
}

function toolResult(callId: string, fields: Record<string, unknown>): WirePart {
  return { type: 'tool_result', call_id: callId, ...fields };
}

function openRow(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('structured_content -- object renders as the existing KV table', () => {
  it('renders every key/value from structured_content, with a raw toggle available', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_1')}
        result={toolResult('call_1', {
          content: [{ type: 'text', text: 'rows=1101' }],
          structured_content: { rows: 1101, path: 'gnss.csv' },
        })}
      />,
    );
    openRow(/pandas_profile_csv/);
    const table = screen.getByTestId('part-tool-result-table');
    expect(table).toHaveTextContent('rows');
    expect(table).toHaveTextContent('1101');
    expect(table).toHaveTextContent('gnss.csv');
    // The verbatim content text is reachable, not re-serialized from the
    // structured object.
    const toggle = screen.getByTestId('part-tool-raw-toggle');
    fireEvent.click(toggle);
    expect(screen.getByTestId('part-tool-raw')).toHaveTextContent('rows=1101');
  });
});

describe('structured_content -- uniform array renders as a real table with show-more', () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ station: `ST${i}`, lat: 34 + i * 0.01 }));

  it('renders first 20 rows, then reveals all on "show more"', () => {
    render(
      <ToolPart
        call={toolCall('station_catalog', {}, 'call_2')}
        result={toolResult('call_2', {
          content: [{ type: 'text', text: 'station catalog' }],
          structured_content: rows,
        })}
      />,
    );
    openRow(/station_catalog/);
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(within(grid).getAllByRole('row')).toHaveLength(1 + 20); // header + 20 body rows
    expect(within(grid).getByText('ST0')).toBeInTheDocument();
    expect(within(grid).queryByText('ST24')).toBeNull();
    fireEvent.click(within(grid).getByRole('button', { name: /show more/i }));
    expect(within(grid).getAllByRole('row')).toHaveLength(1 + 25);
    expect(within(grid).getByText('ST24')).toBeInTheDocument();
  });

  it('a non-uniform array (mixed keys) does not force the table path', () => {
    render(
      <ToolPart
        call={toolCall('mixed_rows', {}, 'call_3')}
        result={toolResult('call_3', {
          content: [{ type: 'text', text: '[{"a":1},{"b":2}]' }],
          structured_content: [{ a: 1 }, { b: 2 }],
        })}
      />,
    );
    openRow(/mixed_rows/);
    expect(screen.queryByTestId('part-tool-result-grid')).toBeNull();
  });
});

describe('structured_content -- object wrapping a uniform array pulls out a labeled table (round-6)', () => {
  const points = Array.from({ length: 72 }, (_, i) => ({ station: `ST${i}`, lat: 34 + i * 0.001 }));

  it('renders scalar keys as the KV grid and the array key as its own labeled table with show-more', () => {
    render(
      <ToolPart
        call={toolCall('station_query', {}, 'call_12')}
        result={toolResult('call_12', {
          content: [{ type: 'text', text: 'station query result' }],
          structured_content: { ok: true, count: 72, points },
        })}
      />,
    );
    openRow(/station_query/);
    const kv = screen.getByTestId('part-tool-result-table');
    // `ok` is a redundant pass/fail boolean the row's own ✓ mark already
    // states (general result-ladder rule: "status never renders as text")
    // -- it never earns a row.
    expect(kv).not.toHaveTextContent('ok');
    expect(kv).toHaveTextContent('count');
    expect(kv).toHaveTextContent('72');
    // The 72-row array is never collapsed into the KV grid.
    expect(kv).not.toHaveTextContent('ST0');
    const label = screen.getByTestId('part-tool-result-subtable-label');
    expect(label).toHaveTextContent('points (72)');
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(within(grid).getAllByRole('row')).toHaveLength(1 + 20);
    expect(within(grid).getByText('ST0')).toBeInTheDocument();
    expect(within(grid).queryByText('ST71')).toBeNull();
    fireEvent.click(within(grid).getByRole('button', { name: /show more/i }));
    expect(within(grid).getAllByRole('row')).toHaveLength(1 + 72);
    expect(within(grid).getByText('ST71')).toBeInTheDocument();
    // Raw stays one keypress away, verbatim.
    fireEvent.click(screen.getByTestId('part-tool-raw-toggle'));
    expect(screen.getByTestId('part-tool-raw')).toHaveTextContent('station query result');
  });
});

describe('structured_content -- two uniform-array keys each get their own labeled table', () => {
  it('renders two labeled tables, one per qualifying array key, no key dropped', () => {
    const stations = Array.from({ length: 3 }, (_, i) => ({ id: `ST${i}` }));
    const readings = Array.from({ length: 4 }, (_, i) => ({ value: i }));
    render(
      <ToolPart
        call={toolCall('dual_query', {}, 'call_13')}
        result={toolResult('call_13', {
          content: [{ type: 'text', text: 'dual query result' }],
          structured_content: { stations, readings },
        })}
      />,
    );
    openRow(/dual_query/);
    const labels = screen.getAllByTestId('part-tool-result-subtable-label');
    expect(labels.map((l) => l.textContent)).toEqual(['stations (3)', 'readings (4)']);
    const grids = screen.getAllByTestId('part-tool-result-grid');
    expect(grids).toHaveLength(2);
    expect(within(grids[0]!).getByText('ST0')).toBeInTheDocument();
    expect(within(grids[1]!).getAllByRole('row')).toHaveLength(1 + 4);
    // No standalone scalar keys here, so the KV grid itself is absent.
    expect(screen.queryByTestId('part-tool-result-table')).toBeNull();
  });
});

describe('structured_content -- an array value that is not table-worthy stays a KV value, verbatim', () => {
  it('a non-uniform (mixed-key) array value keeps that key inline in the KV grid', () => {
    render(
      <ToolPart
        call={toolCall('mixed_wrapper', {}, 'call_14')}
        result={toolResult('call_14', {
          content: [{ type: 'text', text: '{"ok":true,"items":[{"a":1},{"b":2}]}' }],
          structured_content: { ok: true, items: [{ a: 1 }, { b: 2 }] },
        })}
      />,
    );
    openRow(/mixed_wrapper/);
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).toHaveTextContent('items');
    expect(kv).toHaveTextContent(/"a":\s*1/);
    expect(kv).toHaveTextContent(/"b":\s*2/);
    expect(screen.queryByTestId('part-tool-result-subtable-label')).toBeNull();
    expect(screen.queryByTestId('part-tool-result-grid')).toBeNull();
  });

  it('a single-row uniform array value also stays a KV value (the table threshold is more than one row)', () => {
    render(
      <ToolPart
        call={toolCall('single_row_wrapper', {}, 'call_15')}
        result={toolResult('call_15', {
          content: [{ type: 'text', text: '{"ok":true,"points":[{"station":"ST0"}]}' }],
          structured_content: { ok: true, points: [{ station: 'ST0' }] },
        })}
      />,
    );
    openRow(/single_row_wrapper/);
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).toHaveTextContent('points');
    expect(kv).toHaveTextContent('ST0');
    expect(screen.queryByTestId('part-tool-result-subtable-label')).toBeNull();
    expect(screen.queryByTestId('part-tool-result-grid')).toBeNull();
  });
});

describe('content blocks -- image (image/*) renders inline, bounded', () => {
  it('renders an <img> from a base64 data block', () => {
    render(
      <ToolPart
        call={toolCall('render_plot', {}, 'call_4')}
        result={toolResult('call_4', {
          content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }],
        })}
      />,
    );
    openRow(/render_plot/);
    const wrap = screen.getByTestId('part-tool-result-image');
    const img = within(wrap).getByRole('img');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  it('renders an <img> from a url block', () => {
    render(
      <ToolPart
        call={toolCall('render_plot', {}, 'call_5')}
        result={toolResult('call_5', {
          content: [{ type: 'image', url: 'https://example.test/plot.png', mimeType: 'image/png' }],
        })}
      />,
    );
    openRow(/render_plot/);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://example.test/plot.png');
  });

  it('the raw toggle still reaches the verbatim text alongside the image', () => {
    render(
      <ToolPart
        call={toolCall('render_plot', {}, 'call_6')}
        result={toolResult('call_6', {
          content: [
            { type: 'text', text: 'rendered 1 plot' },
            { type: 'image', data: 'AAAA', mimeType: 'image/png' },
          ],
        })}
      />,
    );
    openRow(/render_plot/);
    expect(screen.getByTestId('part-tool-result-image')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('part-tool-raw-toggle'));
    expect(screen.getByTestId('part-tool-raw')).toHaveTextContent('rendered 1 plot');
  });
});

describe('content blocks -- text/csv renders through the same table path', () => {
  it('parses a text/csv block into header + rows', () => {
    const csv = 'name,value\na,1\nb,2\nc,3';
    render(
      <ToolPart
        call={toolCall('query_table', {}, 'call_7')}
        result={toolResult('call_7', {
          content: [{ type: 'text', text: csv, mimeType: 'text/csv' }],
        })}
      />,
    );
    openRow(/query_table/);
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(within(grid).getByText('name')).toBeInTheDocument();
    expect(within(grid).getByText('value')).toBeInTheDocument();
    expect(within(grid).getByText('a')).toBeInTheDocument();
    expect(within(grid).getByText('3')).toBeInTheDocument();
  });
});

describe('raw toggle -- collapsed by default, one keypress away', () => {
  it('does not render the verbatim block until toggled, and hides it again on a second click', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_8')}
        result={toolResult('call_8', {
          content: [{ type: 'text', text: 'the original verbatim text' }],
          structured_content: { rows: 1101 },
        })}
      />,
    );
    openRow(/pandas_profile_csv/);
    expect(screen.queryByTestId('part-tool-raw')).toBeNull();
    const toggle = screen.getByTestId('part-tool-raw-toggle');
    fireEvent.click(toggle);
    expect(screen.getByTestId('part-tool-raw')).toHaveTextContent('the original verbatim text');
    fireEvent.click(toggle);
    expect(screen.queryByTestId('part-tool-raw')).toBeNull();
  });

  it('the fallback verbatim <pre> path (no interpreted shape) carries no extra raw toggle', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_9')}
        result={toolResult('call_9', { content: [{ type: 'text', text: 'plain stdout, not JSON' }] })}
      />,
    );
    openRow(/shell_exec/);
    expect(screen.getByText('plain stdout, not JSON')).toBeInTheDocument();
    expect(screen.queryByTestId('part-tool-raw-toggle')).toBeNull();
  });
});

describe('absence of every new field/shape -- regression pin', () => {
  it('a plain text tool_result renders exactly as before: verbatim <pre>, no table/image/raw-toggle', () => {
    const { container } = render(
      <ToolPart
        call={toolCall('stage_resource', { resource: 'earthscope_stations.csv' }, 'call_10')}
        result={toolResult('call_10', {
          is_error: false,
          duration_ms: 412,
          content: [{ type: 'text', text: 'staged 1,101 rows' }],
        })}
      />,
    );
    openRow(/stage_resource/);
    expect(screen.getByText('staged 1,101 rows')).toBeInTheDocument();
    expect(container.querySelector('.part-toolrow__result')).not.toBeNull();
    expect(screen.queryByTestId('part-tool-result-table')).toBeNull();
    expect(screen.queryByTestId('part-tool-result-grid')).toBeNull();
    expect(screen.queryByTestId('part-tool-result-image')).toBeNull();
    expect(screen.queryByTestId('part-tool-raw-toggle')).toBeNull();
  });

  it('a JSON-object tool_result still renders the pre-existing KV table path unchanged', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_11')}
        result={toolResult('call_11', {
          content: [{ type: 'text', text: '{"rows": 1101, "path": "gnss.csv"}' }],
        })}
      />,
    );
    openRow(/pandas_profile_csv/);
    const table = screen.getByTestId('part-tool-result-table');
    expect(table).toHaveTextContent('rows');
    expect(table).toHaveTextContent('1101');
    expect(document.querySelector('.part-toolrow__result')).toBeNull();
  });

  /**
   * Finding A (adversarial review, P4R): the wait ladder used to duck-type
   * off `isRecord(structured_content) ? structured_content :
   * parseJsonObject(text)` — a wait-family tool result with wait-shaped JSON
   * in its TEXT lane but no `structured_content` field (exactly what every
   * HISTORICAL wait result looks like, written before `structured_content`
   * existed on this tool) silently rendered through the wait ladder anyway.
   * The gate now requires BOTH the call's own tool_name AND a real
   * `structured_content` payload -- a text-only wait-shaped result must
   * NEVER enter the wait-specific rung. That invariant is unchanged by
   * row-render defect #4 (owner-quoted, P4R): the "plain JSON-object path"
   * this falls through to is now the SAME general object grammar
   * `structured_content` gets (rules 1-5, tables, collapsible sections) --
   * so `merged_workflow_state` (a non-empty nested dict) becomes its own
   * collapsed section, same as it would if it had arrived via
   * `structured_content`, rather than an inline JSON blob.
   */
  it('a wait-shaped TEXT result with no structured_content renders via the generic OBJECT path, not the wait ladder (regression pin)', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_40')}
        result={toolResult('call_40', {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                results: [{ task_id: 't1', name: 'geospatial #1', status: 'completed' }],
                merged_workflow_state: { region: 'LA' },
              }),
            },
          ],
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    // None of the wait-ladder's dedicated rungs fire.
    expect(screen.queryByTestId('part-tool-result-subtable-label')).toBeNull();
    expect(screen.queryByTestId('part-tool-wait-results')).toBeNull();
    expect(screen.queryByTestId('part-tool-wait-conflicts')).toBeNull();
    expect(screen.queryByTestId('part-tool-result-grid')).toBeNull();
    // `results` (a single-row array, below the table threshold) stays a flat
    // row -- nothing swallowed by the wait interpretation.
    const table = screen.getByTestId('part-tool-result-table');
    expect(table).toHaveTextContent('results');
    // `merged_workflow_state` is a nested dict -- the SAME object grammar
    // structured_content gets pulls it into its own collapsed section
    // (defect #4), never an inline JSON blob nor a raw dump.
    expect(table).not.toHaveTextContent('merged_workflow_state');
    const section = screen.getByTestId('part-tool-result-section');
    expect(section).toHaveTextContent('merged_workflow_state');
    expect(within(section).queryByText('region')).toBeNull();
    fireEvent.click(screen.getByTestId('part-tool-result-section-toggle'));
    expect(within(section).getByText('region')).toBeInTheDocument();
    expect(within(section).getByText('LA')).toBeInTheDocument();
  });
});

/**
 * Nested-dict ladder rung (extends splitStructuredObject): a nested PLAIN
 * OBJECT value (not an array) collapses into a giant pretty-printed JSON
 * string inline in the KV grid today — this is exactly the wait row's
 * `merged_workflow_state` complaint (owner, round-7), generalized: any
 * structured result carrying a nested dict value gets a collapsible section
 * instead, collapsed by default, raw JSON still one keypress away via the
 * existing raw toggle.
 */
describe('nested-dict ladder rung -- a nested plain-object VALUE renders as a collapsible section', () => {
  it('pulls a nested object value into its own collapsed section, not an inline JSON blob', () => {
    render(
      <ToolPart
        call={toolCall('workflow_probe', {}, 'call_20')}
        result={toolResult('call_20', {
          content: [{ type: 'text', text: 'probe result' }],
          structured_content: {
            ok: true,
            probe_id: 'probe_1',
            state: { steps_completed: 3, notes: 'on track' },
          },
        })}
      />,
    );
    openRow(/workflow_probe/);
    const kv = screen.getByTestId('part-tool-result-table');
    // `ok` is a redundant pass/fail boolean the row's own ✓ mark already
    // states (general result-ladder rule) -- it never earns a row; a real
    // scalar field alongside it still does.
    expect(kv).not.toHaveTextContent('ok');
    expect(kv).toHaveTextContent('probe_1');
    // The nested object never renders as one giant inline JSON string.
    expect(kv).not.toHaveTextContent('steps_completed');
    const section = screen.getByTestId('part-tool-result-section');
    expect(section).toHaveTextContent('state');
    // Collapsed by default.
    expect(within(section).queryByText('steps_completed')).toBeNull();
    fireEvent.click(screen.getByTestId('part-tool-result-section-toggle'));
    expect(within(section).getByText('steps_completed')).toBeInTheDocument();
    expect(within(section).getByText('on track')).toBeInTheDocument();
    // Raw stays one keypress away, verbatim.
    fireEvent.click(screen.getByTestId('part-tool-raw-toggle'));
    expect(screen.getByTestId('part-tool-raw')).toHaveTextContent('probe result');
  });

  it('an empty nested object stays an inline KV value ({}), no section for nothing', () => {
    render(
      <ToolPart
        call={toolCall('empty_state_probe', {}, 'call_21')}
        result={toolResult('call_21', {
          content: [{ type: 'text', text: 'probe result' }],
          structured_content: { ok: true, state: {} },
        })}
      />,
    );
    openRow(/empty_state_probe/);
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).toHaveTextContent('state');
    expect(screen.queryByTestId('part-tool-result-section')).toBeNull();
  });

  it('nests recursively: a section\'s own nested object gets its own nested section', () => {
    render(
      <ToolPart
        call={toolCall('deep_probe', {}, 'call_22')}
        result={toolResult('call_22', {
          content: [{ type: 'text', text: 'deep probe' }],
          structured_content: { outer: { inner: { leaf: 'value' } } },
        })}
      />,
    );
    openRow(/deep_probe/);
    fireEvent.click(screen.getByTestId('part-tool-result-section-toggle'));
    const toggles = screen.getAllByTestId('part-tool-result-section-toggle');
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[1]!);
    expect(screen.getByText('leaf')).toBeInTheDocument();
    expect(screen.getByText('value')).toBeInTheDocument();
  });
});

/**
 * The wait row's own result shape (owner, round-7 live fan-out session: the
 * expanded well showed a raw `{"merged_workflow_state": {...}` dump).
 * Detected by shape (a `results` array alongside `merged_workflow_state`
 * and/or `workflow_state_conflicts`), independent of tool name — the ladder
 * only ever sees the result part.
 */
describe('wait result shape -- results/workflow_state_conflicts/merged_workflow_state ladder', () => {
  it('results renders as the table rung, merged_workflow_state as a collapsed section, raw one keypress away', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_30')}
        result={toolResult('call_30', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            results: [
              { task_id: 't1', name: 'geospatial #1', status: 'completed' },
              { task_id: 't2', name: 'hydrology #1', status: 'completed' },
            ],
            merged_workflow_state: { steps_completed: 5, notes: 'merged ok' },
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    const label = screen.getByTestId('part-tool-result-subtable-label');
    expect(label).toHaveTextContent('results (2)');
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(within(grid).getByText('geospatial #1')).toBeInTheDocument();
    expect(within(grid).getByText('hydrology #1')).toBeInTheDocument();

    // merged_workflow_state is a collapsed section, never a raw inline dump.
    expect(screen.queryByText('steps_completed')).toBeNull();
    const section = screen.getByTestId('part-tool-result-section');
    expect(section).toHaveTextContent('merged_workflow_state');
    fireEvent.click(screen.getByTestId('part-tool-result-section-toggle'));
    expect(screen.getByText('steps_completed')).toBeInTheDocument();

    // No conflicts key on the wire here -> no conflicts line at all.
    expect(screen.queryByTestId('part-tool-wait-conflicts')).toBeNull();

    fireEvent.click(screen.getByTestId('part-tool-raw-toggle'));
    expect(screen.getByTestId('part-tool-raw')).toHaveTextContent('wait complete');
  });

  it('workflow_state_conflicts renders a visible typed line when present and non-empty, never swallowed', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_31')}
        result={toolResult('call_31', {
          content: [{ type: 'text', text: 'wait complete with conflicts' }],
          structured_content: {
            results: [{ task_id: 't1', name: 'geospatial #1', status: 'completed' }],
            workflow_state_conflicts: [
              { key: 'region', parent_value: 'LA', child_value: 'SF' },
            ],
            merged_workflow_state: { region: 'LA' },
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    const conflictsLine = screen.getByTestId('part-tool-wait-conflicts');
    expect(conflictsLine).toHaveTextContent('1 workflow state conflict');
    expect(conflictsLine).not.toHaveAttribute('data-empty');
    // The conflict's own detail is visible too, not just the count.
    expect(screen.getByText('region')).toBeInTheDocument();
  });

  it('workflow_state_conflicts renders an honest empty line when present but empty (never dropped)', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_32')}
        result={toolResult('call_32', {
          content: [{ type: 'text', text: 'wait complete, no conflicts' }],
          structured_content: {
            results: [{ task_id: 't1', name: 'geospatial #1', status: 'completed' }],
            workflow_state_conflicts: [],
            merged_workflow_state: { region: 'LA' },
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    const conflictsLine = screen.getByTestId('part-tool-wait-conflicts');
    expect(conflictsLine).toHaveTextContent('no workflow state conflicts');
    expect(conflictsLine).toHaveAttribute('data-empty', 'true');
  });

  it('a wait result with only ONE task still renders through the results table rung, not the plain fallback', () => {
    render(
      <ToolPart
        call={toolCall('check_agent_tasks', {}, 'call_33')}
        result={toolResult('call_33', {
          content: [{ type: 'text', text: 'single task done' }],
          structured_content: {
            results: [{ task_id: 't1', name: 'geospatial #1', status: 'completed' }],
            merged_workflow_state: { region: 'LA' },
          },
        })}
      />,
    );
    openRow(/check_agent_tasks/);
    // results is always the table rung for the wait shape, even a single
    // row — the reader's mental model is "one row per waited task," never a
    // KV/table split based on row count for THIS field specifically.
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(within(grid).getByText('geospatial #1')).toBeInTheDocument();
    expect(screen.getByTestId('part-tool-result-section')).toHaveTextContent('merged_workflow_state');
  });

  it('a non-uniform results array (mixed keys) falls back to the resolved KV rows, still no raw dump', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_35')}
        result={toolResult('call_35', {
          content: [{ type: 'text', text: 'mixed results' }],
          structured_content: {
            results: [{ task_id: 't1', name: 'geospatial #1' }, { task_id: 't2' }],
            merged_workflow_state: { region: 'LA' },
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    expect(screen.queryByTestId('part-tool-result-grid')).toBeNull();
    const kv = screen.getByTestId('part-tool-wait-results');
    expect(kv).toHaveTextContent('geospatial #1');
  });

  it('a shape without merged_workflow_state or workflow_state_conflicts is NOT treated as a wait result', () => {
    // Guards the duck-type: a `results` array alone (some other tool's own
    // "results" key) must not be swept into the wait-specific ladder.
    render(
      <ToolPart
        call={toolCall('generic_batch_tool', {}, 'call_34')}
        result={toolResult('call_34', {
          content: [{ type: 'text', text: 'batch done' }],
          structured_content: { results: [{ id: 1 }, { id: 2 }, { id: 3 }] },
        })}
      />,
    );
    openRow(/generic_batch_tool/);
    expect(screen.queryByTestId('part-tool-wait-conflicts')).toBeNull();
    // Falls through to the plain uniform-array table rung instead.
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(within(grid).getAllByRole('row')).toHaveLength(1 + 3);
  });
});

describe('wait result shape -- summary leads the well (round-8 owner finding: it used to render after conflicts)', () => {
  it('renders the wire summary string as its own line, BEFORE the results table', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_36')}
        result={toolResult('call_36', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            summary: 'waited 1.2s for 3 tasks — 3 completed',
            results: [{ task_id: 't1', name: 'geospatial #1', status: 'completed' }],
            workflow_state_conflicts: [{ key: 'region', parent_value: 'LA', child_value: 'SF' }],
            merged_workflow_state: { region: 'LA' },
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    const summary = screen.getByTestId('part-tool-wait-summary');
    expect(summary).toHaveTextContent('waited 1.2s for 3 tasks — 3 completed');

    // Declared order: summary, results, conflicts, merged. (Not
    // `part-tool-result-grid`: BOTH the results table and the uniform
    // conflicts table share that testid, so it can't anchor a single well.)
    const well = summary.closest('.part-toolrow__well')!;
    const order = Array.from(well.children).map((el) => el.className);
    const summaryIndex = order.findIndex((c) => c.includes('part-toolrow__summary'));
    const resultsIndex = order.findIndex((c) => c.includes('part-toolrow__subtable'));
    const conflictsIndex = order.findIndex((c) => c.includes('part-toolrow__conflicts'));
    expect(summaryIndex).toBeGreaterThanOrEqual(0);
    expect(summaryIndex).toBeLessThan(resultsIndex);
    expect(resultsIndex).toBeLessThan(conflictsIndex);
  });

  it('never double-renders summary in the generic KV grid', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_37')}
        result={toolResult('call_37', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            summary: 'waited 1.2s for 3 tasks — 3 completed',
            results: [{ task_id: 't1', name: 'geospatial #1', status: 'completed' }],
            merged_workflow_state: { region: 'LA' },
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    expect(screen.getAllByText(/waited 1\.2s for 3 tasks/)).toHaveLength(1);
    expect(screen.queryByText('summary')).toBeNull();
  });

  it('omits the summary line entirely when the wire carries none (regression pin)', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_38')}
        result={toolResult('call_38', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            results: [{ task_id: 't1', name: 'geospatial #1', status: 'completed' }],
            merged_workflow_state: { region: 'LA' },
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    expect(screen.queryByTestId('part-tool-wait-summary')).toBeNull();
  });
});

describe('duration_ms renders human-readable, not raw float noise (round-8 owner finding, anomaly C)', () => {
  it('formats a duration_ms column in the results table as "Nm Ns" / "N.Ns", never the raw float', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_39')}
        result={toolResult('call_39', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            results: [
              { task_id: 't1', name: 'geospatial #1', status: 'completed', duration_ms: 73215.67400000001 },
              { task_id: 't2', name: 'ndp #1', status: 'completed', duration_ms: 70664.295 },
            ],
            merged_workflow_state: { region: 'LA' },
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    expect(screen.getByText('1m 13s')).toBeInTheDocument();
    expect(screen.getByText('1m 11s')).toBeInTheDocument();
    expect(screen.queryByText(/73215\.67/)).toBeNull();
    expect(screen.queryByText(/70664\.295/)).toBeNull();
  });

  it('formats a sub-minute duration_ms with one decimal (matches the header badge\'s own idiom)', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_40')}
        result={toolResult('call_40', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            results: [{ task_id: 't1', name: 'geospatial #1', status: 'completed', duration_ms: 4300 }],
            merged_workflow_state: {},
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    expect(screen.getByText('4.3s')).toBeInTheDocument();
  });

  it('leaves every OTHER numeric column exactly as it was — only the literal `duration_ms` key is reformatted', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_41')}
        result={toolResult('call_41', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            results: [
              { task_id: 't1', name: 'geospatial #1', status: 'completed', duration_ms: 4300, retry_count: 73215 },
            ],
            merged_workflow_state: {},
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    expect(screen.getByText('4.3s')).toBeInTheDocument();
    expect(screen.getByText('73215')).toBeInTheDocument();
  });

  it('a non-wait structured object with its own duration_ms field is formatted the same way, in the KV grid', () => {
    render(
      <ToolPart
        call={toolCall('some_other_tool', {}, 'call_42')}
        result={toolResult('call_42', {
          content: [{ type: 'text', text: 'done' }],
          structured_content: { ok: true, duration_ms: 4300 },
        })}
      />,
    );
    openRow(/some_other_tool/);
    expect(screen.getByText('4.3s')).toBeInTheDocument();
    expect(screen.queryByText(/^4300$/)).toBeNull();
  });
});

/**
 * Finding A (adversarial review, P4R): the wait interpretation branch
 * requires BOTH the call's own tool_name being wait-family AND a real
 * `structured_content` payload -- `isWaitResultShape` alone is a validity
 * check on that payload, never a discovery mechanism. These pin each half
 * of the AND independently.
 */
describe('wait ladder gate -- BOTH tool_name AND structured_content are required (adversarial review finding A)', () => {
  it('structured_content matching the wait shape on a NON-wait-family tool never enters the wait ladder', () => {
    // The shape alone (results + merged_workflow_state) would satisfy
    // isWaitResultShape -- the tool_name half of the gate is what must stop
    // it here.
    render(
      <ToolPart
        call={toolCall('not_a_wait_tool', {}, 'call_41')}
        result={toolResult('call_41', {
          content: [{ type: 'text', text: 'batch done' }],
          structured_content: {
            results: [
              { task_id: 't1', name: 'geospatial #1', status: 'completed' },
              { task_id: 't2', name: 'hydrology #1', status: 'completed' },
            ],
            merged_workflow_state: { region: 'LA' },
          },
        })}
      />,
    );
    openRow(/not_a_wait_tool/);
    expect(screen.queryByTestId('part-tool-wait-results')).toBeNull();
    expect(screen.queryByTestId('part-tool-wait-conflicts')).toBeNull();
    // Falls through to the generic per-key table/section split instead --
    // `results` still renders in full (nothing dropped), just off the
    // generic object rung rather than the wait-specific one.
    const label = screen.getByTestId('part-tool-result-subtable-label');
    expect(label).toHaveTextContent('results (2)');
    expect(screen.getByTestId('part-tool-result-section')).toHaveTextContent('merged_workflow_state');
  });

  it('a wait-family tool with structured_content that does NOT match the wait shape falls through to the generic rungs, no crash (finding D gap)', () => {
    // tool_name matches, structured_content is present, but the payload
    // shape itself is not a wait result (no `results` array) -- proves
    // isWaitResultShape still gates as a VALIDITY check even once the
    // tool_name half of the gate is satisfied.
    render(
      <ToolPart
        call={toolCall('check_agent_tasks', {}, 'call_42')}
        result={toolResult('call_42', {
          content: [{ type: 'text', text: 'polled' }],
          structured_content: { status: 'pending', polled_at: '2026-08-06T00:00:00Z' },
        })}
      />,
    );
    openRow(/check_agent_tasks/);
    expect(screen.queryByTestId('part-tool-wait-results')).toBeNull();
    expect(screen.queryByTestId('part-tool-wait-conflicts')).toBeNull();
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).toHaveTextContent('status');
    expect(kv).toHaveTextContent('pending');
  });
});

describe('collapsed preview prefers a structured_content summary over the raw envelope (round-10 gate finding D3)', () => {
  it('shows the first scalar field off structured_content instead of the raw MCP envelope', () => {
    render(
      <ToolPart
        call={toolCall('ndp_search_datasets', { search_terms: ['earthscope'] }, 'call_50')}
        result={toolResult('call_50', {
          content: [
            {
              type: 'text',
              text: '{"content": [{"text": "{\\"datasets\\": [{\\"id\\": \\"abc\\"}]"}]}',
            },
          ],
          structured_content: {
            datasets: [{ id: 'abc', name: 'earthscope_stations' }],
            count: 1,
            total_found: 1,
            server: 'global',
          },
        })}
      />,
    );
    // Collapsed — the row was never opened.
    expect(screen.getByText('count: 1')).toBeInTheDocument();
    expect(screen.queryByText(/"datasets"/)).toBeNull();
    expect(screen.queryByText(/\{"content"/)).toBeNull();
  });

  it('falls back to the raw text when structured_content has no top-level scalar', () => {
    render(
      <ToolPart
        call={toolCall('geo_geocode', { query: 'LA' }, 'call_51')}
        result={toolResult('call_51', {
          content: [{ type: 'text', text: 'plain prose result' }],
          structured_content: { points: [{ lat: 1 }, { lat: 2 }] },
        })}
      />,
    );
    expect(screen.getByText('plain prose result')).toBeInTheDocument();
  });

  it('falls back to the raw text when there is no structured_content at all', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_54')}
        result={toolResult('call_54', { content: [{ type: 'text', text: 'stdout only' }] })}
      />,
    );
    expect(screen.getByText('stdout only')).toBeInTheDocument();
  });

  it('a FAILED result keeps its raw text preview, never a structured summary (failed rows already correct)', () => {
    render(
      <ToolPart
        call={toolCall('ndp_search_datasets', {}, 'call_52')}
        result={toolResult('call_52', {
          is_error: true,
          content: [{ type: 'text', text: 'search failed: timeout' }],
          structured_content: { count: 0 },
        })}
      />,
    );
    expect(screen.getByText('search failed: timeout')).toBeInTheDocument();
    expect(screen.queryByText('count: 0')).toBeNull();
  });

  it('a FAILED result never climbs the success ladder in the OPENED well either, even when its own raw text happens to be JSON-object-shaped (P4R live finding, sess_6d904ef19328)', () => {
    // The exact wire shape a timed-out plot_plot_timeseries call produced:
    // is_error=true, NO structured_content field, but content[0].text is
    // itself a valid JSON object (the tool actually finished writing its
    // output after the caller's 180s budget already gave up, and the
    // observer captured the late text anyway). Before the isError gate,
    // `resultRows(text)` duck-typed this into the same "kv" ladder a REAL
    // success result gets — a failed row's well showing a polished
    // "status: success" table, contradicting its own ✗ header.
    render(
      <ToolPart
        call={toolCall('plot_plot_timeseries', { output_path: 'plot.png' }, 'call_ed36393d9738')}
        result={toolResult('call_ed36393d9738', {
          is_error: true,
          duration_ms: 180362.64,
          content: [
            {
              type: 'text',
              text: '{"status": "success", "plot_type": "timeseries", "data_points": 1101}',
            },
          ],
        })}
      />,
    );
    openRow(/plot_plot_timeseries/);
    // The raw JSON renders verbatim (the honest wire fact) ...
    expect(
      screen.getByText('{"status": "success", "plot_type": "timeseries", "data_points": 1101}'),
    ).toBeInTheDocument();
    // ... but never as the success ladder's polished KV/table presentation —
    // no separate "status" row, no results-table testid, no raw-toggle (that
    // toggle only exists once a renderer has INTERPRETED the payload).
    expect(screen.queryByTestId('part-tool-result-table')).toBeNull();
    expect(screen.queryByTestId('part-tool-result-grid')).toBeNull();
    expect(screen.queryByTestId('part-tool-raw-toggle')).toBeNull();
    expect(screen.queryByText('status')).toBeNull();
  });

  it('a wait-shaped structured_content prefers its own designed summary sentence', () => {
    render(
      <ToolPart
        call={toolCall('some_other_wait_lookalike', {}, 'call_53')}
        result={toolResult('call_53', {
          content: [{ type: 'text', text: 'raw envelope text' }],
          structured_content: {
            results: [],
            merged_workflow_state: {},
            summary: 'waited 1.2s for 3 tasks',
          },
        })}
      />,
    );
    expect(screen.getByText('waited 1.2s for 3 tasks')).toBeInTheDocument();
  });
});

describe('table headers humanize duration_ms -> duration (round-10 gate finding D11)', () => {
  it('renders "duration" as the column header while the raw key still drives the cell lookup', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_60')}
        result={toolResult('call_60', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            results: [{ task_id: 't1', name: 'geospatial #1', duration_ms: 4300 }],
            merged_workflow_state: {},
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    expect(screen.getByRole('columnheader', { name: 'duration' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'duration_ms' })).toBeNull();
    expect(screen.getByText('4.3s')).toBeInTheDocument();
  });

  it('leaves every other header exactly as it was on the wire', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_61')}
        result={toolResult('call_61', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            results: [{ task_id: 't1', run_index: 0 }],
            merged_workflow_state: {},
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    expect(screen.getByRole('columnheader', { name: 'task_id' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'run_index' })).toBeInTheDocument();
  });
});

describe('loser_runs cells resolve to run names, not raw JSON (round-10 gate finding D11)', () => {
  it('renders "agent #<run_index + 1>" when no resolved name is present on the entry', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_62')}
        result={toolResult('call_62', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            results: [],
            workflow_state_conflicts: [
              {
                key: 'region',
                parent_value: 'LA',
                child_value: 'SF',
                loser_runs: [
                  { run_index: 1, agent_id: 'geospatial' },
                  { run_index: 2, agent_id: 'geospatial' },
                ],
              },
            ],
            merged_workflow_state: {},
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(grid).toHaveTextContent('agent #2, agent #3');
    expect(grid).not.toHaveTextContent('run_index');
    expect(screen.queryByText(/"run_index":2/)).toBeNull();
  });

  it('prefers the entry\'s own resolved run_label over the agent-#N fallback', () => {
    render(
      <ToolPart
        call={toolCall('wait_agent_tasks', {}, 'call_63')}
        result={toolResult('call_63', {
          content: [{ type: 'text', text: 'wait complete' }],
          structured_content: {
            results: [],
            workflow_state_conflicts: [
              {
                key: 'region',
                loser_runs: [{ run_index: 0, run_label: 'geospatial #1' }],
              },
            ],
            merged_workflow_state: {},
          },
        })}
      />,
    );
    openRow(/wait_agent_tasks/);
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(grid).toHaveTextContent('geospatial #1');
  });
});

describe('the result well is visually separated from params (round-10 gate finding D10)', () => {
  it('shades the RESULT grid but leaves the params grid plain', () => {
    const { container } = render(
      <ToolPart
        call={toolCall('geo_geocode', { query: 'Los Angeles, California' }, 'call_70')}
        result={toolResult('call_70', {
          content: [{ type: 'text', text: 'resolved' }],
          structured_content: { center: '34.05,-118.24', provenance: 'osm_nominatim' },
        })}
      />,
    );
    openRow(/geo_geocode/);
    const resultGrid = screen.getByTestId('part-tool-result-table');
    expect(resultGrid.className).toContain('part-toolrow__grid--result');
    const paramsGrid = container.querySelector('.part-toolrow__well > .part-toolrow__grid');
    expect(paramsGrid).not.toBeNull();
    expect(paramsGrid?.className).not.toContain('part-toolrow__grid--result');
  });
});

/**
 * General result-ladder rules (owner design, generalizing the wait ladder's
 * own summary/no-status treatment to EVERY structured result, shape-driven,
 * never gated on a tool name):
 *   1. a `message`/`summary` string field IS the declared one-liner --
 *      collapsed preview AND the opened well's first line.
 *   2. a redundant pass/fail field (`success`/`ok`, or a `status` whose own
 *      value just restates success/failure) never renders as a row -- the
 *      row's own ✓/✗ mark already states that fact.
 */
describe('general result ladder -- declared message/summary as the one-liner (rule 1)', () => {
  it('prefers a declared `message` field over a raw-JSON-object dump, both in the collapsed preview and the opened well', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_60')}
        result={toolResult('call_60', {
          content: [{ type: 'text', text: 'profiled' }],
          structured_content: {
            success: true,
            message: 'Profiled 1,101 rows across 3 columns.',
            file_path: 'earthscope_stations_clean.csv',
          },
        })}
      />,
    );
    // Collapsed preview: the declared message, never a raw JSON dump and
    // never the `success` scalar.
    expect(screen.getByText('Profiled 1,101 rows across 3 columns.')).toBeInTheDocument();
    expect(screen.queryByText(/"success"/)).toBeNull();
    openRow(/pandas_profile_csv/);
    const summary = screen.getByTestId('part-tool-summary');
    expect(summary).toHaveTextContent('Profiled 1,101 rows across 3 columns.');
    // The message never ALSO renders as a generic KV row underneath.
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).not.toHaveTextContent('message');
    expect(kv).not.toHaveTextContent('Profiled 1,101 rows');
  });

  it('a `summary` field earns the same treatment as `message`', () => {
    render(
      <ToolPart
        call={toolCall('geo_filter_points_by_radius', {}, 'call_61')}
        result={toolResult('call_61', {
          content: [{ type: 'text', text: 'filtered' }],
          structured_content: { summary: '72 stations within 50 km of Los Angeles.', filter_ok: true },
        })}
      />,
    );
    expect(screen.getByText('72 stations within 50 km of Los Angeles.')).toBeInTheDocument();
  });
});

describe('general result ladder -- redundant status/success/ok fields never render as rows (rule 2)', () => {
  it('drops a `success: true` field but keeps every other key (the exact pandas_profile_csv shape)', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_62')}
        result={toolResult('call_62', {
          content: [{ type: 'text', text: 'profiled' }],
          structured_content: {
            success: true,
            file_path: 'earthscope_stations_clean.csv',
            row_count: 1101,
            column_count: 3,
          },
        })}
      />,
    );
    openRow(/pandas_profile_csv/);
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).not.toHaveTextContent('success');
    expect(kv).toHaveTextContent('file_path');
    expect(kv).toHaveTextContent('row_count');
    expect(kv).toHaveTextContent('1101');
  });

  it('drops a `status: "success"` field (the exact plot_plot_timeseries success shape)', () => {
    render(
      <ToolPart
        call={toolCall('plot_plot_timeseries', {}, 'call_63')}
        result={toolResult('call_63', {
          content: [{ type: 'text', text: 'plotted' }],
          structured_content: { status: 'success', plot_type: 'timeseries', data_points: 1101 },
        })}
      />,
    );
    openRow(/plot_plot_timeseries/);
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).not.toHaveTextContent('status');
    expect(kv).not.toHaveTextContent('success');
    expect(kv).toHaveTextContent('plot_type');
    expect(kv).toHaveTextContent('data_points');
  });

  it('keeps a genuinely informative status word that is NOT a pass/fail restatement (e.g. "pending")', () => {
    render(
      <ToolPart
        call={toolCall('check_agent_tasks', {}, 'call_64')}
        result={toolResult('call_64', {
          content: [{ type: 'text', text: 'polled' }],
          structured_content: { status: 'pending', polled_at: '2026-08-06T00:00:00Z' },
        })}
      />,
    );
    openRow(/check_agent_tasks/);
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).toHaveTextContent('status');
    expect(kv).toHaveTextContent('pending');
  });
});

/**
 * General result-ladder rules 3-5 (owner design, P4R) — a general shape-
 * interpreter, zero tool-specific code, proven on the real acceptance
 * payload: pandas_profile_csv's own structured_content.
 *
 *   3. IDENTITY ONCE — fields with an identical VALUE (data_path/file_path,
 *      both the same path) dedupe to one line; a path-like value renders
 *      middle-elided and pairs with size_bytes/row_count×column_count.
 *   4. SIBLING-MAP JOIN — two-or-more dict-valued fields keyed by the SAME
 *      key set (dtypes/null_counts, both keyed by column name) join into
 *      one table; a matching scalar array (`columns`) supplies the shared
 *      key column's header and row order.
 *   5. CAPS/CAVEATS ONLY WHEN BOUND — an unfired `*_limited`/`*_capped`
 *      flag + its numeric knob fold into one collapsed "details" section; a
 *      fired flag surfaces as a visible caveat line instead.
 */
const PROFILE_PATH =
  'D:\\Libraries\\Documents\\projects\\clio-agent\\data\\earthscope\\earthscope_stations_clean.csv';
// elidePathMiddle(PROFILE_PATH, 64): head "D:" survives, full basename
// survives (30 chars fits the 59-char budget left after the skeleton).
const PROFILE_PATH_ELIDED = 'D:/\u2026/earthscope_stations_clean.csv';

function profilePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data_path: PROFILE_PATH,
    columns: ['Site', 'Latitude', '(deg)'],
    success: true,
    file_path: PROFILE_PATH,
    size_bytes: 162790,
    column_count: 3,
    row_count: 1101,
    rows_profiled: 1101,
    row_scan_cap: 250000,
    scan_limited: false,
    profile_limited: false,
    message: 'Profiled 3 columns across 1101 of 1101 scanned rows',
    sample_rows: [
      { Site: 'P001', Latitude: 34.05, '(deg)': -118.24 },
      { Site: 'P002', Latitude: 34.06, '(deg)': -118.25 },
    ],
    dtypes: { Site: 'object', Latitude: 'float64', '(deg)': 'float64' },
    null_counts: { Site: 0, Latitude: 0, '(deg)': 0 },
    ...overrides,
  };
}

describe('general result ladder -- rule 3, identity once (pandas_profile_csv acceptance payload)', () => {
  it('the declared message leads both the collapsed preview and the opened well, with no success row', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_80')}
        result={toolResult('call_80', {
          content: [{ type: 'text', text: 'profiled' }],
          structured_content: profilePayload(),
        })}
      />,
    );
    expect(screen.getByText('Profiled 3 columns across 1101 of 1101 scanned rows')).toBeInTheDocument();
    openRow(/pandas_profile_csv/);
    expect(screen.getByTestId('part-tool-summary')).toHaveTextContent(
      'Profiled 3 columns across 1101 of 1101 scanned rows',
    );
    expect(screen.queryByText('success')).toBeNull();
  });

  it('data_path/file_path (identical values) fold into ONE identity fact -- separate spans, never middot-joined', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_81')}
        result={toolResult('call_81', {
          content: [{ type: 'text', text: 'profiled' }],
          structured_content: profilePayload(),
        })}
      />,
    );
    openRow(/pandas_profile_csv/);
    const identityLines = screen.getAllByTestId('part-tool-identity');
    expect(identityLines).toHaveLength(1);
    const identity = identityLines[0]!;
    // Owner correction: separation is layout (three separate spans), never
    // a middot glued into the text.
    expect(identity.textContent).not.toContain('·');
    const primary = within(identity).getByText(PROFILE_PATH_ELIDED);
    expect(primary.className).toContain('part-toolrow__identityprimary');
    const size = within(identity).getByText('159.0 KB');
    expect(size.className).toContain('part-toolrow__identitysecondary');
    const shape = within(identity).getByText('1,101 rows × 3 columns');
    expect(shape.className).toContain('part-toolrow__identitysecondary');
    // The consumed fields never ALSO render as separate rows.
    expect(screen.queryByText('data_path')).toBeNull();
    expect(screen.queryByText('file_path')).toBeNull();
    expect(screen.queryByText('size_bytes')).toBeNull();
    expect(screen.queryByText('row_count')).toBeNull();
    expect(screen.queryByText('column_count')).toBeNull();
  });

  it('a non-path duplicate value still dedupes to one fact, just the bare primary value with no secondary spans', () => {
    render(
      <ToolPart
        call={toolCall('some_dedup_tool', {}, 'call_82')}
        result={toolResult('call_82', {
          content: [{ type: 'text', text: 'done' }],
          structured_content: { region: 'Los Angeles', label: 'Los Angeles', size_bytes: 999 },
        })}
      />,
    );
    openRow(/some_dedup_tool/);
    const identity = screen.getByTestId('part-tool-identity');
    expect(identity).toHaveTextContent('Los Angeles');
    expect(identity.textContent).not.toContain('·');
    expect(screen.queryByTestId('part-tool-identity')?.querySelector('.part-toolrow__identitysecondary')).toBeNull();
    // size_bytes has no path-like identity fact to pair onto here, so it's
    // untouched by rule 3 -- it still renders as its own ordinary row.
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).toHaveTextContent('size_bytes');
    expect(kv).toHaveTextContent('999');
  });
});

describe('general result ladder -- no separator glyphs in UI-composed strings (owner correction, P4R)', () => {
  /**
   * Owner correction: a middot-joined "path · size · shape" identity line
   * "looks like a json {path · size · shape} looking slightly nicer... a
   * general bad practice" -- separator glyphs are never composed into a UI
   * string, separation is layout (CSS gap between spans), not punctuation.
   * This guards every string THIS ladder composes -- identity spans,
   * caveat lines, the details fold's own toggle label, and content_blocks
   * elision markers -- never verbatim wire/model content (a `message`, a
   * sample-row cell, a raw JSON dump), which is free to contain whatever
   * the tool/model actually said.
   */
  it('identity spans, caveat lines, the details fold label, and elision markers all contain no middot', () => {
    render(
      <>
        <ToolPart
          call={toolCall('pandas_profile_csv', {}, 'call_99')}
          result={toolResult('call_99', {
            content: [{ type: 'text', text: 'profiled' }],
            structured_content: profilePayload({ scan_limited: true }),
          })}
        />
        <ToolPart
          call={toolCall('plot_plot_timeseries', {}, 'call_100')}
          result={toolResult('call_100', {
            content: [{ type: 'text', text: 'plotted' }],
            content_blocks: [
              { type: 'image', mimeType: 'image/png', elided: 'content_block_oversize', bytes: 2411725 },
            ],
          })}
        />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /pandas_profile_csv/ }));
    fireEvent.click(screen.getByRole('button', { name: /plot_plot_timeseries/ }));
    // Open the (still-present, profile_limited=false) details fold too, so
    // its toggle label is on screen.
    fireEvent.click(screen.getByTestId('part-tool-result-section-toggle'));

    const composed = [
      ...screen.getAllByTestId('part-tool-identity'),
      ...screen.getAllByTestId('part-tool-caveat'),
      ...screen.getAllByTestId('part-tool-result-section-toggle'),
      ...screen.getAllByTestId('part-tool-block-elided'),
    ];
    expect(composed.length).toBeGreaterThan(0);
    for (const el of composed) {
      expect(el.textContent ?? '').not.toContain('·');
    }
  });
});

describe('general result ladder -- rule 4, sibling-map join (pandas_profile_csv acceptance payload)', () => {
  it('dtypes/null_counts join into ONE column|dtypes|null_counts table, ordered by the columns array', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_83')}
        result={toolResult('call_83', {
          content: [{ type: 'text', text: 'profiled' }],
          structured_content: profilePayload(),
        })}
      />,
    );
    openRow(/pandas_profile_csv/);
    const grids = screen.getAllByTestId('part-tool-result-grid');
    // sample_rows table + the ONE joined dtypes/null_counts table -- never
    // two separate collapsed sections for dtypes and null_counts.
    expect(grids).toHaveLength(2);
    const joined = grids[1]!;
    expect(within(joined).getByRole('columnheader', { name: 'column' })).toBeInTheDocument();
    expect(within(joined).getByRole('columnheader', { name: 'dtypes' })).toBeInTheDocument();
    expect(within(joined).getByRole('columnheader', { name: 'null_counts' })).toBeInTheDocument();
    expect(within(joined).getAllByRole('row')).toHaveLength(1 + 3);
    const rows = within(joined).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Site');
    expect(rows[0]).toHaveTextContent('object');
    expect(rows[0]).toHaveTextContent('0');
    // columns/dtypes/null_counts never ALSO land in a generic KV row.
    expect(screen.queryByTestId('part-tool-result-table')).toBeNull();
    expect(screen.queryByText('columns')).toBeNull();
    // sample_rows is still a real table alongside it.
    const labels = screen.getAllByTestId('part-tool-result-subtable-label');
    expect(labels[0]).toHaveTextContent('sample_rows (2)');
  });

  it('without a matching array field, the join still fires: header falls back to "key", row order follows the first map', () => {
    render(
      <ToolPart
        call={toolCall('sibling_probe', {}, 'call_84')}
        result={toolResult('call_84', {
          content: [{ type: 'text', text: 'probed' }],
          structured_content: {
            dtypes: { b: 'int64', a: 'object' },
            null_counts: { b: 1, a: 0 },
          },
        })}
      />,
    );
    openRow(/sibling_probe/);
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(within(grid).getByRole('columnheader', { name: 'key' })).toBeInTheDocument();
    const rows = within(grid).getAllByRole('row').slice(1);
    // Row order follows dtypes' own key order (b, then a) -- no columns
    // array present to reorder it.
    expect(rows[0]).toHaveTextContent('b');
    expect(rows[1]).toHaveTextContent('a');
  });

  it('a lone scalar map (no sibling with the same key set) never joins -- stays a plain nested section', () => {
    render(
      <ToolPart
        call={toolCall('lone_map_probe', {}, 'call_85')}
        result={toolResult('call_85', {
          content: [{ type: 'text', text: 'probed' }],
          structured_content: { dtypes: { a: 'object' } },
        })}
      />,
    );
    openRow(/lone_map_probe/);
    expect(screen.queryByTestId('part-tool-result-grid')).toBeNull();
    expect(screen.getByTestId('part-tool-result-section')).toHaveTextContent('dtypes');
  });
});

describe('general result ladder -- rule 5, caps/caveats only when bound (pandas_profile_csv acceptance payload)', () => {
  it('unfired scan_limited/profile_limited + their knobs fold into ONE collapsed "details" section, no caveat line', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_86')}
        result={toolResult('call_86', {
          content: [{ type: 'text', text: 'profiled' }],
          structured_content: profilePayload(),
        })}
      />,
    );
    openRow(/pandas_profile_csv/);
    expect(screen.queryByTestId('part-tool-caveat')).toBeNull();
    const sections = screen.getAllByTestId('part-tool-result-section');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toHaveTextContent('details');
    // Collapsed by default.
    expect(screen.queryByText('row_scan_cap')).toBeNull();
    fireEvent.click(screen.getByTestId('part-tool-result-section-toggle'));
    expect(screen.getByText('scan_limited')).toBeInTheDocument();
    expect(screen.getByText('row_scan_cap')).toBeInTheDocument();
    expect(screen.getByText('250000')).toBeInTheDocument();
    expect(screen.getByText('profile_limited')).toBeInTheDocument();
    expect(screen.getByText('rows_profiled')).toBeInTheDocument();
    // The fold never re-detects itself and nests a second "details" fold.
    expect(screen.queryAllByTestId('part-tool-result-section')).toHaveLength(1);
  });

  it('a TRUE scan_limited surfaces a visible "scan capped at 250,000" caveat instead of the fold', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_87')}
        result={toolResult('call_87', {
          content: [{ type: 'text', text: 'profiled' }],
          structured_content: profilePayload({ scan_limited: true }),
        })}
      />,
    );
    openRow(/pandas_profile_csv/);
    const caveat = screen.getByTestId('part-tool-caveat');
    expect(caveat).toHaveTextContent('scan capped at 250,000');
    // scan_limited/row_scan_cap never ALSO land in the details fold --
    // profile_limited (still false) does.
    fireEvent.click(screen.getByTestId('part-tool-result-section-toggle'));
    expect(screen.queryByText('scan_limited')).toBeNull();
    expect(screen.queryByText('row_scan_cap')).toBeNull();
    expect(screen.getByText('profile_limited')).toBeInTheDocument();
  });

  it('a fired flag with no numeric knob companion surfaces the bare stem', () => {
    render(
      <ToolPart
        call={toolCall('bare_flag_probe', {}, 'call_88')}
        result={toolResult('call_88', {
          content: [{ type: 'text', text: 'done' }],
          structured_content: { truncated: true, note: 'partial output' },
        })}
      />,
    );
    openRow(/bare_flag_probe/);
    expect(screen.getByTestId('part-tool-caveat')).toHaveTextContent('truncated');
  });

  it('no-op: a payload with none of the rules 3-5 shapes renders exactly as before (regression pin)', () => {
    render(
      <ToolPart
        call={toolCall('geo_geocode', {}, 'call_89')}
        result={toolResult('call_89', {
          content: [{ type: 'text', text: 'resolved' }],
          structured_content: { center: '34.05,-118.24', provenance: 'osm_nominatim' },
        })}
      />,
    );
    openRow(/geo_geocode/);
    const kv = screen.getByTestId('part-tool-result-table');
    expect(kv).toHaveTextContent('center');
    expect(kv).toHaveTextContent('provenance');
    expect(screen.queryByTestId('part-tool-identity')).toBeNull();
    expect(screen.queryByTestId('part-tool-caveat')).toBeNull();
    expect(screen.queryByTestId('part-tool-result-section')).toBeNull();
    expect(screen.queryByTestId('part-tool-result-grid')).toBeNull();
  });
});

/**
 * The `content_blocks` rung (clio-agent 285434f5, kit 2.7.1's plot tools):
 * an OPTIONAL top-level array on the tool_result part, distinct from both
 * `content` (the legacy MCP envelope) and `structured_content` -- a tool
 * showcase that composes ABOVE the structured rows rather than replacing
 * them.
 */
describe('content_blocks rung (clio-agent 285434f5, kit 2.7.1 plot tools)', () => {
  it('an image/* block with base64 data renders inline via a data: URI, above the structured rows', () => {
    render(
      <ToolPart
        call={toolCall('plot_plot_timeseries', {}, 'call_90')}
        result={toolResult('call_90', {
          content: [{ type: 'text', text: 'plotted' }],
          content_blocks: [{ type: 'image', mimeType: 'image/png', data: 'AAAA' }],
          structured_content: { data_points: 1101 },
        })}
      />,
    );
    openRow(/plot_plot_timeseries/);
    const wrap = screen.getByTestId('part-tool-block-image');
    const img = within(wrap).getByRole('img');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    const kv = screen.getByTestId('part-tool-result-table');
    // The image showcase precedes the structured rows in document order.
    expect(wrap.compareDocumentPosition(kv) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('an image/* block carrying a `uri` (not `url`) renders through the same inline image path', () => {
    render(
      <ToolPart
        call={toolCall('plot_plot_timeseries', {}, 'call_91')}
        result={toolResult('call_91', {
          content: [{ type: 'text', text: 'plotted' }],
          content_blocks: [
            { type: 'image', mimeType: 'image/png', uri: 'https://example.test/plot.png' },
          ],
        })}
      />,
    );
    openRow(/plot_plot_timeseries/);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://example.test/plot.png');
  });

  it('an elided block renders an honest marker line, never a broken <img>', () => {
    render(
      <ToolPart
        call={toolCall('plot_plot_timeseries', {}, 'call_92')}
        result={toolResult('call_92', {
          content: [{ type: 'text', text: 'plotted' }],
          content_blocks: [
            { type: 'image', mimeType: 'image/png', elided: 'content_block_oversize', bytes: 2411725 },
          ],
        })}
      />,
    );
    openRow(/plot_plot_timeseries/);
    expect(screen.getByTestId('part-tool-block-elided')).toHaveTextContent(
      'image (image/png) elided — 2.3 MB, over the wire cap',
    );
    expect(screen.queryByTestId('part-tool-block-image')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('text blocks render as prose; multiple blocks stack, each its own paragraph', () => {
    render(
      <ToolPart
        call={toolCall('some_narrating_tool', {}, 'call_93')}
        result={toolResult('call_93', {
          content: [{ type: 'text', text: 'done' }],
          content_blocks: [
            { type: 'text', text: 'First paragraph of narration.' },
            { type: 'text', text: 'Second paragraph of narration.' },
          ],
        })}
      />,
    );
    openRow(/some_narrating_tool/);
    const blocks = screen.getAllByTestId('part-tool-block-text');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent('First paragraph of narration.');
    expect(blocks[1]).toHaveTextContent('Second paragraph of narration.');
  });

  it('absent content_blocks field -> zero change from before (pin)', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_94')}
        result={toolResult('call_94', {
          content: [{ type: 'text', text: '{"rows": 1101, "path": "gnss.csv"}' }],
        })}
      />,
    );
    openRow(/pandas_profile_csv/);
    expect(screen.queryByTestId('part-tool-block-image')).toBeNull();
    expect(screen.queryByTestId('part-tool-block-elided')).toBeNull();
    expect(screen.queryByTestId('part-tool-block-text')).toBeNull();
    const table = screen.getByTestId('part-tool-result-table');
    expect(table).toHaveTextContent('rows');
    expect(table).toHaveTextContent('1101');
  });

  it('a FAILED result never shows its content_blocks showcase (same is_error discipline as the rest of the ladder)', () => {
    render(
      <ToolPart
        call={toolCall('plot_plot_timeseries', {}, 'call_95')}
        result={toolResult('call_95', {
          is_error: true,
          content: [{ type: 'text', text: 'failed: timeout' }],
          content_blocks: [{ type: 'image', mimeType: 'image/png', data: 'AAAA' }],
        })}
      />,
    );
    openRow(/plot_plot_timeseries/);
    expect(screen.queryByTestId('part-tool-block-image')).toBeNull();
    expect(screen.getByText('failed: timeout')).toBeInTheDocument();
  });
});

/**
 * Row-render defect #3 (owner-quoted, live wire finding, session
 * sess_0f25a6ac6f36, sub-session sess_f3c3a6b2f608, call_1ecf27ea77ec): the
 * expanded well for `jarvis_add_step` read as though only `cluster` mattered
 * -- the other inputs (`pipeline_id`, `step_id`, the `config` dict) never
 * stood out from an unbroken single-cell JSON blob. Fix: every input key
 * renders -- scalars in the flat two-column params grid, a non-empty
 * dict/list value as its own collapsible section (the SAME NestedSection
 * idiom the result well already uses), nothing ever silently omitted.
 */
describe('params well -- every input key renders, dict/list values become collapsible sections (row-render defect #3)', () => {
  it('the jarvis_add_step shape: scalars stay flat rows, the config dict becomes its own collapsed section', () => {
    render(
      <ToolPart
        call={toolCall(
          'jarvis_add_step',
          {
            cluster: 'ares-p5run2',
            pipeline_id: 'smoke-hostname-p1',
            package_name: 'builtin.my_shell',
            config: { script: 'smoke_hostname.sh' },
            step_id: 'print-hostname',
            idempotency_key: 'smoke-hostname-addstep-1',
            timeout_seconds: 60,
          },
          'call_add_step',
        )}
      />,
    );
    openRow(/jarvis_add_step/);
    // Every scalar key/value from the wire renders in the flat params grid.
    const paramsGrid = document.querySelector('.part-toolrow__well > .part-toolrow__grid')!;
    expect(paramsGrid).toHaveTextContent('cluster');
    expect(paramsGrid).toHaveTextContent('ares-p5run2');
    expect(paramsGrid).toHaveTextContent('pipeline_id');
    expect(paramsGrid).toHaveTextContent('smoke-hostname-p1');
    expect(paramsGrid).toHaveTextContent('package_name');
    expect(paramsGrid).toHaveTextContent('builtin.my_shell');
    expect(paramsGrid).toHaveTextContent('step_id');
    expect(paramsGrid).toHaveTextContent('print-hostname');
    expect(paramsGrid).toHaveTextContent('idempotency_key');
    expect(paramsGrid).toHaveTextContent('timeout_seconds');
    // The config dict never lands in the flat grid as a JSON blob cell.
    expect(paramsGrid).not.toHaveTextContent('script');
    expect(paramsGrid).not.toHaveTextContent('smoke_hostname.sh');
    // ...instead it's its OWN collapsible section, collapsed by default.
    const section = screen.getByTestId('part-tool-param-section');
    expect(section).toHaveTextContent('config');
    expect(within(section).queryByText('script')).toBeNull();
    fireEvent.click(screen.getByTestId('part-tool-param-section-toggle'));
    expect(within(section).getByText('script')).toBeInTheDocument();
    expect(within(section).getByText('smoke_hostname.sh')).toBeInTheDocument();
  });

  it('a list-valued param that is not a uniform object array becomes a section of index -> value rows', () => {
    render(
      <ToolPart
        call={toolCall('plot_plot_timeseries', { output_path: 'plot.png', y_columns: ['Latitude', 'Longitude'] }, 'call_ycols')}
      />,
    );
    openRow(/plot_plot_timeseries/);
    const section = screen.getByTestId('part-tool-param-section');
    expect(section).toHaveTextContent('y_columns');
    expect(within(section).queryByText('Latitude')).toBeNull();
    fireEvent.click(screen.getByTestId('part-tool-param-section-toggle'));
    expect(within(section).getByText('Latitude')).toBeInTheDocument();
    expect(within(section).getByText('Longitude')).toBeInTheDocument();
  });

  it('a uniform-object-array param (more than one row) renders as a real table inside its collapsible section', () => {
    render(
      <ToolPart
        call={toolCall(
          'batch_configure',
          { steps: [{ id: 'a', kind: 'x' }, { id: 'b', kind: 'y' }] },
          'call_steps',
        )}
      />,
    );
    openRow(/batch_configure/);
    fireEvent.click(screen.getByTestId('part-tool-param-section-toggle'));
    const grid = screen.getByTestId('part-tool-result-grid');
    expect(within(grid).getByText('a')).toBeInTheDocument();
    expect(within(grid).getByText('b')).toBeInTheDocument();
  });

  it('an empty dict/array param value stays an inline flat row (a typed marker, not a pointless section)', () => {
    render(
      <ToolPart call={toolCall('create_artifact', { name: 'x.sh', artifacts: null, used: null, tags: [] }, 'call_empty')} />,
    );
    openRow(/create_artifact/);
    const paramsGrid = document.querySelector('.part-toolrow__well > .part-toolrow__grid')!;
    expect(paramsGrid).toHaveTextContent('artifacts');
    expect(paramsGrid).toHaveTextContent('null');
    expect(paramsGrid).toHaveTextContent('tags');
    expect(screen.queryByTestId('part-tool-param-section')).toBeNull();
  });

  it('an all-scalar input renders exactly as before -- flat grid only, no sections (regression pin)', () => {
    render(<ToolPart call={toolCall('geo_geocode', { query: 'Los Angeles, CA' }, 'call_scalar')} />);
    openRow(/geo_geocode/);
    expect(screen.getByText('query')).toBeInTheDocument();
    expect(screen.getByText('Los Angeles, CA')).toBeInTheDocument();
    expect(screen.queryByTestId('part-tool-param-section')).toBeNull();
  });
});

/**
 * Row-render defect #4 (owner-quoted, live wire finding, session
 * sess_0f25a6ac6f36, sub-session sess_f3c3a6b2f608): `jarvis_describe`/
 * `create_artifact` wells showed a `{"result": {"inventory_revision": ...`
 * raw dump. Verified against the live wire parts: `create_artifact`'s
 * tool_result carries NO `structured_content` field at all, only this text
 * -- the object grammar (rules 1-5, tables, collapsible sections) only ever
 * engaged for a real `structured_content` payload. Fix: when there is no
 * `structured_content` and the text parses as a JSON object, run the SAME
 * object grammar on the parsed text.
 */
describe('text-only JSON-object result runs the SAME object grammar as structured_content (row-render defect #4)', () => {
  it('the jarvis_describe shape: a nested result dict becomes a collapsible section, never a raw dump', () => {
    render(
      <ToolPart
        call={toolCall('jarvis_describe', { cluster: 'ares-p5run2', target: 'package_search' }, 'call_describe')}
        result={toolResult('call_describe', {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                result: {
                  inventory_revision: '69b0d3644540c7cd3024f00df6b19aca75c0acb81a315fd89beebfe48bd15136',
                  query: 'shell',
                  packages: [{ name: 'builtin.my_shell', repository: 'builtin' }],
                },
              }),
            },
          ],
          // No structured_content field -- the exact live wire shape.
        })}
      />,
    );
    openRow(/jarvis_describe/);
    // Never a raw <pre> dump of the JSON text.
    expect(document.querySelector('.part-toolrow__result')).toBeNull();
    expect(screen.queryByText(/inventory_revision/)).toBeNull();
    // Instead: `result` (a nested dict) is its own collapsed section.
    const section = screen.getByTestId('part-tool-result-section');
    expect(section).toHaveTextContent('result');
    expect(within(section).queryByText('inventory_revision')).toBeNull();
    fireEvent.click(screen.getByTestId('part-tool-result-section-toggle'));
    expect(within(section).getByText('inventory_revision')).toBeInTheDocument();
    expect(
      within(section).getByText('69b0d3644540c7cd3024f00df6b19aca75c0acb81a315fd89beebfe48bd15136'),
    ).toBeInTheDocument();
    expect(within(section).getByText('query')).toBeInTheDocument();
    // Raw stays one keypress away, verbatim.
    fireEvent.click(screen.getByTestId('part-tool-raw-toggle'));
    expect(screen.getByTestId('part-tool-raw')).toHaveTextContent('inventory_revision');
  });

  it('the create_artifact shape (accepted/artifacts/deduplicated/rejected, no structured_content) renders via the KV rung, not a raw dump', () => {
    render(
      <ToolPart
        call={toolCall('create_artifact', { name: 'smoke_hostname.sh', kind: 'script' }, 'call_artifact')}
        result={toolResult('call_artifact', {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                accepted: 0,
                artifacts: [{ accepted: true, name: 'smoke_hostname.sh', reason: 'already_registered' }],
                deduplicated: 1,
                rejected: 0,
              }),
            },
          ],
        })}
      />,
    );
    openRow(/create_artifact/);
    expect(document.querySelector('.part-toolrow__result')).toBeNull();
    const table = screen.getByTestId('part-tool-result-table');
    expect(table).toHaveTextContent('accepted');
    expect(table).toHaveTextContent('deduplicated');
    expect(table).toHaveTextContent('rejected');
    // Raw stays reachable, never removed.
    fireEvent.click(screen.getByTestId('part-tool-raw-toggle'));
    expect(screen.getByTestId('part-tool-raw')).toHaveTextContent('already_registered');
  });

  it('a non-JSON text well is unchanged: still the verbatim <pre>, no interpreted rung, no raw toggle (regression pin)', () => {
    render(
      <ToolPart
        call={toolCall('shell_bash', { command: 'hostname' }, 'call_plain')}
        result={toolResult('call_plain', { content: [{ type: 'text', text: 'compute-node-07' }] })}
      />,
    );
    openRow(/shell_bash/);
    expect(screen.getByText('compute-node-07')).toBeInTheDocument();
    expect(document.querySelector('.part-toolrow__result')).not.toBeNull();
    expect(screen.queryByTestId('part-tool-result-table')).toBeNull();
    expect(screen.queryByTestId('part-tool-result-section')).toBeNull();
    expect(screen.queryByTestId('part-tool-raw-toggle')).toBeNull();
  });
});

/**
 * A10 (owner-quoted, live UI watcher finding, session sess_0f25a6ac6f36,
 * sub-session sess_f3c3a6b2f608): with the row-render defect #4 fallback
 * landed (the OPENED well now runs the object grammar on parsed text too),
 * the COLLAPSED preview line was left behind — `structuredPreview` never
 * knew about that same text fallback, so a `jarvis_describe`-shaped result
 * (`structured_content: {result: {...}}`, or the equivalent as parsed text
 * with no `structured_content` at all, e.g. `create_artifact`) still showed
 * the raw JSON one-liner as its collapsed preview, visible with zero
 * interaction. Verified live: exactly this shape on 3 of the fixture's 14
 * rows (both `jarvis_describe` calls, and `create_artifact`).
 */
describe('collapsed preview never shows raw JSON (row-render defect A10)', () => {
  it('the jarvis_describe shape: no top-level scalar anywhere -- preview shows nothing, never the raw JSON one-liner', () => {
    render(
      <ToolPart
        call={toolCall('jarvis_describe', { cluster: 'ares-p5run2', target: 'package_search' }, 'call_a10_1')}
        result={toolResult('call_a10_1', {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                result: { inventory_revision: 'abc123', packages: [{ name: 'builtin.my_shell' }] },
              }),
            },
          ],
          structured_content: {
            result: { inventory_revision: 'abc123', packages: [{ name: 'builtin.my_shell' }] },
          },
        })}
      />,
    );
    // Collapsed -- the row was never opened.
    expect(screen.queryByText(/inventory_revision/)).toBeNull();
    expect(screen.queryByText(/\{"result"/)).toBeNull();
    // Nothing summary-worthy anywhere on the payload -- the preview line
    // itself never renders (never the raw JSON), the row's own status/
    // duration stand alone.
    expect(document.querySelector('.part-toolrow__preview')).toBeNull();
  });

  it('the create_artifact shape: no structured_content at all, but the text parses as JSON with a usable scalar -- preview derives it, never raw JSON', () => {
    render(
      <ToolPart
        call={toolCall('create_artifact', { name: 'smoke_hostname.sh' }, 'call_a10_2')}
        result={toolResult('call_a10_2', {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ accepted: 0, artifacts: [{ accepted: true }], deduplicated: 1, rejected: 0 }),
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('accepted: 0')).toBeInTheDocument();
    expect(screen.queryByText(/\{"accepted"/)).toBeNull();
  });

  it('a payload with an identity fact (rule 3) but no message/summary derives the preview from it, not the first raw scalar', () => {
    render(
      <ToolPart
        call={toolCall('some_dedup_tool', {}, 'call_a10_3')}
        result={toolResult('call_a10_3', {
          content: [{ type: 'text', text: 'done' }],
          structured_content: { region: 'Los Angeles', label: 'Los Angeles', size_bytes: 999 },
        })}
      />,
    );
    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
  });

  it('regression pin: a non-JSON, non-structured result still falls back to its raw text preview (round-10 gate finding D3)', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_a10_4')}
        result={toolResult('call_a10_4', { content: [{ type: 'text', text: 'stdout only' }] })}
      />,
    );
    expect(screen.getByText('stdout only')).toBeInTheDocument();
  });

  it('regression pin: structured_content with no usable field but genuinely non-JSON text still falls back to that text (round-10 gate finding D3)', () => {
    render(
      <ToolPart
        call={toolCall('geo_geocode', { query: 'LA' }, 'call_a10_5')}
        result={toolResult('call_a10_5', {
          content: [{ type: 'text', text: 'plain prose result' }],
          structured_content: { points: [{ lat: 1 }, { lat: 2 }] },
        })}
      />,
    );
    expect(screen.getByText('plain prose result')).toBeInTheDocument();
  });
});

/**
 * A7 (owner-quoted, live UI watcher finding, relay_wait row): the wire
 * carries `structured_content: {job, resolved_via, result}` where
 * `result.content[0].text` is itself an 18K+-char JSON-shaped string (an MCP
 * content-block `text` field one layer down from the outer envelope) AND a
 * `content_blocks` array whose own text block carries the FULL 38K+-char
 * envelope re-serialized. Both, rendered verbatim (a KV row's
 * `JSON.stringify`, and a content_blocks paragraph), painted a 6000+px wall.
 * This is a WIRE defect (server-side double-serialization) to report, not
 * something the client recursively decodes -- the fix is presentation-only
 * clamping with an expand affordance, proven here on a representative
 * fixture (the real fixture's strings are far larger; the mechanism is
 * length-driven, so a smaller over-cap string exercises the same code path).
 */
describe('long string values in wells clamp with an expand affordance, never render unbounded (row-render defect A7)', () => {
  const HUGE = `{"nested":"${'x'.repeat(2500)}"}`;

  it('a KV row whose value is a pathologically long string clamps by default, with a "show more" toggle to the full value', () => {
    render(
      <ToolPart
        call={toolCall('relay_wait', {}, 'call_a7_1')}
        result={toolResult('call_a7_1', {
          content: [{ type: 'text', text: 'ok' }],
          structured_content: { resolved_via: 'serve_task_record', payload: HUGE },
        })}
      />,
    );
    openRow(/relay_wait/);
    const toggle = screen.getByTestId('part-tool-value-expand');
    expect(toggle).toHaveTextContent(/show more/);
    const valueSpan = toggle.closest('.part-toolrow__v');
    expect(valueSpan?.textContent?.length ?? Infinity).toBeLessThan(HUGE.length);
    fireEvent.click(toggle);
    expect(valueSpan?.textContent).toContain(HUGE);
  });

  it('a short KV value renders unchanged -- no wrapper, no toggle (regression pin)', () => {
    render(
      <ToolPart
        call={toolCall('jarvis_create_pipeline', {}, 'call_a7_2')}
        result={toolResult('call_a7_2', {
          content: [{ type: 'text', text: 'ok' }],
          structured_content: { pipeline_id: 'smoke-hostname-p1' },
        })}
      />,
    );
    openRow(/jarvis_create_pipeline/);
    expect(screen.getByText('smoke-hostname-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('part-tool-value-expand')).toBeNull();
  });

  it('a content_blocks text block that is a pathologically long JSON-shaped string clamps too, never a 6000px wall', () => {
    render(
      <ToolPart
        call={toolCall('relay_wait', {}, 'call_a7_3')}
        result={toolResult('call_a7_3', {
          content: [{ type: 'text', text: 'ok' }],
          content_blocks: [{ type: 'text', text: HUGE }],
        })}
      />,
    );
    openRow(/relay_wait/);
    const block = screen.getByTestId('part-tool-block-text');
    expect(block.textContent?.length).toBeLessThan(HUGE.length);
    const toggle = screen.getByTestId('part-tool-block-text-expand');
    fireEvent.click(toggle);
    expect(block.textContent).toContain(HUGE);
  });

  it('a short content_blocks text block renders unchanged -- no toggle (regression pin)', () => {
    render(
      <ToolPart
        call={toolCall('some_narrating_tool', {}, 'call_a7_4')}
        result={toolResult('call_a7_4', {
          content: [{ type: 'text', text: 'done' }],
          content_blocks: [{ type: 'text', text: 'Short narration.' }],
        })}
      />,
    );
    openRow(/some_narrating_tool/);
    expect(screen.getByText('Short narration.')).toBeInTheDocument();
    expect(screen.queryByTestId('part-tool-block-text-expand')).toBeNull();
  });
});
