/**
 * Slice E-static failing-first contract — transcript part conformance
 * (P5 inventory E1–E4; docs/design/p4-conformance-gaps.md).
 *
 * E5/E7/E8 (child-agent cards, artifact chips, activity line) are grounded on
 * a live async capture and contracted separately (transcript-async.test.tsx,
 * transcript.test.tsx). E3/E6 (the tool_call/tool_result fold + untruncated
 * error text) were the owner's open grammar decision noted here; they are now
 * IMPLEMENTED per docs/p5/conformance/transcript-parts.json and pinned below,
 * not still awaited.
 */
import { fireEvent, render } from '@testing-library/react';
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

  it('opens to a guide-railed body, not bare padding', () => {
    const { container } = render(
      <Transcript messages={[msg('m1', 'assistant', [{ type: 'thinking', text: 'pondering' }])]} />,
    );
    fireEvent.click(container.querySelector('.part-collapsible__toggle')!);
    const body = container.querySelector('.part-collapsible__body');
    expect(body).not.toBeNull();
    expect(body!.textContent).toContain('pondering');
  });
});

describe('answer gutter (E2)', () => {
  it('assistant text carries the prototype\'s mono bullet, not a full-height bar', () => {
    const { container } = render(
      <Transcript messages={[msg('m1', 'assistant', [{ type: 'text', text: 'the answer' }])]} />,
    );
    const dot = container.querySelector('.part-textdot');
    expect(dot).not.toBeNull();
    expect(dot!.textContent).toBe('●');
    expect(container.querySelector('.part-gutterbar')).toBeNull();
  });

  it('carries the same marker class on the user bubble (CSS hides it there)', () => {
    // The actual display:none is a CSS assertion, verified by the side-by-side
    // composite — this pins that the SELECTOR the stylesheet hides
    // (`.part-textdot` under `[data-role="user"]`) still exists in the DOM.
    const { container } = render(
      <Transcript messages={[msg('m1', 'user', [{ type: 'text', text: 'hi' }])]} />,
    );
    const message = container.querySelector('[data-role="user"]');
    expect(message!.querySelector('.part-textdot')).not.toBeNull();
  });
});

describe('tool call (E3/E4/E6 — merged, collapsible row)', () => {
  const CALL = {
    type: 'tool_call',
    tool_name: 'earthscope_station_catalog',
    call_id: 'c1',
    input: { center_lat: 34.05, radius_km: 100 },
  };

  it('marks the row with the wrench, never the settings gear', () => {
    const { container } = render(<Transcript messages={[msg('m1', 'assistant', [CALL])]} />);
    const card = container.querySelector('.kit-partcard[data-kind="tool"]');
    expect(card).not.toBeNull();
    expect(card?.querySelector('[data-icon="wrench"]')).not.toBeNull();
    expect(card?.querySelector('[data-icon="tool"]')).toBeNull();
  });

  it('is closed by default and opens to prose params, not a dt/dd table', () => {
    const { container } = render(<Transcript messages={[msg('m1', 'assistant', [CALL])]} />);
    // Closed: the well (and its params) are not in the DOM at all.
    expect(container.querySelector('.part-toolrow__well')).toBeNull();

    fireEvent.click(container.querySelector('.part-toolrow__head')!);

    expect(container.querySelector('.part-toolrow dl')).toBeNull();
    const args = container.querySelector('.part-toolrow__grid');
    expect(args).not.toBeNull();
    expect(args!.textContent).toContain('34.05');
  });
});
