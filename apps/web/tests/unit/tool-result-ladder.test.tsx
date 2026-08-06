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
    expect(kv).toHaveTextContent('ok');
    expect(kv).toHaveTextContent('true');
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
});
