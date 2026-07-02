# Release v0.3.1 plan — lab-ready, no lying

**Goal:** v0.3.1 of clio-agent + v0.2.1 of gact-tui shipped to the inner research group tomorrow with **every advertised capability actually working end-to-end**, every screenshot driven against the live CLIO (no emulator stubs), every claim in the README/CHANGELOG matched by an executable proof.

**Ruling principle:** if a capability is flagged `true` in `/v1/capabilities`, the lab user must be able to invoke it and see the documented behaviour. **No silent downgrades.** If something doesn't work, it's a release blocker until it works — the release slips before the truth does.

**Out-of-scope (already documented as `false`):** LSP, voice. Everything else stays `true` and must be verified.

---

## Phase 0 — Triage + setup (15 min)

- [ ] Confirm the primary CLIO provider is healthy: run a trivial chat completion through the configured provider and verify a 200 response plus non-zero usage when the provider reports usage.
- [ ] Confirm the backup provider still works. Backup provider covers any LM-bound verification if the primary provider is unavailable.
- [ ] Re-create `/tmp/clio-demo/{example.py, clio_demo.h5, clio_demo.parquet, scratch.txt}`.
- [ ] Pull latest `tui-integration` (clio-agent) + `clio` (gact-tui), wipe `.venv` if dependency churn, `uv pip install -e '.[api]'`, `go build -o /tmp/gact .`.
- [ ] Restart `clio-agent-gact --port 17800` from HEAD with no stale state.

**Exit:** primary and backup providers both responsive, demo files in place, fresh server up.

---

## Phase 1 — Behavioural verification of every "true" capability (no skipping)

For each row, drive a real turn through the TUI or a curl script, capture the output, and confirm the documented behaviour. Build `docs/CAPABILITIES_MATRIX.md` as we go — one row per capability, columns: `flag | wire-shape | behaviour | screenshot | proof command`.

**Rule:** each capability ends with one of two states:
- ✅ **verified** — screenshot captured, behaviour confirmed.
- 🔴 **blocker** — opens an issue, halts release, must be fixed before tagging.

There is no third state.

### Already verified end-to-end (re-confirm with one fresh turn each, ~15 min)
- chat path · data expert · analysis expert · visualization expert
- routing_decision Part lands
- cost meter live in TUI footer
- ARC cache rate increments
- workspaces (default + create + scope filter)
- sessions (create / fork / search / export / cancel / branching)
- /doctor health + capabilities tabs
- LM swap mid-session (haiku ↔ sonnet ↔ openrouter)
- OpenAI/ChatGPT preset visible in modal
- provider listing
- slash commands
- subagent spawn (#9 — fixed yesterday)
- mid-conversation provider swap between the primary and backup providers

### Never observed end-to-end — must verify or fix (90 min)

#### 1.1 `plan_mode` blocks destructive tools
- **Driver:** PATCH session `mode=plan` → ask "delete /tmp/clio-demo/scratch.txt".
- **Pass:** agent refuses OR gate halts; file still on disk after the turn.
- **If broken:** wire `MCPToolBridge.call_tool` to read `app.state.sessions.get(sid).mode` and short-circuit destructive tools when mode=plan. Estimate: 1-2 hr if not wired today.
- **Screenshot:** `clio_plan_mode.png` showing the refusal + `ls -la /tmp/clio-demo/scratch.txt` confirming file present.

#### 1.2 `edit_modes` (diff vs whole vs patch) actually changes the rendered output
- **Driver:** PATCH `edit_mode=diff`, ask for an edit; PATCH `edit_mode=whole`, same edit; PATCH `edit_mode=patch`, same.
- **Pass:** the resulting `file_diff` Part has the corresponding shape (`unified_diff` set for diff, `new_content` set for whole, etc.).
- **If broken:** thread `session.edit_mode` through `_direct_edit_answer` and have it choose which fields to populate. Estimate: 1 hr.
- **Screenshot:** `clio_edit_modes_3up.png` — three side-by-side renderings of the same edit.

#### 1.3 `hooks` fire on real turns
- **Driver:** drop `~/.config/clio-agent/hooks/pre_tool.py` containing a print + a marker side effect (touch /tmp/hook-fired). Drive a tool turn.
- **Pass:** server log shows the hook fired AND `/tmp/hook-fired` exists.
- **If broken:** trace `install_global_registry()`. Confirm it's invoked at boot in `_lifespan`. Confirm `fire("pre_tool", …)` is called in `MCPToolBridge.call_tool`. Estimate: 1-2 hr if needs wiring.
- **Screenshot:** server log tee'd next to TUI showing the marker file appeared.

#### 1.4 `scheduled_sessions` actually trigger turns
- **Driver:** POST `/v1/sessions/{sid}/schedules` with `cron="*/1 * * * *"` + question "say PING-{minute}". Wait ≤90s.
- **Pass:** new assistant message appears within 2 minutes; `fire_count` increments.
- **If broken:** `_scheduler_tick` task may not be started in lifespan; cron parsing may not handle `*/1`; the firing path may not hit the same `_run_turn_in_background`. Estimate: 1-2 hr if scheduler is wired but doesn't actually fire.
- **Screenshot:** TUI sidebar with the parent session showing 2 turns spaced ~1 minute apart, second one auto-fired.

#### 1.5 `session_sharing` serves the shared session
- **Driver:** POST share → `curl /v1/shared/{token}`.
- **Pass:** JSON response includes session metadata + messages.
- **If broken:** likely just shape. Estimate: 30 min.
- **Screenshot:** terminal split — left side TUI showing the source session, right side curl output of the shared view.

#### 1.6 `skills_extraction` produces a routable agent
- **Driver:** seed 2 sessions with tools_called metadata; POST `/v1/agents/extract`; verify `extracted_one` appears in `/v1/agents`; drive a turn that should route to it.
- **Pass:** agent appears in catalog AND a turn routes to it (heuristic or LM router).
- **If routing doesn't pick the user agent:** real bug — heuristic + RouterSignature only know about built-in experts. Either extend the routing path to consult the agent registry, or add a way for the user to explicitly target the agent. Estimate: 2-3 hr (touches RouterSignature + heuristic).
- **Screenshot:** `clio_extracted_agent.png` showing the user agent in the catalog AND a turn routed to it (routing_decision Part `selected_agent: extracted_one`).

#### 1.7 `agent_write` lifecycle works
- **Driver:** POST custom agent, PUT update, DELETE.
- **Pass:** GET `/v1/agents` reflects each step.
- **Screenshot:** `clio_custom_agent.png` showing the catalog before + after each operation.

#### 1.8 `mcp` server listing is real
- **Driver:** `curl /v1/mcp/servers`.
- **Pass:** lists the actual MCP servers CLIO has mounted (hdf5, parquet, fs, …) with status.
- **Screenshot:** TUI `/mcp` slash command showing the same servers.

**Exit:** every "true" capability has a row in `CAPABILITIES_MATRIX.md` with ✅. Any 🔴 is filed as a GitHub issue and we go fix it before continuing to Phase 2.

---

## Phase 2 — Fix the 5 xfailed integration tests (no skipping)

These xfails are honest TODOs from yesterday. Each is a real promise the contract makes. We fix them all; we don't ship with broken promises labelled `true`.

### 2.1 #2 `tool.call.started` / `tool.call.completed` SSE events
- **Spec promise:** clients see per-tool execution start + end as SSE events, before `message.completed`.
- **Today:** TUI sees tools only at `message.completed.metadata.tools_called`.
- **Fix:** `MCPToolBridge.call_tool` calls `tool_observer(name, args, …)` before + after the underlying call. `_make_tool_observer(app)` publishes the SSE events. Need to verify `set_global_tool_observer(observer)` is invoked at boot. If not, wire it.
- **Verify:** tee SSE during a tool turn — `tool.call.started` arrives, then `tool.call.completed`, then `message.completed`. Drop `xfail` marker; test passes strict.
- **Estimate:** 1 hr if wiring; 2 hr if needs deeper integration into MCPToolBridge.
- **No release without this — issue stays open if not done.**

### 2.2 #5 context_files actually influence the answer
- **Spec promise:** files attached as `mode=read` are visible to the agent during the turn.
- **Today:** `_enrich_with_context_files` prepends file contents to the prompt — but the test asserts the answer references column names from the file, and that's xfail today.
- **Fix:** verify the enrichment is actually happening (print the enriched prompt). If yes but Claude still ignores, the prompt format may be wrong (no clear "here's a file" delimiter). Tighten enrichment to use a structured "<context_file path=… mode=…>…</context_file>" envelope and add an explicit instruction.
- **Verify:** attach `clio_demo.parquet` as `mode=read`, ask "what's the schema of the attached file? one sentence", confirm the answer mentions `temperature`, `pressure`, or `sample_id`.
- **Estimate:** 30-60 min.

### 2.3 #6 token streaming is real-time, not post-hoc chunked
- **Spec promise:** `message.part.delta` events arrive as the LM produces tokens, not all at once after `forward()` completes.
- **Today:** xfail — deltas all fire after forward returns. StreamListener changes yesterday may have helped; never re-verified.
- **Fix:** confirm `_try_streamed_forward` in `app.py` pumps StreamResponse events as litellm chunks arrive (it should, with `async for piece in streamed(…)`). If not, debug the asyncio bridge.
- **Verify:** post a long prompt, tee SSE, assert `first_delta_t < 5s` AND `completed_t > first_delta_t + 1s`. Drop `xfail`.
- **Estimate:** 30 min if already works (likely), 1-2 hr if streamify isn't actually streaming.

### 2.4 #7 permission gate halts destructive tools
- **Spec promise:** destructive tools (matching the `_DESTRUCTIVE_TOOL_SUBSTRINGS` table) wait for user approval before executing.
- **Today:** xfail — gate registers a permission row + publishes `permission.requested` SSE, but doesn't actually block execution.
- **Fix:** `_make_permission_gate(app)` returns a callable that creates a `threading.Event` keyed by permission_id, blocks on `event.wait(timeout)`. POST `/v1/permissions/{pid}` resolves the row + sets the event. The MCPToolBridge call_tool path must `if gate(name, args) == "deny": raise PermissionError(...)`.
- **Verify:** prompt "delete /tmp/clio-demo/scratch.txt right now", assert (a) `permission.requested` SSE arrives; (b) file unchanged after 5s; (c) POST `/v1/permissions/{pid}` decision=deny → file STILL unchanged; (d) prompt again with decision=allow → file IS deleted.
- **Estimate:** 2-3 hr — this is the deepest of the four. Plumbed but not actually blocking.

### 2.5 #9 nanoagents (closed yesterday — re-confirm xfail removed in test file)

**Exit:** `tests/test_integration_v0_2/test_real_capabilities.py` has zero `@pytest.mark.xfail` decorators. Full suite passes 16/16 strict (no `xfailed`).

---

## Phase 3 — Diff path end-to-end (60 min)

- [ ] Drive `propose an edit to /tmp/clio-demo/example.py — replace string concatenation with an f-string` against a healthy LM. Retry against the backup provider if the primary provider is unavailable.
- [ ] Confirm assistant message has a `file_diff` Part with `unified_diff` populated AND `new_content` populated.
- [ ] POST `/v1/sessions/{sid}/diffs/apply` with the path → confirm `/tmp/clio-demo/example.py` actually changed on disk to the f-string version.
- [ ] POST `/v1/sessions/{sid}/diffs/reject` (on a fresh diff) → confirm file unchanged.
- [ ] Capture `clio_diff.png` — TUI showing the diff inline (red `-` / green `+` lines).
- [ ] Capture `clio_diff_applied.png` — TUI confirming the apply succeeded; `cat /tmp/clio-demo/example.py` next to it shows the new content.

**No fallback:** if neither configured provider can produce a clean turn, that's a Phase 0 environmental issue and Phase 3 waits.

---

## Phase 4 — Visual sweep (90 min)

Goal: every advertised capability has at least one screenshot under `screenshots/` showing it working live in the TUI. No emulator stubs anywhere.

- [ ] Audit `screenshots/clio_*.png` against `/v1/capabilities`. List every cap that lacks a corresponding image.
- [ ] Capture or refresh:
  - `clio_plan_mode.png` (Phase 1.1)
  - `clio_edit_modes_3up.png` (Phase 1.2)
  - `clio_hooks.png` (Phase 1.3)
  - `clio_scheduled.png` (Phase 1.4)
  - `clio_share.png` (Phase 1.5)
  - `clio_extracted_agent.png` (Phase 1.6)
  - `clio_custom_agent.png` (Phase 1.7)
  - `clio_mcp_servers.png` (Phase 1.8)
  - `clio_diff.png` + `clio_diff_applied.png` (Phase 3)
  - `clio_tool_telemetry.png` — gutter showing per-tool live status (Phase 2.1)
  - `clio_context_file_used.png` — answer that references column names from the attached file (Phase 2.2)
  - `clio_streaming_live.png` — mid-stream capture during a long answer (Phase 2.3)
  - `clio_permission_block.png` — permission banner BEFORE the destructive tool runs (Phase 2.4)
- [ ] Re-record any pre-Phase-1 screenshot whose state changed (cost meter values, cache rate, etc.)
- [ ] Build `docs/SCREENSHOTS.md` index — one section per capability with image + driver tape filename + 1-line description.

**Exit:** `docs/SCREENSHOTS.md` lists every advertised capability with at least one image. No empty sections.

---

## Phase 5 — Documentation pass (45 min)

- [ ] `docs/CAPABILITIES_MATRIX.md` — finalise. Every cap = ✅ row. Header explaining the rule "if it's true here, it works".
- [ ] `docs/SETUP.md` — add a "Smoke-test your install" section with 3 curl commands the lab user can run after install. Add "Try one of these" with one prompt per cap (data expert / analysis expert / visualization expert / edit / schedule / hooks / share / extract).
- [ ] `CHANGELOG.md` — add `[0.3.1] — 2026-04-26` block listing every Phase 1/2/3 fix. Be specific: which #issue closed, which behaviour now works that didn't before.
- [ ] `README.md` — update the headline numbers (28/30 supported, all verified end-to-end). Drop any "wire-shape only" weasel-language if it exists.
- [ ] `STATUS.md` (in `/home/jcernuda/tui`) — replace the "Pivot" header with "v0.3.1 lab-ready, shipped 2026-04-26" + bullet list of what's verified.

**Exit:** docs match reality. Any sentence in a doc has a corresponding observable behaviour.

---

## Phase 6 — Lab-user clean-install rehearsal (60 min)

Pretend to be a lab user on a fresh box.

- [ ] `rm -rf /tmp/clio-smoke && mkdir /tmp/clio-smoke`
- [ ] `git clone --depth 1 --branch v0.3.1 https://github.com/iowarp/clio-agent /tmp/clio-smoke/clio-agent` (after Phase 7 we'll have the tag — for the rehearsal use the head of `tui-integration`)
- [ ] `git clone --depth 1 --branch v0.2.1 https://github.com/JaimeCernuda/gact-tui /tmp/clio-smoke/gact-tui`
- [ ] `cd clio-agent && uv pip install -e '.[api]'` — time it, document any flaky deps
- [ ] `cd gact-tui/tui && go build -o gact .` — time it
- [ ] Boot `clio-agent-gact --port 17999`
- [ ] Connect TUI: `GACT_BACKEND=http://127.0.0.1:17999 ./gact`
- [ ] Configure each provider in turn via the modal AND drive at least one turn through each:
  - **OpenAI direct** (using the lab's `OPENAI_API_KEY` if available; document with-key path even if untested without one)
  - **LM Studio/local OpenAI-compatible** (when available)
  - **OpenRouter or another backup provider**
- [ ] Run the smoke-test commands from `docs/SETUP.md` — confirm each one returns the documented response
- [ ] `docs/LAB_USER_NOTES.md` — write down every rough edge encountered (slow install step, confusing UI moment, etc.)

**Exit:** clean install boots cleanly with all 3 providers, smoke commands pass, rough-edges file written. Any rough edge worse than "this command takes a while" gets fixed before tagging.

---

## Phase 7 — Cut the release (20 min)

- [ ] Bump versions:
  - `clio-agent/pyproject.toml`: 0.3.0 → 0.3.1
  - `gact-tui/tui/main.go`: `binaryVersion = "0.2.1"` (`contractVersion` stays `"0.2"`)
- [ ] Commit version bumps + `CHANGELOG.md` updates + `CAPABILITIES_MATRIX.md` + `SCREENSHOTS.md` + `LAB_USER_NOTES.md`
- [ ] Push branches
- [ ] Tag `v0.3.1` (clio-agent) + `v0.2.1` (gact-tui), push tags
- [ ] Create GitHub Releases for each tag, paste the CHANGELOG section as release notes, attach 3 hero screenshots: `clio_doctor_caps_final.png`, `clio_lm_e2e.png`, `clio_metrics.png`
- [ ] Write `docs/LAB_ANNOUNCEMENT.md` — copy-paste-ready text for the lab Slack/email:
  - what to clone (with v0.3.1 / v0.2.1 tags)
  - install commands
  - which provider to pick (OpenAI default since most use Codex CLI)
  - 5-line smoke test
  - where to file bugs

---

## Time budget

| Phase | Time | Notes |
|-------|------|-------|
| 0 Triage | 15 min | |
| 1 Behavioural verification (8 caps) | 90 min if all work | If any fails: + fix time per row |
| 2 xfail closure (4 fixes) | 4-7 hr | The honest ceiling — #7 permission gate is the wildcard |
| 3 Diff end-to-end | 60 min | Depends on LM availability |
| 4 Visual sweep | 90 min | Parallelizable |
| 5 Docs | 45 min | |
| 6 Lab smoke | 60 min | |
| 7 Release ceremony | 20 min | |
| **Realistic total** | **8-12 hours** | Tight for "tomorrow" if Phase 2 hits the 7-hr ceiling |

**If we hit 12 hours and aren't done:** the release slips to the next day. We do not ship a `true` capability that isn't verified.

---

## What "ready" means in one sentence

**A lab user can clone the v0.3.1 / v0.2.1 tags, install in <5 minutes, point the TUI at their preferred LM provider, and drive any of the 28 advertised capabilities — and every one of them does what the docs say it does.**

If that's not true, we're not shipping yet.
