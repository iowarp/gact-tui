import { render, screen, cleanup, within } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';

afterEach(cleanup);

/**
 * v0.2 tool telemetry (capabilities.tool_telemetry): clio ships `cached` and
 * `duration_ms` on tool_result parts; the web must surface them inline (TUI
 * parity). These guard that the footer renders the cache badge + the rounded
 * duration, and stays absent when neither signal is present.
 */
describe('tool telemetry footer', () => {
  function renderResult(part: Record<string, unknown>) {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-tele',
            role: 'assistant',
            parts: [
              { type: 'tool_call', id: 'tc', call_id: 'tc', tool_name: 'read_file', input: {} },
              { type: 'tool_result', call_id: 'tc', output: 'ok', ...part },
            ],
          },
        ]}
      />
    ));
  }

  it('renders the cached badge and rounded duration', () => {
    renderResult({ cached: true, duration_ms: 1234.6 });
    const tele = screen.getByTestId('tool-telemetry');
    expect(within(tele).getByText('cached')).toBeTruthy();
    expect(within(tele).getByText('1235ms')).toBeTruthy();
  });

  it('renders only the duration when not cached', () => {
    renderResult({ duration_ms: 42 });
    const tele = screen.getByTestId('tool-telemetry');
    expect(within(tele).getByText('42ms')).toBeTruthy();
    expect(within(tele).queryByText('cached')).toBeNull();
  });

  it('renders no telemetry footer when neither signal is present', () => {
    renderResult({});
    expect(screen.queryByTestId('tool-telemetry')).toBeNull();
  });
});
