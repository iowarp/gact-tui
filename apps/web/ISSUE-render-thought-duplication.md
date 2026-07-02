# ISSUE (web/display): a single thought renders TWICE (duplicated), one copy mangled

**Area:** `apps/web` transcript render (client). NOT clio — the backend is clean (proven below).
**Severity:** high (demo-visible: the same thought appears twice, one copy broken).
**Status:** root symptom log-proven; exact client render path still to be pinned.

## Symptom
In the transcript, one agent thought (`next_thought`) is painted **twice**, back to back:
one copy **garbled** (see the sibling issue `ISSUE-render-inline-code-drop.md`), one copy
**clean**. To a viewer it looks like the agent "said the same thing twice", once broken.

Observed live by the user in the web UI; the two paragraphs both begin
*"I have received a clear request to profile the staged MTA1 GNSS time-series CSV…"*.

## Grounded evidence (from the audit logs — this part is NOT a hypothesis)
- Run: session **`sess_4803a5fb6926`** (title `TAIL2`), workspace `ws_ndp_demo`, agent
  **`gnss_timeseries_analysis`**, first turn.
- Audit: `scratchpad/capture-final/audit.jsonl` (CLIO_STREAM_AUDIT_LOG).
- The backend emitted this `next_thought` **exactly once**:
  - part **`part_ca652f28c948`**, **11 emit deltas**, contiguous (audit lines 36708–36771 =
    a single streaming pass), assembled **767 chars**, opener appears **1×**.
  - It is the **only** part whose text carries that opener (`parts carrying opener: {part_ca652f28c948: 1}`).
  - `bridge.contract_field` (cut) == `sse.normalized_emit` (emit): identical text.
- **Conclusion (proven): the backend produced this thought ONCE. The second copy on screen
  is created by the client render, not by a second backend emission.**

## Hypothesis for the client mechanism (NOT yet proven — needs DOM capture)
The live **streaming** render of the part is not being **superseded** by the **settled**
render, so both remain in the DOM. The garbled copy = live-stream render; the clean copy =
settled re-parse. This matches prior work in this area (tasks P1.3 "●● dedup in live path",
U2/U3 streaming-vs-settled, B4/B5/B6 dedup) — likely a regression or an uncovered case.

## To reproduce / to confirm (the work still owed)
1. Deploy stack (`.claude/skills/clio-web-deploy.md`), enable `CLIO_STREAM_AUDIT_LOG`.
2. Run an earthscope profile turn in `ws_ndp_demo` (`.claude/skills/live-web-session.md`),
   reach a sub-agent `next_thought` (e.g. `gnss_timeseries_analysis`).
3. In the transcript DOM, count render nodes for that one part_id's text — confirm **2**
   nodes exist and identify which component emits each (live vs settled). That pins the fix
   location. (This DOM confirmation was not completed; thinking blocks are collapsed by
   default — expand the agent's thinking, or query the live-stream container specifically.)
4. Gather **multiple** cases across agents/turns to confirm it's general, not one-off.

## Likely fix location
`apps/web/src/components/TranscriptMessageView.tsx` / the live-vs-settled switch
(`buildAssistantTurnModel`, streaming flag) and the per-part dedup — ensure a settled part
**replaces** its streaming copy keyed by `part_id`, never renders both.

## Definition of done
A settled part with a given `part_id` is rendered once; no live copy survives after settle;
regression test with two render passes (streaming then settled) asserts a single node.
