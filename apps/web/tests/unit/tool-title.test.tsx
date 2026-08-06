/**
 * A) Tool titles (owner design 2026-08-05). The wire grows OPTIONAL
 * tool_title/server_title fields on tool_call parts, never pre-concatenated.
 * When tool_title is present the row header shows it as the label with the
 * RAW NAME still visible (dimmed, monospace) next to it -- the label is for
 * the user, the raw name is what went to the model and must stay on screen
 * when a call fails. server_title has no display surface yet beyond a
 * title attribute. Absence of both fields must render EXACTLY today's
 * raw-name row (regression pin).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolPart } from '../../src/transcript/parts/ToolPart';
import { sanitizeTitle } from '../../src/transcript/parts/titleSanitizer';
import type { WirePart } from '../../src/transcript/registry';

function toolCall(fields: Record<string, unknown>, id = 'call_1'): WirePart {
  return { type: 'tool_call', id, call_id: id, ...fields };
}

function toolResult(callId: string, fields: Record<string, unknown> = {}): WirePart {
  return { type: 'tool_result', call_id: callId, content: [{ type: 'text', text: 'ok' }], ...fields };
}

describe('sanitizeTitle', () => {
  it('leaves a clean title untouched', () => {
    expect(sanitizeTitle('FooBar', 'raw_name')).toBe('FooBar');
  });

  it('strips control characters (bell) out of a title', () => {
    const bell = String.fromCharCode(7);
    expect(sanitizeTitle('Foo' + bell + 'Bar', 'raw_name')).toBe('FooBar');
  });

  it('strips newlines (and carriage returns) so a title cannot break the single-line row', () => {
    expect(sanitizeTitle('Foo\nBar\r\nBaz', 'raw_name')).toBe('FooBarBaz');
  });

  it('clamps an overlong title to 80 characters', () => {
    const result = sanitizeTitle('A'.repeat(200), 'raw_name');
    expect(result.length).toBe(80);
    expect(result.endsWith('...')).toBe(true);
  });

  it('falls back to the raw name when the title is empty', () => {
    expect(sanitizeTitle('', 'my_tool')).toBe('my_tool');
  });

  it('falls back to the raw name when the title is whitespace-only after stripping', () => {
    expect(sanitizeTitle('      ', 'my_tool')).toBe('my_tool');
  });

  it('falls back to the raw name for a non-string value', () => {
    expect(sanitizeTitle(undefined, 'my_tool')).toBe('my_tool');
    expect(sanitizeTitle(42, 'my_tool')).toBe('my_tool');
    expect(sanitizeTitle(null, 'my_tool')).toBe('my_tool');
  });

  it('leaves a well-formed short title untouched', () => {
    expect(sanitizeTitle('Read File', 'fs_read')).toBe('Read File');
  });
});

describe('ToolPart header -- tool_title/server_title present', () => {
  it('shows the title as the label and keeps the raw name visible, dimmed', () => {
    render(<ToolPart call={toolCall({ tool_name: 'fs_read', tool_title: 'Read File', input: {} })} />);
    expect(screen.getByText('Read File')).toBeInTheDocument();
    const rawname = screen.getByTestId('part-tool-rawname');
    expect(rawname).toHaveTextContent('fs_read');
  });

  it('sanitizes a hostile tool_title before it renders (clamped to 80 chars)', () => {
    const hostile = 'ReadFile' + 'X'.repeat(200);
    const { container } = render(
      <ToolPart call={toolCall({ tool_name: 'fs_read', tool_title: hostile, input: {} })} />,
    );
    const nameEl = container.querySelector('.part-toolrow__name');
    expect(nameEl).not.toBeNull();
    // Clamped: never renders the full 200+-char hostile string.
    expect(nameEl!.textContent!.length).toBeLessThanOrEqual(80);
    // The raw identifier still renders in full, untouched, alongside it.
    expect(screen.getByTestId('part-tool-rawname')).toHaveTextContent('fs_read');
  });

  it('threads server_title only as a title attribute -- no group header invented', () => {
    const { container } = render(
      <ToolPart
        call={toolCall({ tool_name: 'fs_read', tool_title: 'Read File', server_title: 'Filesystem MCP', input: {} })}
      />,
    );
    const namewrap = container.querySelector('.part-toolrow__namewrap');
    expect(namewrap?.getAttribute('title')).toBe('Filesystem MCP');
    // No new heading/breadcrumb element carries the server name.
    expect(screen.queryByText('Filesystem MCP')).toBeNull();
  });

  it('an empty tool_title (field present, blank) still renders without crashing', () => {
    render(<ToolPart call={toolCall({ tool_name: 'fs_read', tool_title: '', input: {} })} />);
    expect(screen.getByTestId('part-tool')).toBeInTheDocument();
  });
});

describe('ToolPart header -- absence of tool_title/server_title (regression pin)', () => {
  it('renders EXACTLY the raw-name row: no rawname element, no title attribute', () => {
    const { container } = render(<ToolPart call={toolCall({ tool_name: 'fs_read', input: {} })} />);
    expect(screen.getByText('fs_read')).toBeInTheDocument();
    expect(screen.queryByTestId('part-tool-rawname')).toBeNull();
    const namewrap = container.querySelector('.part-toolrow__namewrap');
    expect(namewrap?.hasAttribute('title')).toBe(false);
  });
});

/**
 * Grammar (owner design, injected-args refinement): a plain-word title, the
 * client-INJECTED `(args)` right after it, and the raw tool identifier last
 * as the muted secondary -- title/(args)/rawname, in that DOM order, never
 * parsed out of the title string itself. Works identically whether
 * `tool_title` is already a plain name or still the transitional
 * `verb(object)` shape.
 */
describe('ToolPart header -- injected (args) grammar', () => {
  it('orders title, then injected (args), then the raw name secondary', () => {
    const { container } = render(
      <ToolPart
        call={toolCall({ tool_name: 'plot_plot_timeseries', tool_title: 'Plot Timeseries', input: { output_path: 'plot.png' } })}
      />,
    );
    const namewrap = container.querySelector('.part-toolrow__namewrap')!;
    const children = Array.from(namewrap.children).map((el) => el.className);
    expect(children).toEqual([
      'part-toolrow__name',
      'part-toolrow__hint',
      'part-toolrow__rawname',
    ]);
    expect(namewrap.textContent).toBe('Plot Timeseries("plot.png")plot_plot_timeseries');
  });

  it('injects (args) even for a title still in the older verb(object) wire shape, verbatim, untransformed', () => {
    render(
      <ToolPart
        call={toolCall({
          tool_name: 'plot_plot_timeseries',
          tool_title: 'plot(timeseries)',
          input: { output_path: 'plot.png' },
        })}
      />,
    );
    // The title renders EXACTLY as the wire sent it -- never parsed/rewritten.
    expect(screen.getByText('plot(timeseries)')).toBeInTheDocument();
    const hint = screen.getByText('("plot.png")');
    expect(hint).toHaveClass('part-toolrow__hint');
  });

  it('injects (args) for a bare tool name with no title at all (no regression on the no-title path)', () => {
    const { container } = render(
      <ToolPart call={toolCall({ tool_name: 'geo_geocode', input: { query: 'Los Angeles, CA' } })} />,
    );
    const namewrap = container.querySelector('.part-toolrow__namewrap')!;
    expect(namewrap.textContent).toBe('geo_geocode("Los Angeles, CA")');
    expect(screen.queryByTestId('part-tool-rawname')).toBeNull();
  });

  it('picks the path-like argument over a positionally-earlier noise knob, middle-elided so the basename survives', () => {
    const longPath =
      'D:\\Libraries\\Documents\\projects\\clio-runs\\test-fanout\\earthscope_station_distribution.png';
    const { container } = render(
      <ToolPart
        call={toolCall({
          tool_name: 'plot_plot_timeseries',
          tool_title: 'Plot Timeseries',
          input: { max_rows: 1101, output_path: longPath },
        })}
      />,
    );
    // Never head-truncated into uselessness -- the basename is always intact.
    const hint = container.querySelector('.part-toolrow__hint');
    expect(hint?.textContent).toBe('(D:/\u2026/earthscope_station_distribution.png)');
    // The noise numeric knob never wins the hint slot.
    expect(hint?.textContent).not.toContain('1101');
  });

  it('skips a noise numeric-knob key and prefers a real string argument elsewhere in the input', () => {
    const { container } = render(
      <ToolPart
        call={toolCall({ tool_name: 'ndp_search_datasets', input: { limit: 10, search_terms: 'earthscope' } })}
      />,
    );
    expect(container.querySelector('.part-toolrow__hint')?.textContent).toBe('("earthscope")');
  });
});

/**
 * Round-7 finding: a collapsed re-polled wait carries `metadata.attempts`
 * and `metadata.budgets` on the tool_call part (wire-verified: attempts=2,
 * budgets=[60.0,90.0]) but the expanded well rendered only params+result --
 * the metadata facts never surfaced. Fix: two small chips ('attempts N' /
 * 'budgets Ns Ns', spaced, no middot) at the top of the well, present only
 * when the underlying field is present -- absent metadata renders nothing.
 */
describe('ToolPart well -- metadata attempts/budgets chips (round-7)', () => {
  it('renders both chips on a collapsed, re-polled wait (name + result matches the wire-verified case)', () => {
    render(
      <ToolPart
        call={toolCall({
          tool_name: 'wait_agent_tasks',
          input: { task_ids: ['task_a9dc5c70d5e5'] },
          metadata: { attempts: 2, budgets: [60.0, 90.0] },
        })}
        result={toolResult('call_1')}
      />,
    );
    // A resolved wait falls through to the normal collapsible row (only an
    // in-flight wait gets the special activity line) -- the round-7 defect
    // was in exactly this fallen-through, re-polled row.
    fireEvent.click(screen.getByRole('button', { name: /wait_agent_tasks/ }));
    const chips = screen.getByTestId('part-tool-metachips');
    expect(within(chips).getByTestId('part-tool-metachip-attempts')).toHaveTextContent('attempts 2');
    expect(within(chips).getByTestId('part-tool-metachip-budgets')).toHaveTextContent('budgets 60s 90s');
  });

  it('renders only the attempts chip when budgets is absent', () => {
    render(<ToolPart call={toolCall({ tool_name: 'run_query', input: {}, metadata: { attempts: 3 } })} />);
    fireEvent.click(screen.getByRole('button', { name: /run_query/ }));
    expect(screen.getByTestId('part-tool-metachip-attempts')).toHaveTextContent('attempts 3');
    expect(screen.queryByTestId('part-tool-metachip-budgets')).toBeNull();
  });

  it('renders only the budgets chip when attempts is absent, formatting fractional seconds compactly', () => {
    render(<ToolPart call={toolCall({ tool_name: 'run_query', input: {}, metadata: { budgets: [1.5, 30] } })} />);
    fireEvent.click(screen.getByRole('button', { name: /run_query/ }));
    expect(screen.queryByTestId('part-tool-metachip-attempts')).toBeNull();
    expect(screen.getByTestId('part-tool-metachip-budgets')).toHaveTextContent('budgets 1.5s 30s');
  });

  it('an attempts of exactly 1 (not a retry yet) does not earn a chip (single-attempt part -- no chips)', () => {
    render(<ToolPart call={toolCall({ tool_name: 'run_query', input: {}, metadata: { attempts: 1 } })} />);
    fireEvent.click(screen.getByRole('button', { name: /run_query/ }));
    expect(screen.queryByTestId('part-tool-metachips')).toBeNull();
  });

  it('no metadata on the call renders no chips at all (pinned)', () => {
    render(<ToolPart call={toolCall({ tool_name: 'fs_read', input: {} })} />);
    fireEvent.click(screen.getByRole('button', { name: /fs_read/ }));
    expect(screen.queryByTestId('part-tool-metachips')).toBeNull();
    expect(screen.queryByTestId('part-tool-metachip-attempts')).toBeNull();
    expect(screen.queryByTestId('part-tool-metachip-budgets')).toBeNull();
  });

  it('does not leak unrelated metadata keys (stream_source/telemetry_source stay internal)', () => {
    render(
      <ToolPart
        call={toolCall({
          tool_name: 'run_query',
          input: {},
          metadata: { attempts: 2, stream_source: 'sse', telemetry_source: 'otel' },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /run_query/ }));
    const chips = screen.getByTestId('part-tool-metachips');
    expect(chips).toHaveTextContent('attempts 2');
    expect(chips).not.toHaveTextContent('sse');
    expect(chips).not.toHaveTextContent('otel');
  });
});
