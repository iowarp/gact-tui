/**
 * A3 (diagnosed live against session sess_cda96b286e4f, call
 * call_79f8fbdc63f7): `is_error` on a tool_result tracks MCP-protocol
 * success only — the tool call itself ran fine — while
 * `structured_content.exit_code` (numeric) and `structured_content.stderr`
 * carry the COMMAND's own outcome. A shell call that ran fine but whose
 * command exited non-zero has `is_error` absent/false with `exit_code: 1`
 * — the row's status glyph read only `is_error` and showed a green ✓ for a
 * real failure (a live `UnauthorizedAccessException` in stderr).
 *
 * The fix extends the SAME ✓/✗ + data-error vocabulary the `is_error` path
 * already drives for the row's status glyph to also fire on a non-zero
 * numeric `exit_code` — no third state — plus an honest `exited N` phrase
 * in the collapsed preview when the payload hasn't already declared its
 * own message/summary. Both wire fields (`is_error`, `exit_code`) stay
 * exactly as they arrived; only the glyph/preview DECISION changes.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolPart } from '../../src/transcript/parts/ToolPart';
import type { WirePart } from '../../src/transcript/registry';

function toolCall(toolName: string, input: unknown = {}, id = 'call_1'): WirePart {
  return { type: 'tool_call', id, call_id: id, tool_name: toolName, input };
}

function toolResult(callId: string, fields: Record<string, unknown>): WirePart {
  return { type: 'tool_result', call_id: callId, ...fields };
}

/**
 * The exact live shape (shell_server.py's own field names): command, cwd,
 * exit_code, stdout, stderr, timed_out, timeout_s (+ _truncated pairs) — no
 * `message`/`summary` field, so the generic first-scalar preview fallback
 * would otherwise pick `command`, saying nothing about the failure.
 * `structured` overrides merge into structured_content; `top` overrides
 * merge onto the tool_result part itself (e.g. `is_error`).
 */
function shellResult(
  callId: string,
  options: { structured?: Record<string, unknown>; top?: Record<string, unknown> } = {},
): WirePart {
  return toolResult(callId, {
    content: [{ type: 'text', text: 'stdout: \nstderr: UnauthorizedAccessException: Access is denied.' }],
    structured_content: {
      command: 'Remove-Item C:\\Windows\\System32\\protected.dll',
      cwd: 'C:\\Users\\demo',
      exit_code: 1,
      stdout: '',
      stderr: 'UnauthorizedAccessException: Access is denied.',
      timed_out: false,
      timeout_s: 30,
      ...options.structured,
    },
    ...options.top,
  });
}

function mark() {
  return screen.getByText(/^[✓✗]$/);
}

describe('status glyph -- a non-zero structured_content.exit_code reads as a failure (A3)', () => {
  it('shows the failure glyph when is_error is ABSENT and exit_code is 1 (the live defect shape)', () => {
    render(<ToolPart call={toolCall('shell_exec', {}, 'call_1')} result={shellResult('call_1')} />);
    const glyph = mark();
    expect(glyph).toHaveTextContent('✗');
    expect(glyph).toHaveAttribute('data-error', 'true');
  });

  it('shows the failure glyph when is_error is explicitly false and exit_code is 1', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_1b')}
        result={shellResult('call_1b', { top: { is_error: false } })}
      />,
    );
    const glyph = mark();
    expect(glyph).toHaveTextContent('✗');
    expect(glyph).toHaveAttribute('data-error', 'true');
  });

  it('exit_code === 0: no behavior change -- the success glyph, no data-error', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_2')}
        result={shellResult('call_2', { structured: { exit_code: 0 } })}
      />,
    );
    const glyph = mark();
    expect(glyph).toHaveTextContent('✓');
    expect(glyph).not.toHaveAttribute('data-error');
  });

  it('exit_code absent: no behavior change -- the success glyph, no data-error', () => {
    render(
      <ToolPart
        call={toolCall('some_tool', {}, 'call_3')}
        result={toolResult('call_3', { content: [{ type: 'text', text: 'ok' }] })}
      />,
    );
    const glyph = mark();
    expect(glyph).toHaveTextContent('✓');
    expect(glyph).not.toHaveAttribute('data-error');
  });

  it('exit_code absent even WITH other structured_content present: still no behavior change', () => {
    render(
      <ToolPart
        call={toolCall('pandas_profile_csv', {}, 'call_3b')}
        result={toolResult('call_3b', {
          content: [{ type: 'text', text: 'rows=1101' }],
          structured_content: { rows: 1101, path: 'gnss.csv' },
        })}
      />,
    );
    const glyph = mark();
    expect(glyph).toHaveTextContent('✓');
    expect(glyph).not.toHaveAttribute('data-error');
  });

  it('is_error: true stays unchanged regardless of exit_code (0)', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_4')}
        result={shellResult('call_4', { top: { is_error: true }, structured: { exit_code: 0 } })}
      />,
    );
    const glyph = mark();
    expect(glyph).toHaveTextContent('✗');
    expect(glyph).toHaveAttribute('data-error', 'true');
  });

  it('is_error: true stays unchanged when exit_code is ALSO a non-zero number (no double-negative flip)', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_4b')}
        result={shellResult('call_4b', { top: { is_error: true }, structured: { exit_code: 1 } })}
      />,
    );
    const glyph = mark();
    expect(glyph).toHaveTextContent('✗');
    expect(glyph).toHaveAttribute('data-error', 'true');
  });

  it('a non-numeric exit_code (string) is ignored -- never guessed', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_5')}
        result={shellResult('call_5', { structured: { exit_code: '1' } })}
      />,
    );
    const glyph = mark();
    expect(glyph).toHaveTextContent('✓');
    expect(glyph).not.toHaveAttribute('data-error');
  });

  it('a null exit_code is ignored -- never guessed', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_6')}
        result={shellResult('call_6', { structured: { exit_code: null } })}
      />,
    );
    const glyph = mark();
    expect(glyph).toHaveTextContent('✓');
    expect(glyph).not.toHaveAttribute('data-error');
  });

  it('no result yet (still running): no glyph at all, regardless of exit_code semantics', () => {
    render(<ToolPart call={toolCall('shell_exec', {}, 'call_7')} />);
    expect(screen.queryByText(/^[✓✗]$/)).toBeNull();
  });

  it('the opened well still renders the normal structured ladder unchanged -- exit_code/stderr visible, nothing suppressed', () => {
    render(<ToolPart call={toolCall('shell_exec', {}, 'call_8')} result={shellResult('call_8')} />);
    fireEvent.click(screen.getByRole('button', { name: /shell_exec/ }));
    const table = screen.getByTestId('part-tool-result-table');
    expect(table).toHaveTextContent('exit_code');
    expect(table).toHaveTextContent('stderr');
    expect(table).toHaveTextContent('Access is denied');
    // A raw toggle exists (the ladder interpreted this as a KV object,
    // exactly like any other successful structured_content -- unlike a real
    // is_error result, which forces the raw-only fallback).
    expect(screen.getByTestId('part-tool-raw-toggle')).toBeInTheDocument();
  });
});

describe('collapsed preview -- an honest "exited N" phrase when no tool-provided message covers it (A3)', () => {
  it('shows "exited 1" instead of the generic first-scalar-field guess (command) for the live defect shape', () => {
    render(<ToolPart call={toolCall('shell_exec', {}, 'call_10')} result={shellResult('call_10')} />);
    expect(screen.getByText('exited 1')).toBeInTheDocument();
    expect(screen.queryByText(/Remove-Item/)).toBeNull();
  });

  it('never renders the raw is_error/exit_code booleans or numbers as a field dump', () => {
    render(<ToolPart call={toolCall('shell_exec', {}, 'call_11')} result={shellResult('call_11')} />);
    expect(screen.queryByText(/exit_code/)).toBeNull();
    expect(screen.queryByText(/is_error/)).toBeNull();
  });

  it("defers to the tool's own declared message when one is present -- never doubled up", () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_12')}
        result={shellResult('call_12', { structured: { message: 'Access denied while removing protected.dll' } })}
      />,
    );
    expect(screen.getByText('Access denied while removing protected.dll')).toBeInTheDocument();
    expect(screen.queryByText('exited 1')).toBeNull();
  });

  it('exit_code === 0: the preview is exactly what it was before (no "exited" phrase)', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_13')}
        result={shellResult('call_13', { structured: { exit_code: 0 } })}
      />,
    );
    expect(screen.queryByText(/^exited/)).toBeNull();
    // Falls through to the existing first-scalar-field fallback, unchanged.
    expect(screen.getByText(/Remove-Item/)).toBeInTheDocument();
  });

  it('a FAILED (is_error: true) result keeps its existing raw-text preview -- unaffected by exit_code', () => {
    render(
      <ToolPart
        call={toolCall('shell_exec', {}, 'call_14')}
        result={shellResult('call_14', { top: { is_error: true }, structured: { exit_code: 1 } })}
      />,
    );
    expect(screen.queryByText('exited 1')).toBeNull();
    expect(screen.getByText(/UnauthorizedAccessException/)).toBeInTheDocument();
  });
});
