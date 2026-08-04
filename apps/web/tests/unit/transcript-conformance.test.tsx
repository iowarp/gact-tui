/**
 * Slice E-static failing-first contract — transcript part conformance
 * (P5 inventory E1–E4; docs/design/p4-conformance-gaps.md).
 *
 * E5/E7/E8 (child-agent cards, artifact chips, activity line) are grounded on
 * a live async capture and contracted separately; E9 (raw tool_result JSON /
 * routed-to lines) awaits the owner's grammar decision and is untouched here.
 */
import { render } from '@testing-library/react';
import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { Transcript } from '../../src/transcript/Transcript';

function msg(id: string, role: Message['role'], parts: unknown[]): Message {
  return { id, role, parts: parts as Message['parts'] };
}

describe('thinking header (E1, degraded per clio-agent#1177)', () => {
  it('reads `▸ thinking` — no token count until the wire carries one', () => {
    const { container } = render(
      <Transcript messages={[msg('m1', 'assistant', [{ type: 'thinking', text: 'pondering' }])]} />,
    );
    const head = container.querySelector('.part-thinkinghead');
    expect(head).not.toBeNull();
    expect(head!.textContent?.trim()).toBe('thinking');
    // The prototype's disclosure glyph, 14px row — not the 13px `›` form.
    const glyph = container.querySelector('.part-thinkingdisclose');
    expect(glyph?.textContent).toBe('▸');
    // NEVER a fabricated count.
    expect(head!.parentElement?.textContent).not.toMatch(/\d+\s*tokens/);
  });
});

describe('answer gutter (E2)', () => {
  it('assistant text carries the full-height accent gutter bar, not a dot', () => {
    const { container } = render(
      <Transcript messages={[msg('m1', 'assistant', [{ type: 'text', text: 'the answer' }])]} />,
    );
    expect(container.querySelector('.part-gutterbar')).not.toBeNull();
    expect(container.querySelector('.part-gutter-dot')).toBeNull();
  });
});

describe('tool call (E3/E4)', () => {
  const CALL = {
    type: 'tool_call',
    tool_name: 'earthscope_station_catalog',
    call_id: 'c1',
    input: { center_lat: 34.05, radius_km: 100 },
  };

  it('marks the call with the wrench, never the settings gear', () => {
    const { container } = render(<Transcript messages={[msg('m1', 'assistant', [CALL])]} />);
    const tool = container.querySelector('.part-tool');
    expect(tool?.querySelector('[data-icon="wrench"]')).not.toBeNull();
    expect(tool?.querySelector('[data-icon="tool"]')).toBeNull();
  });

  it('renders args as indented prose, not a dt/dd table', () => {
    const { container } = render(<Transcript messages={[msg('m1', 'assistant', [CALL])]} />);
    const tool = container.querySelector('.part-tool');
    expect(tool?.querySelector('dl')).toBeNull();
    const args = tool?.querySelector('.part-tool__args');
    expect(args).not.toBeNull();
    expect(args!.textContent).toContain('34.05');
  });
});
