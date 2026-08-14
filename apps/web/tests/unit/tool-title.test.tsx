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
import { sanitizeTitle, titleIsRedundantWithRawName } from '../../src/transcript/parts/titleSanitizer';
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

/**
 * Row-render defect #1 (owner-quoted, live wire): `Create Artifact` bold,
 * with `create_artifact` repeated directly below in the muted raw-name slot,
 * is visual duplication -- the title alone already carries the fact.
 * Normalize both sides (lowercase, strip `[_ -]`) and compare for exact
 * equality; `Describe` vs. `jarvis_describe` are NOT the same fact stated
 * twice and must keep both.
 */
describe('titleIsRedundantWithRawName', () => {
  it('is redundant when the title is the raw name with spaces instead of underscores (owner example)', () => {
    expect(titleIsRedundantWithRawName('Create Artifact', 'create_artifact')).toBe(true);
  });

  it('is redundant modulo case as well as spacing', () => {
    expect(titleIsRedundantWithRawName('CREATE ARTIFACT', 'create_artifact')).toBe(true);
  });

  it('is redundant when the raw name uses hyphens instead of underscores', () => {
    expect(titleIsRedundantWithRawName('Add Step', 'add-step')).toBe(true);
  });

  it('is NOT redundant for a genuinely distinct title (owner example)', () => {
    expect(titleIsRedundantWithRawName('Describe', 'jarvis_describe')).toBe(false);
  });

  it('is NOT redundant when the title is merely a prefix/suffix of the raw name', () => {
    expect(titleIsRedundantWithRawName('Search', 'ndp_search_datasets')).toBe(false);
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
 * Row-render defect #1 (owner-quoted, live wire finding, session
 * sess_0f25a6ac6f36): a `create_artifact` call carries `tool_title: "Create
 * Artifact"` -- the raw-name line beneath it repeated the exact same fact
 * (`Create Artifact` bold, `create_artifact` muted directly below). Suppress
 * the muted raw-name line ONLY when it is that same fact restated; a title
 * that adds real information (`Describe` vs. `jarvis_describe`) keeps both.
 */
describe('ToolPart header -- title/raw-name redundancy suppression (row-render defect #1)', () => {
  it('suppresses the raw-name line when the title is the raw name with spaces (the exact create_artifact wire shape)', () => {
    const { container } = render(
      <ToolPart call={toolCall({ tool_name: 'create_artifact', tool_title: 'Create Artifact', input: { name: 'smoke_hostname.sh' } })} />,
    );
    expect(screen.getByText('Create Artifact')).toBeInTheDocument();
    expect(screen.queryByTestId('part-tool-rawname')).toBeNull();
    // The raw identifier is still available via the namewrap's title
    // attribute pathway is unaffected -- it just isn't duplicated as a
    // second visible line.
    const namewrap = container.querySelector('.part-toolrow__namewrap');
    expect(namewrap?.textContent).not.toContain('create_artifact');
  });

  it('keeps BOTH the title and the raw name when they are genuinely distinct (jarvis_describe wire shape)', () => {
    render(
      <ToolPart
        call={toolCall({ tool_name: 'jarvis_describe', tool_title: 'Describe', input: { cluster: 'ares-p5run2' } })}
      />,
    );
    expect(screen.getByText('Describe')).toBeInTheDocument();
    const rawname = screen.getByTestId('part-tool-rawname');
    expect(rawname).toHaveTextContent('jarvis_describe');
  });

  it('a title differing from the raw name only by case still suppresses the raw-name line', () => {
    render(
      <ToolPart call={toolCall({ tool_name: 'add_step', tool_title: 'ADD STEP', input: {} })} />,
    );
    expect(screen.getByText('ADD STEP')).toBeInTheDocument();
    expect(screen.queryByTestId('part-tool-rawname')).toBeNull();
  });

  it('a title differing from the raw name only by hyphen-vs-underscore still suppresses the raw-name line', () => {
    render(
      <ToolPart call={toolCall({ tool_name: 'add-step', tool_title: 'add_step', input: {} })} />,
    );
    expect(screen.queryByTestId('part-tool-rawname')).toBeNull();
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

  /**
   * Row-render defect #2 (owner-quoted, live wire finding, session
   * sess_0f25a6ac6f36, sub-session sess_f3c3a6b2f608, call_1ecf27ea77ec):
   * `jarvis_add_step ("ares-p5run2")` showed only the positionally-first
   * arg. The exact wire-verified input shape (`cluster, pipeline_id,
   * package_name, config, step_id, idempotency_key, timeout_seconds`) must
   * now yield `(ares-p5run2, smoke-hostname-p1, print-hostname)` -- the
   * three resource-identity coordinates (`cluster`, `pipeline_id`, `step_id`)
   * fill the up-to-3 hint budget ahead of `package_name` (a descriptive
   * field, not an identity coordinate), and the `config` dict never joins
   * the hint at all (owner: "the config would be too much").
   */
  it('the jarvis_add_step shape yields (cluster, pipeline_id, step_id) -- up to 3 identifying args, unquoted, comma-joined', () => {
    const { container } = render(
      <ToolPart
        call={toolCall({
          tool_name: 'jarvis_add_step',
          input: {
            cluster: 'ares-p5run2',
            pipeline_id: 'smoke-hostname-p1',
            package_name: 'builtin.my_shell',
            config: { script: 'smoke_hostname.sh' },
            step_id: 'print-hostname',
            idempotency_key: 'smoke-hostname-addstep-1',
            timeout_seconds: 60,
          },
        })}
      />,
    );
    const hint = container.querySelector('.part-toolrow__hint');
    expect(hint?.textContent).toBe('(ares-p5run2, smoke-hostname-p1, print-hostname)');
    // package_name never displaces an identity coordinate, and the config
    // dict never joins the hint at all.
    expect(hint?.textContent).not.toContain('builtin.my_shell');
    expect(hint?.textContent).not.toContain('script');
  });

  it('two identifying args render unquoted and comma-joined (below the 3-value cap)', () => {
    const { container } = render(
      <ToolPart
        call={toolCall({
          tool_name: 'jarvis_run',
          input: { cluster: 'ares-p5run2', pipeline_id: 'smoke-hostname-p1', timeout_seconds: 60 },
        })}
      />,
    );
    expect(container.querySelector('.part-toolrow__hint')?.textContent).toBe('(ares-p5run2, smoke-hostname-p1)');
  });

  it('caps at 3 identifying args even when more identity-shaped keys are present', () => {
    const { container } = render(
      <ToolPart
        call={toolCall({
          tool_name: 'jarvis_get_execution',
          input: {
            cluster: 'ares-p5run2',
            pipeline_id: 'smoke-hostname-p1',
            execution_id: 'exec-42',
            include_progress: true,
            idempotency_key: 'smoke-hostname-getexec-1',
            timeout_seconds: 60,
          },
        })}
      />,
    );
    const hint = container.querySelector('.part-toolrow__hint')?.textContent;
    expect(hint).toBe('(ares-p5run2, smoke-hostname-p1, exec-42)');
    // The boolean is never rendered into the hint at all.
    expect(hint).not.toContain('true');
  });

  it('a single identifying arg still renders quoted, matching every existing single-arg hint (regression pin)', () => {
    const { container } = render(
      <ToolPart call={toolCall({ tool_name: 'geo_geocode', input: { query: 'Los Angeles, CA' } })} />,
    );
    expect(container.querySelector('.part-toolrow__hint')?.textContent).toBe('("Los Angeles, CA")');
  });

  /**
   * The exact owner-reported case (clio-agent#1218-followup, SPOTTER demo
   * live wire): `phenotype_measure_cohort` rendered a bare `(5, 10)` in the
   * collapsed hint -- two plain numeric args (neither `cluster` nor an
   * `*_id`, so both fall in the "other" tier) with zero signal for which
   * number was `runs` and which was `pace_seconds`. Both now carry their key.
   */
  it('the measure_cohort shape: two plain numeric args render as "runs: 5, pace_seconds: 10", never a bare tuple', () => {
    const { container } = render(
      <ToolPart
        call={toolCall({ tool_name: 'phenotype_measure_cohort', input: { runs: 5, pace_seconds: 10 } })}
      />,
    );
    const hint = container.querySelector('.part-toolrow__hint')?.textContent;
    expect(hint).toBe('(runs: 5, pace_seconds: 10)');
    expect(hint).not.toBe('(5, 10)');
  });

  it('a mixed identity + plain-scalar hint labels only the plain scalar -- the identity coordinate stays bare', () => {
    const { container } = render(
      <ToolPart
        call={toolCall({
          tool_name: 'jarvis_run_step',
          input: { cluster: 'ares-p5run2', retries: 3 },
        })}
      />,
    );
    expect(container.querySelector('.part-toolrow__hint')?.textContent).toBe('(ares-p5run2, retries: 3)');
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
