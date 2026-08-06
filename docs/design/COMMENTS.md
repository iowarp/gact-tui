# Owner feedback log — P5 conformance (running)

## WAKE-UP BRIEF (2026-08-04 early morning — overnight run)

**All six UI slices are landed, committed, live-verified. LIVE GATE 29/29.**
299/299 unit, 15/15 e2e. Branch: feat/330-p4r-fresh-scaffold, nothing pushed.

Landed overnight (each contract-first, codex-developed, reviewed vs the
prototype with measurements + screenshots):
- E-static: `▸ thinking` headers, accent gutter bars, wrench icon, prose args.
- E-live: child-agent CARDS from the real captured wire (delegate.started =
  pulsing running card, delegate.completed = idle card, placement named,
  NO fabricated durations), waiting line, background exits — all verified on
  a real async session (p5-async-capture-5 in the rail; open it).
- Live gate green incl. the old 422 (scope wired).
- Your whole feedback batch: blueprint crumb + view window, console re-gated,
  connect card w/ Lockup + synthesized saved entry, caret/dot/alignment,
  Unpin, honest relay-unknown.

**Eight backend defects filed with evidence: #1177–#1184.** Two neutralized
by config for now: sandbox OFF (#1182), claude-code extra installed (the
bridge works — demo can run sonnet; codex works on its default model only).

**The backend on :17900 now runs claude_code (sonnet) — demo config.**
Sessions p5-demo-rehearsal / p5-async-capture-5 show the async UI live.

**Open, needs YOU:**
1. WHERE IS THE PROTOTYPE EXPORT? (:4399 died with the restart; bundled.html
   not found on D:/ or Downloads) — blocks menu icons/labels + search
   behavior extraction.
2. E9: raw tool_result JSON + `routed to` lines — fold into the Call-card
   grammar, or keep as styled lines?
3. E7 artifacts: every pipeline run (codex + sonnet, 3 turns) stalls before
   producing artifacts — the blueprint never reaches visualization. The
   artifact + lineage ROUTES are live and empty. Grounding E7 = an
   artifact-producing run = your demo-content prep (grind territory).
4. web.old deletion awaits your done-and-working call.



## 2026-08-04 (morning batch, owner awake)

- **MCP v2 skew (MASSIVE, demo blocker):** clio-agent client = mcp 2.0.0 /
  fastmcp 4.0.0b1 (2026-07-28 statelessification); clio-kit server envs =
  mcp 1.28.1 / fastmcp 3.4.x (the v2 line is prerelease-gated so clio-kit's
  `fastmcp>=3.0.1` floor never selects it). pandas_filter_data et al die with
  MCPError -32022 'connection is serving the 2026-07-28 protocol; the
  initialize handshake is not accepted'. Fix round dispatched in clio-kit.
- **Prompt idiom:** my capture prompts were wrong — use the owner's canonical
  NDP prompt style (explicit coords/radius, staged paths + dataset ids,
  workflow_state field instructions, honest blocked-state reporting).
- **Boxed Call semantics (extends E9/task 11):** tool routing/args/results are
  NOT being put in the box — everything under a Call folds INTO the Call box;
  and the design has replacement semantics for BOTH the right-side column and
  the center column (detail pane vs transcript) that we lack.
- **Rail lists child sessions as top-level rows** — the prototype shows only
  top-level sessions; children belong to the parent's hierarchy ribbon.
  Filter parent_session_id != null out of the rail groups.
- **Cleanup done:** all my temp sessions (25) + stress workspaces (9) +
  orphaned children (5) deleted from the live backend.
- Prototype vendored at design/prototype/Clio Session.html, served on :4399.
- Menus extracted verbatim (proto-menus.json): session ⋯ = pin/rename/delete
  (iconed, delete danger); workspace ⋯ = pin workspace / open in files /
  rename workspace / new session here / remove workspace.

Kept verbatim-ish as received; each item gets folded into a slice contract and
checked off with the commit that lands it. Newest first.

## 2026-08-04 (late-night review on :4191, live backend)

### Topbar identity semantics (owner correction — supersedes C1's workspace-path reading)
- The identity line is `session_name / used_blueprint\package\whatever` — the
  crumb after the title names the session's BLUEPRINT/PACK (the prototype's
  `earthscope-gnss-region` is a pack id, NOT a workspace path).
- Click session name → rename in place (already works).
- Click the used-blueprint crumb → a window allowing you to SEE and EDIT the
  blueprint, similar to the files view.
- Status: TODO (fix round after slice C review). Edit surface depends on a
  backend blueprint read/write route — verify, else file a clio-agent issue
  and ship view-only, visibly degraded.

### Console (owner correction — REVERSES my C2 contract)
- Called just `console`, NOT "Workspace console".
- Desktop-only: NOT offered in the web version. (My C2 un-gating read the
  prototype's plain-browser render as authority; the real semantic is
  desktop-gated. The C developer implemented my wrong contract — revert.)
- Status: TODO in the fix round; contract test to be rewritten.

### Connect screen (fallback card)
- The clio lockup there is wrong: no subtitle/tagline, too small, not
  centered. Reuse the shell Lockup component, centered.
- The previous-connections list with an ✕ to remove each is STILL not
  visible. The code path exists (saved list + forget) — diagnose why it does
  not render for the owner's browser (suspect: registry entries dropped on
  load, or the saved prop lost on the splash-fallback path).
- Status: TODO + diagnosis.

### Rail — row menu
- The Pin menu option on a PINNED session should read "Unpin" (toggle label
  follows state).
- The ⋯ menus (session rows AND workspace/group heads) carried ICONS on every
  item in the prototype — ours render text-only.
- The workspace ⋯ menu item is NOT named "New session here" — that label was
  my invention (specced as a minimal placeholder in the B brief). The real
  item set + icons must be extracted from the prototype's menus once the
  export is servable again — do not invent.
- Status: TODO (fix round; menu extraction blocked on the prototype export
  location).

### Rail (annotated screenshot, Screenshot 2026-08-04 011207.png)
- Group-head disclosure caret: "maybe smaller" (prototype's is 8px mono).
- Session row status dot: "bigger".
- "align?" — the disclosure / folder / dot column should align vertically.
- search / plus (New) / agents footer menu: "not done" — each must actually
  function. Search behavior: extract from the prototype (click it there)
  before building; do not invent.
- relay footer indicator shows offline even though ares should be reachable —
  wire it to a real reachability source, or render an honest `unknown` state
  and file the backend gap. Never a misleading dim-off.
- Status: TODO (fix round). Prototype export server (:4399) is down after the
  restart and the bundled.html location is unknown — ASK OWNER where the
  prototype export lives so behavior extraction can resume.

## 2026-08-03 (earlier, already recorded in p4-conformance-gaps.md addendum)

- B6 reactive chrome; B7 working pin; B8 dot/folder alignment; B9 spacing
  compression license; B10 show-more proof; B11 ONE unified StatusDot with
  pulse+glow (prototype's three inconsistent classes); B12 left-column
  typography; B13 body-never-scrolls (root-caused: sr-only spans anchored to
  <html>); D1b placement chip = short label + compact path; lockup wordmark
  justifies to the tagline width (alignRight=0 landed).
- Pill `async N` = ALL async work (agents, relay applications, everything).
- Demo goals: (a) NDP workflow with async agents; (b) intertwined artifact
  provenance graph, maybe clio-relay execution; stretch (c) skills/hooks,
  (d) P3 + P1 visual semantics.

## Pre-demo checklist (P5-9 closing gate — run top to bottom the morning of the demo)

1. **Clean slate, all three layers, the second before launch** (stale state is
   silent poison): delete the demo workspace's old sessions, empty its staging
   folder (`clio-runs/ndp`), AND either use a fresh workspace or clear the
   workspace's artifact registry records — byte-identical re-stages dedup
   against surviving records and the session then shows no mints.
2. **Serve**: healthy on :17900 (watchdog running, cwd-pinned), provider
   `claude_code` bound (`GET /v1/providers/lm` → configured true), latest
   wire code (restart if any clio-agent commit landed since the last boot).
3. **Session pre-flight** (never drive unverified): create the session, POST
   the blueprint activation, then GET the record and CONFIRM
   `metadata.active_agent_blueprint_id` — an unbound session runs the bare
   builtin main by design. Confirm the allow-all policy exists.
4. **Bundle**: `npm run build` on the demo tree, hard-reload the browser
   (the update badge means a stale page).
5. **Rehearsal content**: (a) the NDP pipeline run (sequential chain — the
   Call-box + streaming story); (b) a fan-out turn for the gantt story
   (a prompt comparing several regions makes main spawn children in
   parallel); (c) the artifact walk: chip → panel (identity header, preview)
   → PROVENANCE (lineage chain, record folds) → RECREATE.
6. **During the run**: the running Call box streams the child's text with the
   cursor + elapsed; waits collapse to one row with the ✻ activity line;
   thinking folds appear on parent and children; the child view shows the
   teal "returned to main" card wrapping the answer.
7. **If anything looks wrong**: do not reset mid-demo — the transcript is
   durable; a reload is safe (replay shells no longer clobber state).

### Round-9 additions (2026-08-06, after the fanout/instrumentation wave + kit 2.7.0)

8. **NDP warm-up call** (issue evidence: clio-kit#351, round-9 timeouts): before
   the demo, drive ONE real `ndp_search_datasets` through the live server (a
   throwaway session is fine). This (a) proves the NDP pilot host
   (155.101.6.191:8003, plain HTTP, no fallback) is healthy RIGHT NOW, and
   (b) lets spawn_diet learn/persist the fast launcher plan for ndp (it drops
   the plan on a failed first spawn — currently only geo is learned).
9. **No duplicate serve**: `Get-CimInstance Win32_Process | ? { $_.CommandLine
   -like '*clio-agent.exe*serve*' }` — expect ONE spawn chain (launcher →
   venv python → uv python). Port-collided strays raced the real serve twice
   today. Also check for orphaned `clio-kit.exe mcp-server` processes from
   prior stops (clio-agent#1197) — they hold the tool venv and eat RAM.
10. **Cold-catalog cost is paid**: envs for geo/ndp/pandas/plot were rebuilt
    for kit 2.7.0 on 2026-08-06 and the catalog is warm on the current serve.
    If the server restarts, first-turn catalog build is fast on warm envs —
    but after any kit reinstall expect the ~2.5 min synchronous stall
    (clio-agent#1198) ONCE; pay it with a throwaway turn before the audience.
11. **UI serve**: vite preview binds IPv6 — the browser URL is
    http://localhost:4173 (NOT 127.0.0.1). If it's down:
    `cd apps/web && pnpm exec vite preview --port 4173 --strictPort`.
12. **Spawn plans all learned** (2026-08-06 grounding run): ndp, pandas, plot,
    geo launcher plans are persisted in mcp_spawn_diet.json — first calls are
    fast now. Evidence of the unlearned path: pandas/plot each burned a 180s
    first attempt then a ~135s retry before learning. If clio-kit is ever
    REINSTALLED, rerun a full stage→filter→plot pipeline turn as the warm-up
    (not just ndp) so all four plans re-learn before the audience.
13. **Port hygiene**: exactly ONE UI server — vite preview on 4173 with
    `--host` (all stacks, so localhost AND 127.0.0.1 work). Stale previews
    from old sessions (4191 etc.) serve old bundles AND fail the backend's
    CORS allow-list — the browser shows "Failed to fetch" while the backend
    is healthy. Sweep before the demo:
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -match 'vite.*preview|http-server' }`
