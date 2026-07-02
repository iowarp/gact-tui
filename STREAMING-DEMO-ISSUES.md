# EarthScope streaming/render demo — COMPLETE issue ledger

Honest status. ✅ = fixed **and verified**. 🟡 = code written but **NOT verified live / incomplete**.
🔧 = open. ⚠️ = I did it wrong, needs rework.

## ✅ Fixed & verified
1. **`shell_bash` Windows timeout** (orig a/f, blocker) — `stdin=DEVNULL`; verified `timed_out:false`.
2. **WSL-bash path corruption** — `windows_backend: powershell`.
3. **SDK transport** — wire streams text+thinking token-by-token for ALL agents. Grounded in the
   stream-audit + wire logs (geospatial 26 text/78 trace deltas, main 14/100, ndp 50/443, …).
4. **"Working" badge** (orig b) — static, bot icon removed (unit test).
5. **Return content** (orig e) — real `dspy.extract` summary, not the placeholder.
6. **`model_aux` label** removed (unit test).
7. **Mid-word reload corruption** — parent-resume word-boundary guard; wire 0 mid-word fragments.
8. **`●●` answer doubling** (next_thought stored on BOTH a `text` part AND `tool_call.thought`) —
   client `dedupToolThought` drops the duplicate; **verified on all 3 real sessions (0 dups) +
   fixture tests**. Root cause grounded in clio's stream-audit: LLM emits once, tool_observer
   injects the copy.
9. **My gap-a.2 raw-reasoning fallback** (dumped raw `[[ ## ]]` reasoning onto the tool thought —
   the corruption-fixed garbage) — reverted in clio.
10. **B — thinking visual/layout** (muted, **full-width expand**, mid-block indent, no `·` dots,
    collapsed on the name line, empty source column dropped) — confirmed done by the user.

## ⚠️ Done WRONG — needs rework
10. **D — running-reload dedup, "persisted-authoritative".** I routed the LIVE view through the
    persisted path to stop the dup → it **killed live streaming** (persisted = settled blocks).
    Wrong trade. Correct architecture: **live = normalized path (streams `turn.*.delta`),
    persisted = reload only, SEED the normalized from `/messages` on join** (complete + no dup +
    streams). This is THE central rework and subsumes A1/A2-live and the parity requirement.

## 🟡 Code written, NOT verified live (and some incomplete)
11. **A2 — completion-aware filter** (don't content-filter in-flight rows so main/synthesis aren't
    dropped). Unit-tested, but its LIVE benefit is **blocked by #10** (live goes through persisted).
12. **A3 — defer markdown parse** (`StreamingMarkdown`: plain text while a row streams, parse on
    finalize). In code, but **not verified live**, and it only does plain-while-streaming.
14. **C1 — return one-liner** (nothing shown by default; `show details (N)`; no dots). In code +
    tests — but see #16, #17: the `thinking ▾` and the details body are still wrong.

## 🔧 Open
15. **A1 — thinking does NOT stream.** The reducer batches `turn.trace.delta` into a finished block.
    Make thinking its own streaming row (append per delta, live token count). Part of the #10 rework.
16. **Return's `thinking ▾` is missing.** The collapsed return shows `show details` but no thinking
    disclosure — the reasoning that led to the return isn't folded in.
17. **"show details" shows the JSON twice + unrendered.** It renders the summary AND the raw, and the
    ` ```json ` sits in a `<pre>` so the fence shows literally. Should show the JSON **once,
    rendered** as a code block.
18. **Live markdown rendering** (the item I dropped). While streaming we currently show PLAIN text and
    only format on finalize — so there's a plain→formatted flip. Option: `streaming-markdown`
    (thetarnav, 379★, 3KB) to format **progressively** as it streams. (A3's optional upgrade.)
19. **Second `[[ ## ]]` marker leak** — in a `thinking` part (e.g. ndp_dataset_discovery), a
    different code path than the tool thought. Strip markers there too.
20. **Live == reload parity** ("I don't want to reload and see things changing"). The hard
    requirement: the live render and the `/messages` reload must be byte-identical. Tied to #10.
21. **Two `thinking` blocks per finish step** (2143/2239) — *explained, not a bug*: the agent ran an
    extra ReAct "finish" step, so two genuinely-different SDK thinking blocks. Suppress only if wanted.

## 🔭 Verification & housekeeping (not done)
22. **Browser verification** — NONE of B/C/the `●●` fix verified in the actual running UI yet
    (builder/unit level only). You keep (rightly) asking for this.
23. **Deleted session** `sess_410611cbf506` (Profile CIMIS) — recover from clio's CTE log. Deferred.
24. **SplashInstall: 9 failing tests** — `useBackendRegistry() outside provider`, from the
    `registry.tsx`/`SplashScreen.tsx` working-tree edits (NOT mine — active WIP).

## Notes
- The whole streaming cluster (A1, A2-live, D, parity #20, live-markdown #18) collapses into ONE
  rework: **normalized-authoritative live streaming + seed-on-join.** Do that first.
- Demo flows: fresh-from-start live and completed-reload are the clean ones.
