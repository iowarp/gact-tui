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
