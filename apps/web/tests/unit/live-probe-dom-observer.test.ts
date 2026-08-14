/**
 * Failing-first repro for the live-harness regression caught on f9b955b9:
 * `apps/web/scripts/live-probe.mjs`'s DOM MutationObserver's `data-call-id`
 * capture missed the `wait_agent_tasks`/`check_agent_tasks` PENDING-state
 * shape entirely. `verdict.mjs`'s `matchDomRowsToCalls` exact-id-join
 * preference (a SEPARATE, correct W1 fix) then had only the LATE settled
 * row as a candidate for that call's id, reporting `t_dom` at settle time
 * and producing a false `render-late` verdict for a call whose pending row
 * actually rendered live within 13-38ms of its SSE frame — confirmed
 * directly in a captured d1 run (dom-timeline.jsonl shows the pending row's
 * DOM mutation right there, just uncredited with a callId). The underlying
 * SessionView/ToolPart render path was never broken; this is a
 * probe-instrumentation gap in how the id gets READ off the DOM, not in
 * what gets rendered.
 *
 * Root cause: `ToolPart.tsx`'s pending row
 * (`<p data-testid="tool-wait-activity" data-call-id="…">`) is nested INSIDE
 * `PartCard.tsx`'s `<div class="kit-partcard" data-kind="tool">` frame. The
 * observer's own SELECTOR only matches the OUTER partcard div for this shape
 * (the inner `<p>`'s testid doesn't start with `"part-"`, so it's never
 * pushed as its own entry) — meaning `data-call-id` sits one level BELOW the
 * pushed element, on a DESCENDANT. The original lookup checked only
 * self-or-closest-ANCESTOR; `closest()` never walks descendants, so it found
 * nothing. The fixtures below reproduce the REAL nested markup (verified
 * against PartCard.tsx + ToolPart.tsx), not a simplified flat element —
 * a flat fixture would pass even against the broken self/ancestor-only
 * lookup, since it never exercises the nesting that caused the regression.
 *
 * `installDomObserverScript` is the SAME self-contained function the live
 * driver passes to Playwright's `page.evaluate` (see dom_observer.mjs's own
 * doc comment) — exercised here directly against jsdom, which implements a
 * real MutationObserver.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomObserverScript } from '../../scripts/probe/dom_observer.mjs';

interface ProbeDomRow {
  op: string;
  testid?: string;
  kind?: string;
  callId?: string;
  textHead: string;
}

declare global {
  interface Window {
    __probeDom?: ProbeDomRow[];
    __probeDomObserver?: MutationObserver;
  }
}

async function flushMutations(): Promise<void> {
  // MutationObserver callbacks fire as a microtask — give the queue a turn.
  await Promise.resolve();
  await Promise.resolve();
}

/** Mirrors PartCard.tsx's exact frame: `.kit-partcard[data-kind]` wrapping a
 *  `.kit-partcard__gutter` + `.kit-partcard__body`, matching how
 *  `<PartCard kind="tool">` wraps ToolPart.tsx's output in Transcript.tsx. */
function partCard(kind: string, body: HTMLElement): HTMLElement {
  const card = document.createElement('div');
  card.className = 'kit-partcard';
  card.setAttribute('data-kind', kind);
  const gutter = document.createElement('div');
  gutter.className = 'kit-partcard__gutter';
  gutter.setAttribute('aria-hidden', 'true');
  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'kit-partcard__body';
  bodyWrap.appendChild(body);
  card.append(gutter, bodyWrap);
  return card;
}

/** Mirrors ToolPart.tsx's pending (wait-family, no result yet) row exactly:
 *  `<p class="transcript__activity" data-testid="tool-wait-activity"
 *  data-call-id="…">`. */
function waitActivityRow(callId: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'transcript__activity';
  p.setAttribute('data-testid', 'tool-wait-activity');
  p.setAttribute('data-call-id', callId);
  p.textContent = '✻ waiting for 2 background agents…';
  return p;
}

/** Mirrors ToolPart.tsx's settled row exactly:
 *  `<div class="part-toolrow" data-testid="part-tool" data-call-id="…">`. */
function settledToolRow(callId: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'part-toolrow';
  div.setAttribute('data-testid', 'part-tool');
  div.setAttribute('data-call-id', callId);
  div.textContent = 'wait(worker #1, worker #2)3.0s✓▸';
  return div;
}

afterEach(() => {
  window.__probeDomObserver?.disconnect();
  delete window.__probeDomObserver;
  delete window.__probeDom;
  document.body.innerHTML = '';
});

describe('installDomObserverScript — data-call-id capture (gact-tui#364, f9b955b9 regression)', () => {
  beforeEach(() => {
    installDomObserverScript();
  });

  it('captures callId off the PENDING wait-activity row, nested inside its PartCard frame — the exact shape that regressed', async () => {
    document.body.appendChild(partCard('tool', waitActivityRow('call_pending_abc')));
    await flushMutations();

    const rows = window.__probeDom ?? [];
    // The pushed entry for this shape is the OUTER `.kit-partcard[data-kind
    // ="tool"]` wrapper — its own testid is undefined (the inner `<p
    // data-testid="tool-wait-activity">` doesn't match SELECTOR on its own,
    // so it's never pushed as a SEPARATE entry; verified against the real
    // captured evidence, which shows this same shape: kind:"tool", no
    // testid field at all). `callId` is what this fix adds.
    const row = rows.find((r) => r.kind === 'tool' && r.textHead.includes('waiting for'));
    expect(row).toBeDefined();
    expect(row?.testid).toBeUndefined();
    expect(row?.callId).toBe('call_pending_abc');
  });

  it('captures callId off the SETTLED part-tool row — unaffected by the fix, still correct', async () => {
    document.body.appendChild(partCard('tool', settledToolRow('call_settled_xyz')));
    await flushMutations();

    const rows = window.__probeDom ?? [];
    const row = rows.find((r) => r.testid === 'part-tool');
    expect(row).toBeDefined();
    expect(row?.callId).toBe('call_settled_xyz');
  });

  it('regression pin: the FIRST row carrying this call_id — the property matchDomRowsToCalls relies on — is the PENDING one, not the settled one', async () => {
    // The exact live sequence: the pending row appears first, then gets
    // replaced by the settled row once the result lands (ToolPart.tsx's
    // early-return design — never both mounted at once for the same call).
    const pendingCard = partCard('tool', waitActivityRow('call_live_seq'));
    document.body.appendChild(pendingCard);
    await flushMutations();

    document.body.removeChild(pendingCard);
    document.body.appendChild(partCard('tool', settledToolRow('call_live_seq')));
    await flushMutations();

    // matchDomRowsToCalls (verdict.mjs) scans domToolRowsChronological in
    // order and takes the FIRST unused row whose callId matches exactly —
    // this is exactly that scan. Before the fix, only settled-shape rows
    // ever carried a callId, so this would have found the LATE row instead
    // (t_dom collapsing onto t_result, the false render-late verdict).
    const rows = window.__probeDom ?? [];
    const firstMatch = rows.find((r) => r.callId === 'call_live_seq');
    expect(firstMatch).toBeDefined();
    expect(firstMatch?.textHead).toContain('waiting for');
  });
});
