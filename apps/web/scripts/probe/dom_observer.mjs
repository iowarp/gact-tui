/**
 * The DOM MutationObserver installer live-probe.mjs's `installDomObserver`
 * injects into the page — extracted into its own module (Opus adversarial
 * review, live-harness regression on f9b955b9) so the exact logic that runs
 * live can ALSO run under `apps/web/tests/unit/*.test.ts` against jsdom,
 * which implements a real `MutationObserver`. `installDomObserverScript` is
 * a fully self-contained function (no closures over anything outside
 * itself, no imports) — that is a HARD REQUIREMENT, not a style choice:
 * Playwright's `page.evaluate(fn)` serializes `fn.toString()` and evaluates
 * it inside the browser page, so any free variable referencing this
 * module's own scope would be `undefined` there. The same constraint is
 * exactly what makes it safe to call directly against jsdom in a unit test.
 *
 * See verdict.mjs's file-header doc comment for the dom-timeline.jsonl
 * record contract. Selectors are read off the REAL markup
 * (apps/web/src/kit/PartCard.tsx: `.kit-partcard[data-kind]`;
 * apps/web/src/transcript/parts/ToolPart.tsx: `[data-testid="part-tool"]` /
 * `[data-testid="tool-wait-activity"]` + `.part-toolrow__pending`
 * ("running…") + `data-call-id` on BOTH testids, gact-tui#364 client-half
 * fix; apps/web/src/transcript/registry.tsx: `.part-collapsible` +
 * `.part-thinkinghead` for thinking) — never guessed.
 *
 * PROVEN REGRESSION (f9b955b9, caught by the live harness): `matchDomRowsToCalls`
 * (verdict.mjs, a SEPARATE and correct W1 fix) started preferring an exact
 * `data-call-id` join over its original text/positional heuristic. For a
 * `wait_agent_tasks`/`check_agent_tasks` call, ToolPart.tsx renders the
 * PENDING state as `<p data-testid="tool-wait-activity" data-call-id="…">`
 * nested INSIDE `<div class="kit-partcard" data-kind="tool">…</div>`
 * (PartCard.tsx's frame). `SELECTOR` below only matches the OUTER
 * `.kit-partcard[data-kind]` div (the inner `<p>`'s testid doesn't start
 * with `"part-"`, so it's never pushed as its own entry) — meaning the node
 * `push()` receives for this shape is the OUTER div, and `data-call-id`
 * lives one level BELOW it, on a DESCENDANT. The original callId lookup
 * checked only self-or-closest-ANCESTOR (`el.matches(...) || el.closest(...)`)
 * — `closest()` never walks descendants, so it found nothing for this shape.
 * Only the SETTLED state (`<div data-testid="part-tool" data-call-id="…">`,
 * where the testid and the call id sit on the SAME element pushed directly)
 * had its callId captured. `matchDomRowsToCalls` then had only ONE candidate
 * row carrying that call's id — the LATE settled one — for its exact-id-join
 * to find, so it reported `t_dom` at the settled row's timestamp instead of
 * the pending row's, producing a false `render-late` verdict even though the
 * pending row rendered live within 13-38ms of the SSE frame (confirmed
 * directly in a captured run: the DOM mutation for the pending row is right
 * there in dom-timeline.jsonl, just uncredited with a callId). The
 * underlying SessionView/ToolPart render path was never broken — this was a
 * probe-instrumentation gap. Fixed by adding a DESCENDANT fallback
 * (`el.querySelector('[data-call-id]')`) alongside the self/ancestor lookup.
 */
export function installDomObserverScript() {
  window.__probeDom = [];
  const SELECTOR = '.kit-partcard[data-kind], [data-testid^="part-"]';
  const push = (op, el) => {
    const kindEl = el.matches?.('.kit-partcard[data-kind]') ? el : el.closest?.('.kit-partcard[data-kind]');
    const testidEl = el.matches?.('[data-testid^="part-"]') ? el : el.closest?.('[data-testid^="part-"]');
    // Decoupled from testidEl (see this module's doc comment above) — reads
    // data-call-id off self, then the nearest ANCESTOR, then falls back to a
    // DESCENDANT search. The descendant fallback is not optional: for the
    // tool-wait-activity shape, the node `push()` actually receives is the
    // OUTER `.kit-partcard[data-kind="tool"]` wrapper (that's what matches
    // SELECTOR and gets pushed — the inner `<p data-testid="tool-wait-
    // activity" data-call-id="…">` does NOT match SELECTOR on its own, so it
    // is never pushed as its own entry). `closest()` only walks ANCESTORS,
    // never descendants, so a self-or-closest-only lookup finds nothing —
    // the id is one level BELOW the pushed element, not above or on it.
    const callIdEl = el.matches?.('[data-call-id]')
      ? el
      : (el.closest?.('[data-call-id]') ?? el.querySelector?.('[data-call-id]'));
    window.__probeDom.push({
      t: new Date().toISOString(),
      op,
      testid: testidEl?.getAttribute('data-testid') ?? undefined,
      kind: kindEl?.getAttribute('data-kind') ?? undefined,
      pending: !!el.querySelector?.('.part-toolrow__pending'),
      textHead: (el.textContent ?? '').trim().slice(0, 120),
      callId: callIdEl?.getAttribute('data-call-id') ?? undefined,
    });
  };
  // React frequently batches a WHOLE message's parts into ONE childList
  // mutation (the added node is `<article class="transcript__message">`,
  // not a partcard itself) — an ancestor-only `closest()` check on the
  // added node misses every nested part in that case (found live: a d2
  // run showed 3 distinct thinking parts server-side + client-side but
  // only 2 `add` mutations recorded before this fix). Record the added
  // node itself when it matches, AND walk its subtree for every nested
  // partcard/testid element so a batched insert is never under-counted.
  const handleAdded = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches?.(SELECTOR)) push('add', node);
    const nested = node.querySelectorAll?.(SELECTOR) ?? [];
    for (const el of nested) push('add', el);
  };
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const node of m.addedNodes) handleAdded(node);
      } else if (m.type === 'attributes' && m.target.nodeType === 1) {
        push('attr', m.target);
      } else if (m.type === 'characterData' && m.target.parentElement) {
        push('text', m.target.parentElement);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-kind', 'data-testid', 'data-error', 'data-call-id'],
    characterData: true,
  });
  window.__probeDomObserver = observer;
}
