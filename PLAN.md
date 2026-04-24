# PLAN — ordered task queue

Pick the **first unchecked item**. When done: check it, commit, push, move to the next. If blocked on a task, mark it `[BLOCKED: reason]`, append a follow-up task at the bottom, and pick the next unblocked item.

When picking, consider deps: emulator must exist before TUI can really test. Tasks marked `(parallel)` can be done before the prior one completes.

## Phase CLIO-BBBBBBBBBB — GACT v0.2 (CLIO-aligned) + native CLIO implementation

Integration target tracked by [iowarp/clio-agent#1](https://github.com/iowarp/clio-agent/issues/1) and [`docs/tui/`](https://github.com/iowarp/clio-agent/tree/develop/docs/tui) on the CLIO `tui-integration` branch.

**North-star**: CLIO is the gold standard of compatibility. The GACT contract evolves to match CLIO's semantics. We bump the spec to **v0.2** so it natively covers everything CLIO exposes (expert routing + selection, ARC memory surface, per-tool events, etc.). Anything v0.1 had that CLIO doesn't implement yet is flagged as a gap — the gap list becomes the upstream work queue for CLIO. Anything CLIO has that v0.1 lacks becomes a v0.2 addition.

**Architecture**: no Go adapter. The GACT v0.2 REST + SSE surface is a **Python module inside clio-agent** (`src/clio_agent/gact/` on `tui-integration`) that wraps `ClioAgent`. The TUI points `GACT_BACKEND` directly at the clio process. Backwards-compat: the TUI keeps working against v0.1 backends (claudecode, opencode, crush, goose) by gating v0.2-only features on a capabilities advertisement.

**Branches**:
- gact-tui: `clio` — GACT v0.2 spec, TUI renderers for new primitives, `gact agent deploy clio`.
- clio-agent: `tui-integration` off `develop` — Python/FastAPI implementation of v0.2, gap tracking.

### Phase 0 — spec, gaps, emulator + TUI support, conformance

The spec lands first, then we grow the **emulator** (gact-tui's in-house reference backend) + **TUI renderers** for every v0.2 primitive BEFORE CLIO implements it. That way the TUI can iterate fast in-house (with tests + screenshots) and CLIO just has to satisfy a proven contract when it implements. Meanwhile, capability gaps between v0.1 and CLIO are filed as individual CLIO issues (framed around CLIO's mission).

- [x] **CLIO-BBBBBBBBBB1.** GACT v0.2 drafted in `contract/SPEC.md`. Additive-only: bumped `contract_version` to `"0.2"`, added capability flags (`agent_routing`, `memory`, `structured_errors`, `integration_health`, `tool_telemetry`), extended `AgentDef` with optional tier/specialization/keywords, added `routing_decision` part type, extended `tool_result` with `cached`/`duration_ms`, added message-level `error_info`, new `/v1/memory/stats` endpoint (§6.19), new events (`session.agent_routed`, `memory.cache.updated`, `integration.status_changed`), new §14 Error Taxonomy. Naming stays generic on the GACT side; CLIO materialises them concretely. v0.1 backends keep working unchanged.

- [x] **CLIO-BBBBBBBBBB2.** Gap inventory filed as 10 native-merit issues on iowarp/clio-agent (#2–#11): tool telemetry events, cooperative cancellation, two-phase edits, context files, token streaming, interactive safety gate, cost tracking, nanoagents, session forks, message search. Each framed around CLIO's mission, none reference gact-tui. Bookkeeping map at `docs/tui/GAPS.md` on `tui-integration` branch.

- [x] **CLIO-BBBBBBBBBB3.** Emulator speaks v0.2. Landed on `clio` branch: `contract_version` bumped to `"0.2"`; capabilities endpoint advertises the 5 new flags (agent_routing / memory / structured_errors / integration_health / tool_telemetry); `AgentDef` extended with `tier`/`specialization`/`keywords`; 3 tier-2 agents seeded in the static catalog (code_expert / research_expert / data_expert); `/v1/agents?tier=N` query filter; new `/v1/memory/stats` endpoint (SPEC §6.19) with hit/miss counters + per-session budget; `/v1/health` grew `integrations[]` + `overall_status`; new `MemoryStats` / `Integration` / `ErrorInfo` types; `Message.error_info` field; `Part` extended with `cached`/`duration_ms` (tool_result) + `selected_agent`/`rationale`/`confidence`/`heuristic` (routing_decision); new `PartTypeRoutingDecision` const + `NewRoutingDecisionPart` constructor. New `runRoutingScript` scenario triggered by "analyze"/"profile"/"refactor"/"search the web"/etc — emits `routing_decision` part + `session.agent_routed` SSE event + keyword-routed in-character answer. 5 new tests (`TestCapabilitiesV02Flags`, `TestHealthV02IntegrationsArray`, `TestMemoryStatsEndpoint`, `TestMemoryStatsWithSession`, `TestListAgents_TierFilter`, `TestRoutingScript_EmitsRoutingDecisionPart`, `TestRoutingScript_PicksByKeyword` with 4 subtests). E2E `TestE2E_HealthAndCapabilities` updated for the v0.2 bump. All emulator + TUI suites green.

- [x] **CLIO-BBBBBBBBBB4.** TUI renders v0.2 primitives end-to-end. Shipped: (a) agent badge from `routing_decision` part — `▸ <agent>  ·  heuristic|LM-routed  ·  confidence N.NN` + italic rationale, palette-coloured per agent id via `agentColor()`. (b) `cache NN%` footer chip gated on `capabilities.memory`, traffic-lit (≥75% green / ≥50% amber / else red); fetch wired on connect + every session→idle transition; silent on errors. (c) `/doctor` slash-command opens a modal with `overall_status` chip + per-integration NAME/STATUS/DETAIL table, colour-coded; `r` refreshes, Esc/q close; gated on `capabilities.integration_health`. Three screenshots: `v0_2_routing_decision.png`, `v0_2_doctor_modal.png`. 12 new tests: routing render (4) + footer chip (3) + doctor modal (5). Emulator wiring: `scenario.Config.OnMemoryHit/Miss` hooks; routing_script + default_script seed the counters so the chip has data. error_info taxonomy + cached tool-glyph deferred — no real failure scenario to exercise them yet; tracked as follow-ups.

- [x] **CLIO-BBBBBBBBBB5.** `contract/conformance/` grew 5 v0.2 suites in `v0_2.go`: `V0_2_AgentRouting` (asserts `/v1/agents?tier=2` returns ≥1 row with tier/specialization/keywords populated), `V0_2_MemoryStats` (asserts `/v1/memory/stats` shape + hit_rate ∈ [0,1] + scoped session block), `V0_2_IntegrationHealth` (asserts overall_status ∈ {ready,degraded,unavailable} + non-empty integrations[] each with name + status), `V0_2_StructuredErrors` (asserts 4xx/5xx bodies carry the envelope; accepts both v0.1 `{code, message}` and v0.2 `{error, message, details, recoverable}` shapes during migration), `V0_2_ToolTelemetry` (capability-flag advertised; full fidelity checked by the SSE suite). minimalCaps gained 5 v0.2 fields; dispatch in Run() gates each suite on the matching capability flag. v0.1 adapters declare the flags false → suites skip cleanly. All suites pass against the emulator.

### Phase 1 — CLIO speaks v0.2 (smoke path)

CLIO catches up to what emulator + TUI already support. Every item here is implementation-on-the-CLIO-side against an already-proven spec.

- [x] **CLIO-BBBBBBBBBB6.** `src/clio_agent/gact/` scaffolded on `tui-integration`. Three files: `__init__.py` (re-exports), `types.py` (Pydantic models for v0.2 wire shapes — Health/Capabilities/ErrorInfo/Integration etc.), `app.py` (FastAPI factory `build_app()`, module-level `app` for uvicorn, `main()` console-script entry). New console script `clio-agent-gact` wired in pyproject.toml (default port 8100). Live routes: `GET /v1/health` (v0.2 shape with overall_status + integrations[]), `GET /v1/capabilities` (contract_version='0.2', honest flag reporting — claims structured_errors + integration_health; everything else False until wired). 13 stubbed routes return 501 with the v0.2 error envelope (`error='config_error'`). HTTPException handler wraps any raised error in the envelope. 16 pytest tests, all green. ruff clean. Baseline preserved.

- [x] **CLIO-BBBBBBBBBB7.** `src/clio_agent/gact/sessions.py` landed on `tui-integration` (commit `d9c6f1b`). `Session` dataclass mirrors SPEC §4.2 (id/workspace_id/title/status/created_at/updated_at/message_count/metadata); zero-values for fields CLIO doesn't populate yet. `SessionStore` is threadsafe (single `threading.Lock`), with atomic tempfile+rename persistence to JSON (default `~/.config/clio-agent/sessions.json`, honours XDG_CONFIG_HOME, path-overridable for tests). Corrupted on-disk JSON starts empty rather than crashing — operator can salvage. Microsecond-precision ISO-8601 timestamps so `list()` sort is deterministic across rapid creates. API: `create / get / list(workspace_id?) / update / delete / count`. 12 new tests: shape, default-title, get, get-missing, list newest-first + ws filter, update patches + updated_at bump, update-missing, delete-returns-true-then-false, persistence roundtrip, JSON file valid, corrupted file recovers, count tracks mutations. 28 tests total in `test_gact/`, all green; ruff clean.

- [x] **CLIO-BBBBBBBBBB8.** `/v1/sessions` CRUD wired on `tui-integration` (commit `16b88f0`). Four handlers replace their 501 stubs: `POST /v1/sessions` (Session), `GET /v1/sessions?workspace_id=?` (ListSessionsResponse newest-first + filter), `GET /v1/sessions/{sid}` (Session | structured 404), `DELETE /v1/sessions/{sid}` (204 | 404). All backed by `app.state.sessions` (the BBB7 store); `build_app(sessions_path=...)` override for test isolation. 404 paths return the v0.2 error envelope via HTTPException. Types added to types.py: `Session`, `CreateSessionRequest`, `ListSessionsResponse`. Capability flag flipped: `sessions=True`. 9 new TestClient integration tests (POST shape + defaults, GET list + filter, GET single + 404 envelope, DELETE 204 + 404 envelope, persistence roundtrip across two TestClient instances). app.py coverage 88%; 33 tests total; ruff clean.

- [x] **CLIO-BBBBBBBBBB9.** `POST /v1/sessions/{sid}/messages` non-streaming landed on `tui-integration` (commit `58f8b4d`). Request body `{text, metadata?}`; response carries both user + assistant Message records in one round-trip. Assistant message has a `routing_decision` part (§4.5) carrying selected_agent + rationale when agent emits one, followed by the text part. `error_info` (§14) populated on agent exceptions (HTTP stays 200 — the assistant message still rendered, just marked errored); session transitions to `error` status. Session transitions `idle → running → idle` on happy path; `message_count += 2` per turn. Structured 404 for unknown session, 503 for missing agent. `AgentLike` Protocol lets tests inject a `FakeClioAgent` without DSPy/LM deps. Module-level helpers `_new_message_id / _new_part_id / _iso_from_epoch` for stable id + timestamp generation. 6 new integration tests: happy path + message count + status transition + 404 + 503 + exception→error_info + no-routing-case. 39 tests total; ruff clean.

- [x] **CLIO-BBBBBBBBBB10.** `/v1/agents` + `/v1/catalog/tools` landed on `tui-integration` (commit `a05315e`). Endpoint `GET /v1/agents?tier=N` surfaces CLIO's 3 experts (data/analysis/visualization) as tier-2 AgentDef rows with specialization (data_analysis / data_visualization) + keywords (from `Expert.get_capabilities()`) + tools (from a hardcoded `_EXPERT_TOOLS` map since importing DSPy just to list a catalog would be heavy; stable lists per expert, test-guarded). Plus synthesised tier-1 'main' orchestrator row for completeness. `GET /v1/catalog/tools` returns the flat deduped tool catalog. `agent_routing` capability flag flipped to True — TUI's routing badge render path now activates against this backend. Types added: `AgentDef`, `ListAgentsResponse`, `Tool`, `ListToolsResponse`. 6 new tests (hierarchy, tier filters, known-expert pinning, unknown-tier→empty, catalog dedup); 44 tests total; ruff clean.

- [x] **CLIO-BBBBBBBBBB11.** `/v1/memory/stats` landed on `tui-integration` (commit `fa91527`). Backed by `ARCMemory.get_cache_stats()`. Returns `cache` (hits/misses/hit_rate/capacity) + `global` (conversations + invocations totals from ARC index sizes) + optional `session` block (when `?session_id=` set; populated from session registry — unknown session returns empty block, NOT 404, so the TUI's polling chip doesn't spam logs). `arc=None` returns zero counters per SPEC §6.19 ("zeros are a valid signal") — no crash. JSON wire key `global` mapped from Python attribute `global_` via `serialization_alias` + `response_model_by_alias=True`. `capabilities.memory` flipped to True. 6 new tests; 49 tests total in `test_gact/`; ruff clean.

- [x] **CLIO-BBBBBBBBBB12.** `gact agent deploy clio` end-to-end (commit `bc6c165`). `adapterBinFor("clio")` resolves the Python `clio-agent-gact` console script with an install hint pointing at `uv pip install -e /path/to/clio-agent`. `runAgentDeploy` per-kind spawn args (claudecode takes `--cwd`, clio doesn't — uses CLIO_ALLOWED_ROOTS instead) and per-kind probe budget (3s for Go adapters, 10s for the Python+DSPy cold start). Verified live in this env via `uv run --extra api clio-agent-gact`: deploy spawns the server on port 45613, registry records `kind=clio`, list shows `alive=yes`, `/v1/agents?tier=2` returns the 3 experts with specialization + keywords, `/v1/memory/stats` returns the v0.2 envelope. New skip-gated `TestCLI_AgentDeployLifecycle_Clio` (skips when `clio-agent-gact` not on PATH); existing claudecode lifecycle test still passes.

### Phase 2 — streaming

- [x] **CLIO-BBBBBBBBBB13.** Implement SSE on `GET /v1/sessions/{sid}/events`. Stream v0.2 events driven by `ClioAgent.forward(stream=True)`: session.status_changed, message.created, message.part.added (including routing_decision), message.part.delta, message.completed. Real token streaming deferred until CLIO issue #6 lands (tracked at CLIO-BBBBBBBBBB18 below). [✓ Landed on tui-integration: EventBus + per-session queues, message.created/completed wired, 15s heartbeat. 55 tests green.]

- [ ] **CLIO-BBBBBBBBBB14.** End-to-end smoke: `gact agent deploy clio && gact connect` creates session, sends prompt, receives streaming answer, TUI renders agent badge + routing explanation + memory footer. VHS screenshot committed.

### Phase 3 — ARC + metrics surface

- [ ] **CLIO-BBBBBBBBBB15.** `GET /v1/metrics` returns per-expert stats reshaped to v0.2 envelope. TUI Settings → Metrics tab shows per-expert totals + latency p50/p95/p99; footer shows ARC cache hit rate from `/v1/memory/stats`.

- [ ] **CLIO-BBBBBBBBBB16.** `message.completed` payload carries `metadata.tools_called` synthesised from `Invocation.tools_called`. TUI renders post-hoc gutter list under each turn.

- [ ] **CLIO-BBBBBBBBBB17.** TUI `/doctor` view reads `/v1/health.integrations[]` and renders the status table.

### Phase 4 — CLIO catch-up (filed as upstream issues)

Each item here CLOSES one of the issues filed in CLIO-BBBBBBBBBB2. The PLAN item covers the CLIO Python implementation + flipping the corresponding capability flag on.

- [ ] **CLIO-BBBBBBBBBB18.** Per-tool telemetry events — closes iowarp/clio-agent#2. Instruments `MCPToolBridge.call_tool` to emit `tool.call.started` / `tool.call.completed`. Flip `capabilities.tool_telemetry.events = true`.

- [ ] **CLIO-BBBBBBBBBB19.** Real token streaming — closes iowarp/clio-agent#6. DSPy stream pass-through through `/query?stream=true`. TUI already renders chunks live.

- [ ] **CLIO-BBBBBBBBBB20.** Cooperative cancellation — closes iowarp/clio-agent#3. `POST /v1/sessions/{sid}/cancel`. Flip `capabilities.cancellation = true`.

- [ ] **CLIO-BBBBBBBBBB21.** Two-phase edits — closes iowarp/clio-agent#4. file_diff records + apply/reject endpoints. Flip `capabilities.diffs = true`.

- [ ] **CLIO-BBBBBBBBBB22.** Session context files — closes iowarp/clio-agent#5. Attach/detach APIs + mode hints. Flip `capabilities.files = true`.

- [ ] **CLIO-BBBBBBBBBB23.** Interactive safety gate — closes iowarp/clio-agent#7. Destructive-tool permission prompts. Flip `capabilities.permissions = true`.

- [ ] **CLIO-BBBBBBBBBB24.** Cost tracking — closes iowarp/clio-agent#8. Per-turn + per-session tokens + cost_usd. Flip `capabilities.cost_tracking = true`.

- [ ] **CLIO-BBBBBBBBBB25.** Tier-3 Nanoagents — closes iowarp/clio-agent#9. `spawn_nanoagents` primitive on Tier-2 experts. Flip `capabilities.subagents = true`.

- [ ] **CLIO-BBBBBBBBBB26.** Session forks — closes iowarp/clio-agent#10. `POST /sessions/{sid}/fork`. Flip `capabilities.session_branching = true`.

- [ ] **CLIO-BBBBBBBBBB27.** Message search — closes iowarp/clio-agent#11. `GET /search?q=`. Flip `capabilities.search_messages = true`.

### Phase 5 — packaging polish

- [ ] **CLIO-BBBBBBBBBB28.** Packaging: CLIO publishes `clio-agent-gact` as a first-class entry point. `gact agent deploy clio` probes for it on PATH, falls back to `uv run --project <dir> python -m clio_agent.gact.app`.

- [ ] **CLIO-BBBBBBBBBB29.** End-to-end screenshot set: `screenshots/clio-{landing,agent-badge,turn,diff,metrics,doctor}.png`. README gets a "Supported agents" row for CLIO.

### Phase D — real e2e tests with clio-agent + Meridian + Claude Code

Phase D in the A→B→C→D workflow: end-to-end validation that the full stack (gact-tui → GACT v0.2 wire → clio-agent-gact → Meridian → Claude Code via Claude Max OAuth) works for real, against a non-trivial scientific data workflow. Phases C ships the wiring; Phase D proves the wiring + provider + LM behaviour all line up.

- [ ] **CLIO-BBBBBBBBBB-D1.** Meridian setup recipe in `docs/providers/meridian.md`: install Meridian, OAuth bootstrap to Claude Max, point CLIO at it (`CLIO_LM_PROVIDER=openai` + `CLIO_LM_API_BASE=http://127.0.0.1:<meridian_port>/v1` + `CLIO_LM_MODEL=claude-sonnet-4-5`). Verify with a trivial `clio-agent --query "hello"` round-trip.

- [ ] **CLIO-BBBBBBBBBB-D2.** `--auto-meridian` flag on `gact-clio-adapter` (or its successor in the Python entry point): when set, the deploy spawns Meridian alongside `clio-agent-gact` and stitches the env vars automatically. Readiness probes both processes. Removes the manual setup step from the happy path.

- [ ] **CLIO-BBBBBBBBBB-D3.** Real-LM smoke test: `gact agent deploy clio prod --auto-meridian && gact connect prod`, run a turn that exercises a tier-2 expert (e.g. "analyze /tmp/sample.parquet"), assert the routing badge paints, the expert produces a real response, ARC cache stats update, the assistant reply renders cleanly. Skipped in CI when Claude Max OAuth + Meridian aren't available; runs locally as a manual verification step.

- [ ] **CLIO-BBBBBBBBBB-D4.** VHS recording + screenshot set capturing the full stack: launching, sending a query, agent badge appearing live, streaming response, doctor modal showing all integrations ready, memory chip ticking up. Committed as `screenshots/clio-e2e-*.png` + `screenshots/clio-e2e.gif`.

- [ ] **CLIO-BBBBBBBBBB-D5.** README gains a "Quick start with CLIO + Claude Max" section walking through Meridian + clio-agent-gact + gact in three commands. Targets the user who wants to try the integration without reading the full integration plan.

### Acceptance

After Phase D: `gact agent deploy clio my-clio --auto-meridian && gact connect my-clio` lands in a working conversation against a locally-running CLIO backed by Claude Max via Meridian. TUI renders agent badge, tool calls (post-hoc in Phase 3, live in Phase 4), ARC cache hit rate, doctor modal. Conformance: `contract/conformance` passes for CLIO where supported; unsupported capabilities declared via the capabilities endpoint. End-to-end recording demonstrates the full stack.

---

## Phase AAAAAAAAAA — Grep output as CC-style gutter

- [x] **AAAAAAAAAA1.** grep tool_result no longer renders raw "path:line:content" text. User feedback: "the line numbers should be added by us not for them to be on the file". New `renderGrepResult` parses each row into `(path, line, content)` tuples and renders CC/crush style: `⎿` elbow on its own row, file path as a bold primary header row (shown once per file group, not per hit), line numbers right-aligned in a muted gutter, `│` column separator, content in full-fg. Groups consecutive hits from the same file under one header so 14 hits across 5 files don't repeat the path 14 times. Falls through to the generic tool_result render if parsing fails. `renderPartsForRoleWithResultsSelected` grew a `renderToolResultForTool` dispatch so future tools (bash, fetch) can take over their body layout similarly.

## Phase ZZZZZZZZZZ — EditFile absorbs sibling file_diff

- [x] **ZZZZZZZZZZ1.** User feedback: "EditFile returns the diff, there shouldn't be an 'ok' or a diff indicated but instead the changes". When an edit_file tool_call has a matching (by path) sibling file_diff in the same assistant message, the diff now renders UNDER the EditFile header as its body. Dropped: the `⎿ ok` tool_result row (replaced by the diff), the standalone `◇ diff main.go — focus body, then 'a' apply / 'r' reject` header (redundant with the tool_call above). New `matchEditFileDiffs` helper returns `byCall map` + `suppressed set`; `renderEditDiffInline` renders the diff with a `⎿` elbow + apply/reject hint inline. Lone file_diffs (no matching edit call) keep their standalone render. Two tests: `TestEditFile_AbsorbsSiblingDiff`, `TestEditFile_LoneFileDiffStillRendersStandalone`.

## Phase ZZZZZZZZZ — Ctrl+C confirmation overlay

- [x] **ZZZZZZZZZ1.** User feedback: "ctrl+c should have a confirmation window, close? yes no detach". First Ctrl+C now opens a small 3-option modal (close / no / detach) instead of quitting immediately. `close` preserves the original JJJJJ1 "stop everything" path (cancel in-flight turn + quit); `no` dismisses; `detach` mirrors Ctrl+Z's IIIII1 clean-detach flow (captures DetachedSessionID + quit, session stays alive on the backend). Keybindings: `←/→` move highlight, `Enter` fire, `y/n/d` direct-select each option, `Esc` dismiss, and double Ctrl+C accepts the current selection so the pre-ZZZZZZZZZ1 "spam ctrl+c to quit" muscle memory still works. Five tests cover open-modal / kbd-nav / Esc-dismiss / detach-path / double-Ctrl+C-accepts. Two existing e2e + unit tests updated to send Ctrl+C twice for the new flow.

## Phase YYYYYYYYY — Detail modal width + overflow

- [x] **YYYYYYYYY1.** User feedback: "when opening a file, the window can overflow, and it is not wide enough for most lines". New `detailModalWidth()` uses 90% of terminal width (capped 80–160) instead of the shared 72-col `modalWidth`, so source-code content doesn't wrap at 72. Tightened `detailPageSize` from `a.height - 6` to `a.height - 12` to fully account for border (2) + padding (2) + title (1) + 2 blank separators + hint (1) + 4-row screen margin, preventing the modal from overflowing the viewport. Other modals (settings, help, palette) unchanged.

## Phase XXXXXXXXX — Single selector (drop message-level cursor + [/])

- [x] **XXXXXXXXX1.** User feedback: "i also dont see the value with the message selector and global turn selector rather just have the message selector". Removed the full-message █ gutter bar + BgSubtle row tint in `renderBody`. Dropped the `[` / `]` coarse-grained message-jump keys and their `jumpMessageCursor` helper. Now the per-part `▸ ` from TTTTTTTTT1 is the ONLY selection indicator — single selector, clearer signal. `TestPerPart_BracketKeysAreNoOp` replaces the old message-jump test, pinning the removal so a future re-add hits a test failure.

## Phase WWWWWWWWW — ▸ marker wrap alignment

- [x] **WWWWWWWWW1.** User reported the ▸ prefix making text "scroll and jump line" — the first line got `▸ ` (shifted 2 cols right) while continuation rows stayed at col 0, so wrapped text read ragged. Fix in `markSelectedBlock`: prefix line 0 with `▸ ` (marker, Secondary bold) and every continuation line with two matching spaces so the whole selected block indents uniformly. Marker stays visible only on line 0 (eye catches the block start); indent runs all the way so wrap columns line up.

## Phase VVVVVVVVV — Scroll-to-part visibility

- [x] **VVVVVVVVV1.** Fixed the "selected block scrolled above the fold" wart flagged as a follow-up on TTTTTTTTT1. New `pendingPartScroll` flag gets armed by every cursor-moving handler (stepPartCursor, jumpMessageCursor, g/G, maybeInitBodyCursor). The View path, after building the full body string and before scrollClip, calls `adjustScrollForSelectedPart` which finds the `▸ ` marker's line offset and bumps `scrollOffset` so it falls within the viewport (target: ~1/3 from top for context). No-op when the marker is already in the upper 2/3 of the viewport so walking through adjacent on-screen parts doesn't jitter. Three regression tests: `TestAdjustScrollForSelectedPart_BringsMarkerIntoView` (marker above fold → scroll nudges it in), `TestAdjustScrollForSelectedPart_NoOpWhenVisible` (already-visible marker → no scroll change), `TestAdjustScrollForSelectedPart_NoMarkerIsNoOp` (no `▸ ` → leave scroll alone). Regenerated screenshots: walking `k` through the 6-block multi-tool turn now paints the marker on the correct header (ReadFile main.go, then ReadFile handlers.go, etc.) visible in-frame.

## Phase UUUUUUUUU — Unified-diff view (hunk headers + context lines)

- [x] **UUUUUUUUU1.** File-diff parts now render as a real hunk-aware unified diff (Myers/LCS via `github.com/aymanbagabas/go-udiff`) instead of the row-aligned `simpleDiff`. User ask: "I would like to be able to work with an edit with diff view, this is what we changed kind of thing, I think that is what CC and crush do". Output mirrors `git diff --no-color`: `@@ -A,B +C,D @@` header in bold primary; red `- ` for deletions; green `+ ` for insertions; dim fg for ±3 surrounding context lines. `--- path` / `+++ path` rows stripped (path already in the part head above). Tiny diffs (≤ 6 combined lines) short-circuit to the old simpleDiff since a hunk header is pure noise on a one-liner. New `TestUnifiedDiffView_HasHunkHeaderAndContext` pins the @@ + context invariant; `TestUnifiedDiffView_TinyChangesUseSimpleDiff` pins the short-circuit.

## Phase TTTTTTTTT — Per-part body cursor (block-to-block nav)

- [x] **TTTTTTTTT1.** Body cursor now walks *parts*, not messages. User feedback: "you are currently making your selector go conversation turn to conversation turn instead of logical block to logical block. What happens if an agent reads two large files?" When an assistant turn reads two files, each read_file/tool_result pair is now an individually-addressable block — j/k/↑/↓/n/N step through them one at a time, crossing message boundaries when the current turn's blocks are exhausted. Added `bodySelPartIdx` state (index into `addressablePartsOf(msg)`, which filters out thinking + empty text); `stepPartCursor(dir)` walks the flat part list. `[` / `]` remain as coarse-grained message jumps for users who want to hop turns quickly. Ctrl+E / Enter route through new `findBulkyPartForSelected` — when the cursor points at a specific tool_call, it drills forward through sibling tool messages to find the *matching* result (so cursor-on-first-read expands file one, cursor-on-second-read expands file two, each individually). Visual: renderer grew a `selectedPartID` pathway (`renderMessageInContextWithResultsSelected` + `markSelectedBlock`) that prepends `▸ ` to the selected part's first line in Secondary-palette bold. Three new tests: `TestPerPart_JKWalksPartsWithinMessage`, `TestPerPart_CtrlETargetsSelectedToolCall`, `TestPerPart_BracketKeysJumpMessages`.

## Phase SSSSSSSSS — Richer multi-tool scenario (bigger outputs + real diff emission)

- [x] **SSSSSSSSS1.** Multi-tool variant[0] now demonstrates the full investigate → action flow. User feedback: "the test is too shallow, a read file would return many issues". Swapped the 2-line main.go + 1-line grep to: (1) read_file main.go = 52-line realistic Go service with `println` call sites; (2) read_file internal/handlers/handlers.go = 48-line http handlers with more `println`s; (3) grep for `println\(` returns 14 hits across 5 files; (4) edit_file proposal. After the tool loop, `runMultiToolScript` emits a sibling `file_diff` part (new `diffPath` + `diffBefore` + `diffAfter` + `diffLang` fields on the variant) so "many tools please" now produces the full read → grep → edit flow with a/r apply/reject on the proposed diff. Variants 1 + 2 (schema/migration, failing-test triage) keep their 3-tool shapes — the diff emission is gated on `v.diffPath != ""`. Tests relaxed from "expect exactly 3 tool.call.completed" to "expect ≥3", and `TestRichScripts_MultiTool` now also asserts a file_diff part is emitted for variant[0].

## Phase RRRRRRRRR — Splash revert to GRC basic + sidebar overflow fix

- [x] **RRRRRRRRR1.** Two fixes shipped together:
  1. **Splash revert** — user didn't like the iowarp_logo.gif rendering, so rebake intro-anim.ansi from logo/logo-vide-basic.gif (36 frames, ~207KB). Makefile INTRO_SRC default reverted. CLIO figlet name stays.
  2. **Sidebar overflow** — user reported certain (sessions × context-files) combinations pushed sibling panes down. Two root causes: (a) budget math never accounted for the R2 "N active · M archived" footer (2 rows — blank + label), (b) lipgloss `Height()` pads but doesn't truncate, so any budget overrun just spilled past the border. Fix: honest footer accounting in both `renderSidebar` and `sidebarPageSize` (so keyboard paging stays aligned); defensive `clampLines(body, height-2)` before `style.Render` as a safety net against floor-division off-by-ones. Regression test `TestSidebar_NeverExceedsPaneHeight` iterates terminal heights 15..45 × context-file counts 0..6 and asserts the rendered line count never exceeds the pane's inner budget — catches the specific "1 file breaks, 2 breaks, 3 works, 4 works" non-monotonicity the user reported.

## Phase QQQQQQQQQ — iowarp splash + CLIO naming

- [x] **QQQQQQQQQ1.** Swapped the splash animation from the earlier GRC logo-video to the new 80-frame `logo/iowarp_logo.gif`. Figlet name changed from `GACT` → `CLIO` per the user's rename ask. Cleaned up the intro package so it's asset-neutral: `grc.go` → `intro.go`; embed files `grc-logo-anim.ansi`/`grc-logo.ansi` → `intro-anim.ansi`/`intro-static.ansi`; exports renamed `AnimFrames` + `StaticLogo` (GRC shims retained as deprecated for back-compat). Makefile target parameterised with `INTRO_SRC=logo/iowarp_logo.gif` so future asset swaps are `make intro-logo-anim INTRO_SRC=logo/new.gif`. Three screenshots `QQQQQQQQQ1_iowarp_splash_{a,b,c}.png` prove the rotation. Embed grew to ~900KB (80 × ~11KB per frame vs previous 207KB / 36 frames) — acceptable for a single-binary release. All tests green.

## Phase PPPPPPPPP — `gact session <verb>` alias tree

- [x] **PPPPPPPPP1.** Discoverable `gact session <verb>` namespace that mirrors `gact agent *`. Aliases existing top-level commands: `create` → runNew, `list` → runList, `show`/`info` → runInfo, `connect`/`attach` → runAttach, `rename` → runRename, `stop`/`cancel` → runCancel, `rm`/`remove`/`delete` → runDelete, `export` → runExport. No new behavior — just a cleaner grouping the user explicitly asked for last night. Unknown verbs fail fast. New TestCLI_SessionAliasCRUD exercises the create → list → show → rename → rm round-trip through the aliases + the unknown-verb error path.

## Phase OOOOOOOOO — `gact agent deploy/list/stop/rm/connect` local PM

- [x] **OOOOOOOOO1.** Local agent process manager. `gact agent deploy <kind> <name>` spawns the adapter binary detached on a free port, probes /v1/capabilities up to 3s for readiness, records `(name, kind, host, port, pid, cwd, started_at)` in `~/.config/gact/agents.json` (GACT_AGENTS_PATH override). `list` prints a pretty / tsv / json table with per-row `probeAgentAlive` liveness. `stop` SIGTERMs the pid (idempotent — ESRCH treated as already-stopped). `rm` stops + drops the entry. `connect <name>` resolves host:port, probes alive, sets GACT_BACKEND and runs the TUI. Top-level `gact connect <name>` alias for the common path. Platform-specific `detachedSysProcAttr` helper: Setsid on Unix, CREATE_NEW_PROCESS_GROUP on Windows — adapter survives parent shell exit. Collapses the previous 3-terminal deploy (build adapter + start adapter + start TUI) to `gact agent deploy claudecode myclaude && gact connect myclaude`. 4 unit tests on the registry + 1 CLI e2e test that builds the real claudecode adapter, deploys, lists, stops, rms — all green.

## Phase NNNNNNNNN — Splash: basic logo, slower cadence, configurable, transparent bg

- [x] **NNNNNNNNN1.** Reloaded the animation from `logo/logo-vide-basic.gif` (the cropped "basic" version the user added). Chafa pipeline gains `--threshold 0.1` so the dark-navy source background is treated as transparent, letting the splash blend with the terminal bg. Per-frame delay promoted from a const to a config parameter: new `intro_frame_delay_ms` field in `config.Config`; `app.IntroFrameDelay` threads it from main.go; `(a *App).tickDelay()` clamps to [20ms, 1s] so a typo doesn't freeze the splash. Default raised from 33ms → 90ms (36 frames × 90ms ≈ 3.2s per loop) per user feedback that the basic-crop was too fast. Makefile target updated to include the threshold flag. Three screenshot frames (`basic_splash_frame_{a,b,c}.png`) prove the slowed cadence catches visibly different rotation angles. `gact emit-config` sample now includes the new field.

## Phase MMMMMMMMM — Animated GRC logo splash (36 frames)

- [x] **MMMMMMMMM1.** Splash now animates — 36 frames extracted offline from `logo/logo-video.gif` via `convert -coalesce`, each frame chafa-rendered at 30x15 truecolor halfblock, joined with form-feed separators into `grc-logo-anim.ansi`, embedded via `go:embed`. Runtime frame counter on App, `introTickMsg` tea.Tick cmd at ~30 FPS (33ms/frame → 1.2s per loop), animation starts in Init when StageIntro, dies naturally as soon as the splash dismisses (any keypress → StageConnecting). New `make intro-logo-anim` target regenerates the bake from `logo/logo-video.gif`. Three screenshot frames `MMMMMMMMM1_splash_frame_{a,b,c}.png` prove the rotation is visibly different at 800ms / 1200ms / 1600ms marks. TestEnableIntro_FlipsStage relaxed to accept the tick cmd (invariant still covered: no connect fires in StageIntro).

## Phase LLLLLLLLL — GRC logo intro splash via chafa

- [x] **LLLLLLLLL1.** `chafa` generates the terminal halfblock art OFFLINE (via `make intro-logo`; binary not shipped with the TUI), output checked in as `tui/internal/intro/grc-logo.ansi`. Runtime `go:embed` bakes the ANSI text into the binary — single-binary release stays intact, no runtime image-decoding dependency. `viewIntro` now uses the embedded GRC logo as the default `IntroLogo` when the user hasn't set a custom `intro_file`. Screenshot `screenshots/LLLLLLLLL1_grc_logo_splash.png` shows the truecolor triangle centered above the figlet "GACT" name + "press any key to continue" hint. Per user's explicit preference: chafa is the one-time generator (great output), runtime is pure-Go embed. Maintainer workflow: drop the source PNG at `tui/internal/intro/grc-logo.png`, run `make intro-logo`, commit the `.ansi` update.

## Phase KKKKKKKKK — Completion scripts catch up with new subcommands

- [x] **KKKKKKKKK1.** bash + zsh + fish completion scripts gain `detached` (AAAAAAAA1) and `resume` (IIIIIIII1) subcommands that were silently missing since those features shipped. TestCLI_Completion extended to assert both subcommand names appear in all three outputs — prevents future subcommands from silently dropping off the completion list. Also guards existing `dashboard` + `log` presence.

## Phase JJJJJJJJJ — `gact info` carries detached status

- [x] **JJJJJJJJJ1.** `gact info <sid>` now reads the local detached registry and surfaces the flag alongside the session metadata — text adds `detached: yes|no` line (always present so scripts get a deterministic field), JSON adds `detached: bool` at the top level alongside `session`. Same source-of-truth as the other surfaces. 11 UX surfaces now read the single registry (header chip + sidebar marker + sidebar filter + dashboard DET column + dashboard JSON field + dashboard `--detached-only` + `gact list` column + `gact list` JSON + `gact list --detached-only` + `gact detached` + `gact info`). TestCLI_InfoDetachedField covers plain + walked + JSON for both.

## Phase IIIIIIIII — Consolidate diag output into one core

- [x] **IIIIIIIII1.** runDiag (stdout) and writeDiagTo (arbitrary writer) had duplicated logic that drifted twice — once for cost thresholds and again for the HHHHHHHHH1 detached summary. Refactored both to share `writeDiagCore(w, verbose)`:   - `runDiag()` is now a one-liner: `writeDiagToVerbose(os.Stdout)` → verbose=true   - `writeDiagTo(w)` stays as a one-liner: `writeDiagCore(w, false)` → verbose=false Verbose adds the "custom theme" probe + "config load: (error: …)" row that the dump-bundle variant historically omitted. Future rows (new env vars, new counters) land in one place now. End-to-end verified: both verbose and terse outputs include the detached_path + detached_count lines; verbose alone shows the custom-theme line.

## Phase HHHHHHHHH — `gact diag` summarises detached registry

- [x] **HHHHHHHHH1.** Extended both `runDiag` (stdout path) and `writeDiagTo` (dump-bundle path) to surface the detached registry state in two lines: `detached_path: <path>` + `detached_count: N record(s) across M backend(s)`. Also added `GACT_DETACHED_PATH` to the env-var roundup so bug reports show which override (if any) is in effect. Missing registry file shows `0 record(s) across 0 backend(s)` gracefully. End-to-end verified: 3-record 2-backend registry reports exactly that; missing file reports 0+0.

## Phase GGGGGGGGG — `gact list` carries detached marker

- [x] **GGGGGGGGG1.** `gact list` output now carries a detached marker on every row — mirrors SSSSSSSS1 + CCCCCCCC2 on dashboard. TSV format: new 5th column with `yes` or empty string; JSON format: new top-level `detached: bool` field. Same registry source filtered to current backend. Additive change — JSON callers see a new key alongside existing ones, TSV callers slicing cols 1..4 with awk/cut stay correct. End-to-end against live emulator with 2-session backend + 1-entry registry: walked row shows `yes` / `true`, plain row shows empty / `false`. TestCLI_ListFilters + TestCLI_ListDetachedOnlyAndSort still pass.

## Phase FFFFFFFFF — `gact list` gets --detached-only + --sort

- [x] **FFFFFFFFF1.** `gact list` gains two flags mirroring dashboard: `--detached-only` (filter to sessions in the local registry — YYYYYYYY1 on dashboard, BBBBBBBB1 on sidebar) and `--sort newest|oldest|status|tokens|backend` (KKKKKKKK1 — reuses the shared sortSessions helper). Default sort remains backend-order to preserve TSV-consuming script stability; --sort must be passed explicitly to reorder. Unknown --sort value fails fast. Filter ordering: status → detached-only → sort → limit. TestCLI_ListDetachedOnlyAndSort: 3 sessions with monotonic UpdatedAt verifies --sort oldest flips order; bogus --sort exits 2; --detached-only + seeded registry keeps only the registered sid. Existing TestCLI_ListFilters still green.

## Phase EEEEEEEEE — `gact follow --since DUR`

- [x] **EEEEEEEEE1.** Mirror TTT1's `gact log --since` on the tail-f path. Trims the initial snapshot to messages whose CreatedAt is within the last DUR; streamed messages always emit (they're live by definition). Zero-CreatedAt survives (defensive against backends that don't stamp). `seen` tracking stays populated off the FULL msgs listing so SSE replay doesn't re-emit messages that were older than --since but still in the backend's history. End-to-end: default emits all 4 snapshot rows; `--since 3s` (msgs are ~6s old) emits 0; `--since 1h` emits all 4.

## Phase DDDDDDDDD — `gact grep --role` filter

- [x] **DDDDDDDDD1.** `gact grep` now accepts `--role user|assistant|tool|system` (comma-separated). Mirrors VVVVVVVV1/WWWWWWWW1 semantics. Filter applies after the parallel cross-session search gathers hits (which are already role-decorated via midRoles) but BEFORE sort + --limit so the kept rows are the lexicographically-first POST-filter. Unknown role fails fast. End-to-end verified: `grep please --role user` keeps the user hit, `--role assistant` returns empty (assistants don't say "please"), `--role bogus` exits 2. New TestCLI_GrepRoleFilter alongside existing TestCLI_Grep + TestCLI_GrepLimit — all 3 pass.

## Phase CCCCCCCCC — `gact follow --grep` regex filter

- [x] **CCCCCCCCC1.** Mirror BBBBBBBBB1's `--grep` plumbing onto `gact follow` (tail-f). Compiles regex up-front so a bad pattern fails fast before SSE subscribe. The emit closure drops messages whose flattened text (via shared `flattenMessageForGrep`) doesn't match — both snapshot pass and streamed messages obey. End-to-end verified against live emulator: `gact follow <sid> --grep println` prints only tool_result + assistant rows that contain "println"; bad regex exits 2 with helpful error.

## Phase BBBBBBBBB — `gact log --grep` regex filter

- [x] **BBBBBBBBB1.** New `--grep PATTERN` flag on `gact log`. Drops every message whose flattened text doesn't match the regex. Case-insensitive by default (prepend `(?-i)` to override). Flatten helper covers text + thinking + tool_name + serialized tool_call input + tool_result body — so `gact log <sid> --grep "ReadFile\\("` finds tool calls, `--grep error` finds error output, etc. Stacks with --role/--since/--limit. Bad regex fails fast with `bad --grep pattern "X": ...`. New TestCLI_LogGrepFilter covers 4 scenarios: PRINTLN matches tool_result rows, unmatched returns empty, user message not present (doesn't contain pattern), malformed regex errors. All 5 log CLI tests pass (LogJSON + LogRoleFilter + LogGrepFilter + LogSince + Log).

## Phase AAAAAAAAA — `gact attach --print-only`

- [x] **AAAAAAAAA1.** New `--print-only` flag on `gact attach`. Resolves the target sid using the same CCCCCCCC1 no-args-default / RRRRRRRR1 fuzzy-match rules, prints the sid to stdout, exits 0 — no TUI launch. Enables scripting: `SID=$(gact attach <prefix> --print-only)` or `SID=$(gact attach --print-only)` to pick up most-recent detach. Flag parsed ahead of positional args so it composes cleanly with any invocation form. 2 new CLI tests: explicit-sid path + no-args-reads-registry path (the latter requires a live emulator since defaultAttachTarget probes).

## Phase ZZZZZZZZ — Body Enter opens detail view

- [x] **ZZZZZZZZ1.** New `enter` binding in body focus opens the floating detail modal on the cursor's bulky message (same code path as Ctrl+E). Matches the universal "Enter to open selected item" UX convention — users no longer have to remember Ctrl+E as the only open-detail key. Extracted `openDetailForSelection()` helper so both Ctrl+E and Enter dispatch identical behaviour. Help overlay combined row: `Ctrl+E · Enter — expand …`. New `TestBodyEnter_OpensDetailView`; existing Ctrl+E tests untouched (same helper). Goldens regenerated.

## Phase YYYYYYYY — `gact dashboard --detached-only`

- [x] **YYYYYYYY1.** New `--detached-only` flag on `gact dashboard` mirrors the sidebar JJJJJJJJ1 `d` toggle on the CLI — restricts rows to sessions in the local registry filtered to current backend. Applied after sort so stable ordering within the surviving subset is preserved. Works with both pretty and JSON output (SSSSSSSS1's `detached: bool` is still emitted per row, always true in this mode). End-to-end verified against live emulator with 1-detached + 1-plain 2-session setup: default shows 2, `--detached-only` narrows to the 1 walked, `--detached-only --format json` returns one row with `detached: true`. All TestCLI_Dashboard* tests still pass.

## Phase XXXXXXXX — Sidebar busy-only toggle

- [x] **XXXXXXXX1.** New `b` keybind in sidebar focus narrows list to sessions whose status is running or waiting_permission. Parallels JJJJJJJJ1's `d` detached-only. Can stack with `d` — the AND-combined filter shows sessions that are BOTH busy AND in the detached registry. Sidebar title reflects combinations: `SESSIONS · busy`, `SESSIONS · detached`, or `SESSIONS · detached + busy`. Transient hint reports the busy count. Help overlay + empty-state crib updated. Goldens regenerated. New `TestSidebar_BusyOnlyToggle` covers: default-all-visible, b-on keeps running+waiting, stacked-with-d narrows to busy-AND-detached intersection.

## Phase WWWWWWWW — `gact follow --role` filter

- [x] **WWWWWWWW1.** Mirror VVVVVVVV1's `--role` plumbing on `gact follow` (tail-f). Filter runs inside the `emit` closure so both the snapshot pass + every streamed message obey it. Same validation rules — unknown role errors fast. End-to-end verified: `gact follow <sid> --role assistant` prints only [ASSISTANT @ …] rows + drops user/tool turns. Unknown --role rejected with helpful error.

## Phase VVVVVVVV — `gact log --role` filter

- [x] **VVVVVVVV1.** New `--role user|assistant|tool|system` flag on `gact log` (accepts comma-separated list). Drops messages whose role isn't in the keep-set; works with both text + json formats (filter runs before format branch so NDJSON emits the same subset). Unknown role value fails fast with `unknown --role "X" (want user|assistant|tool|system)` instead of silent empty output. End-to-end `TestCLI_LogRoleFilter` covers 3 scenarios: `--role user` keeps only user row, `--role assistant,tool` keeps both and drops user, `--role bogus` exits 2 with helpful error.

## Phase UUUUUUUU — `gact detached --watch`

- [x] **UUUUUUUU1.** New `--watch` + `--interval` flags on `gact detached` — mirrors the BBBB1 `gact dashboard --watch` pattern. Load + probe + render extracted into a renderOnce closure that the watch loop calls per tick with ANSI clear-screen between frames. Reject-fast if combined with `--rm` or `--prune-dead` (write-mode flags conflict with read-loop semantics). Ctrl+C exits via default SIGINT handling. End-to-end verified: plain invocation unchanged, --watch + --rm rejected with "cannot be combined", watch mode renders the header + table each tick.

## Phase TTTTTTTT — dump-bundle includes detached registry

- [x] **TTTTTTTT1.** `gact dump-bundle` now writes `detached.json` (the local Ctrl+Z-detach registry, sibling of config.json — same source the BBBBBBBB1 sidebar markers + AAAAAAAA1 `gact detached` use). Useful when filing bug reports about resume / re-attach UX where the registry's state is the load-bearing context. Best-effort: missing/unreadable file just doesn't add the entry. Bundle summary line updated to `wrote N sessions + version + diag + metrics + detached`. End-to-end verified: bundle dir contains detached.json with the expected records.

## Phase SSSSSSSS — Dashboard JSON carries detached field

- [x] **SSSSSSSS1.** `gact dashboard --format json` now wraps each session row with a top-level `detached: bool` field so jq pipelines see the same marker the pretty/tsv DET column shows. Same source — local detached.json filtered to current backend (CCCCCCCC2). All TestCLI_Dashboard*/Watch/StatusFilter/Sort tests still pass (TestCLI_Dashboard's `"id"`/`"cost_usd"` checks unaffected — `detached` is added alongside, not replacing).

## Phase RRRRRRRR — Fuzzy attach matching

- [x] **RRRRRRRR1.** `gact attach <name|sid>` (and the sidebar's pickAttachIndex used by env-var attach) now matches in precedence order: exact id → exact title → id prefix → title substring (case-insensitive). Means an 8-char `gact attach sess_abc1` resolves a 32-char sid; `gact attach refactor` finds "refactor api auth"; `attach REFACTOR` works the same. Each level scans the full list before falling through; first match wins inside a level. Exact matches always beat heuristic ones — protects scripts that assumed strict equality. 4 new sub-tests added to TestPickAttachIndex (id-prefix, case-insensitive title substring, exact-id-beats-title-substring, exact-title-beats-id-prefix). Existing 4 sub-tests untouched.

## Phase QQQQQQQQ — Default scenario variant cycling

- [x] **QQQQQQQQ1.** Default happy-path script (the "read main.go" turn) now cycles through 3 coherent variants — thinking, intro, tool_result, and final reply all line up by index per turn so the voice stays consistent inside each call. Cycled per-session via `e.NextCallIndex(sessionID, "default")` (same pattern PPPPP1 uses for long-reply, GGGGG1 for big-log, RRRRR1 for diff). Closes the user's "whatever I write I always get the same text" feedback for the most-played-with scenario. Dangerous-path strings stay singular (different shape; one-and-done UX). Test `TestDefaultScriptCyclesIntroVariants`: two consecutive "read main.go" turns produce ≥2 distinct intro variants. Screenshot `QQQQQQQQ1_default_variants.png` shows both turns side-by-side in the conversation pane (println hello vs fmt.Println + greet() suggestions).

## Phase PPPPPPPP — Body Shift+Y yanks full conversation

- [x] **PPPPPPPP1.** New `Y` (shift+y) keybind in body focus copies the entire conversation as role-prefixed markdown — each message opens with `## <role>:` so blocks are grammatically separable when pasted into a bug report, another LLM, or a teammate. Complements plain `y` which takes just the selected message. New `fullConversationText(msgs)` helper skips messages with no copyable text (tool-only assistant turns, etc.) so the output stays clean. Empty-conversation case surfaces `nothing to copy — conversation has no text yet`. 2 new clipboard tests + help-overlay row. Existing `y` tests untouched.

## Phase OOOOOOOO — Sidebar y yanks session id

- [x] **OOOOOOOO1.** New `y` keybind in sidebar focus copies the currently-selected session's sess_xxx id to clipboard — useful for piping into `gact log <sid>`, `gact attach <sid>`, `gact rewind <sid>` etc. without re-typing a 32-char hash. Body-focus `y` still copies message text (KY3) — split on focus so the two yank flows don't collide. Transient hint confirms with `copied <sid> to clipboard`. Empty-selection case (selected = -1) prints a no-session toast instead of crashing. Help overlay gains a dedicated row. Two new clipboard tests. 

## Phase NNNNNNNN — Batch `gact detached --rm`

- [x] **NNNNNNNN1.** `gact detached --rm` now accepts a comma-separated list of session ids for batch cleanup — previously one sid per invocation. Trims whitespace around each entry so `--rm "sess_a, sess_b ,sess_c"` works the same as the tight form. Reports total count to stderr. End-to-end verified with 4-entry registry + `--rm "sess_drop1,sess_drop2,sess_drop3"` → "removed 3 entr(y/ies)", surviving entry intact.

## Phase MMMMMMMM — Terminal title reflects detached count

- [x] **MMMMMMMM1.** windowTitle now appends `[↩N]` when App.previouslyDetached has entries — always-visible reminder on the terminal tab/window title bar even when gact isn't focused. Combines naturally with the existing T1/U2 session-title + status suffix: `GACT — demo (running) [↩3]`. Hidden when N=0 so fresh installs stay clean. TestWindowTitle_AppendsDetachedCount covers empty / detach-only / stacks-with-session-title.

## Phase LLLLLLLL — Transient hint flicker fix

- [x] **LLLLLLLL1.** Root cause of residual footer flicker wasn't the SSE badge (already gated by DDDDD1) — it was the keystroke-clear in handleKey. A transient hint set by a background event (SSE reconnect outcome, session archive confirmation, plugin done, etc.) between two keystrokes got clobbered on the user's very next key, flashing for ~1 frame. Fix: new `transientHintMinDwell = 800ms` floor. Update() stamps `transientHintAt` via a deferred hook whenever transientHint changes to a new non-empty value and clears the stamp when transientHint empties. handleKey's blanket-clear now skips when age < min dwell so background-event hints get their full ~800ms read-time before any keystroke can wipe them. Test `TestTransientHint_KeystrokeRespectsMinDwell`: pre-dwell keystroke preserves hint, post-dwell keystroke clears it cleanly.

## Phase KKKKKKKK — `gact dashboard --sort`

- [x] **KKKKKKKK1.** `gact dashboard` now accepts `--sort newest|oldest|status|tokens|backend` (default: newest). "newest" puts the most-recently-updated row at the top so "what was I just working on?" answers itself. `sortSessions()` helper is a pure function on the slice so --watch reuses it per tick. Stable sort preserves backend order within tied keys. Unknown --sort values fail fast with a listing of accepted values (no silent undefined order). New `TestCLI_DashboardSort` end-to-end: creates older→newer sessions with intentional UpdatedAt spread, verifies default order + --sort oldest flip + unknown-sort rejection.

## Phase JJJJJJJJ — Sidebar detached-only toggle

- [x] **JJJJJJJJ1.** New `d` keybind in sidebar focus toggles a detached-only filter — mirrors the existing `h` archived toggle but filters locally against App.previouslyDetached (no backend refetch needed). `visibleSessionIndexes` now respects both the text filter and the new toggle; `ensureSelectedVisible` adjusts after toggle so the selection stays valid. Sidebar title becomes `SESSIONS · detached` when on so the narrower view is visible past the transient hint. Test `TestSidebar_DetachedOnlyToggle` covers: default=all-visible, toggle-on hides non-detached + shows suffix, toggle-off restores. Screenshots: `JJJJJJJJ1_sidebar_all.png` (5 sessions, 2 marked) and `JJJJJJJJ1_sidebar_detached_only.png` (filtered to the 2 walked ones).

## Phase IIIIIIII — `gact resume` alias

- [x] **IIIIIIII1.** New `gact resume` subcommand — discoverable alias for `gact attach` with no arguments. "resume" is the natural verb for "pick up where I left off" so users don't have to know the attach/no-args trick. Narrow by design: any trailing args are rejected with a usage hint pointing to `gact attach <sid>` for explicit session selection. Routes through `runAttach(nil)` so the same probe-and-skip-dead behaviour (FFFFFFFF1) applies. End-to-end verified against live emulator: seeds a session + registry, `gact resume` prints `attaching to most-recent detach: <sid> (<title>)` then boots the TUI.

## Phase HHHHHHHH — Sidebar session age suffix

- [x] **HHHHHHHH1.** Sidebar status line now appends `· Nm ago` (humanAgeShort helper — Ns/Nm/Nh/Nd scale) pulled from Session.UpdatedAt. No extra row — same 3-row layout per session, status line becomes e.g. `idle · 2m ago`. Zero UpdatedAt (backend hasn't filled it yet) shows status without the suffix so the row isn't a lie. Negative durations (clock skew) clamp to "now". Users can now see at a glance which sessions were actively touched vs stale — pairs well with ↩ markers for resume discovery. Test `TestSidebar_StatusLineShowsAge`: fresh=2m ago, stale=3d ago, zero-UpdatedAt has no "ago" suffix. Screenshot `screenshots/HHHHHHHH1_sidebar_age.png`.

## Phase GGGGGGGG — `gact detached --prune-dead` cleanup

- [x] **GGGGGGGG1.** New `--prune-dead` flag on `gact detached`: probes every entry, removes any whose probe came back negative, writes the survivors back to detached.json. `--prune-dead` implies `--probe` so the post-prune table also paints the alive column. Stderr prints `pruned N dead entr(y/ies); M alive remain` so the user can see what happened. Real one-shot cleanup workflow: `gact detached --prune-dead` after a backend restart leaves the registry consistent with what the backend actually has. End-to-end verified against live emulator: 2 dead + 1 live registry → after prune, file has only the live entry, footer shows "1 alive · 0 dead · 0 unprobed".

## Phase FFFFFFFF — Probe candidates before attaching

- [x] **FFFFFFFF1.** `defaultAttachTarget` now probes each candidate (newest-first) with a 2s GET against /v1/sessions/{sid} before returning. Stale entries (backend deleted the session, restarted, etc.) get skipped instead of crashing the TUI on the first request after attach. New `defaultAttachTargetWithProbe(probe func)` testable variant; production wraps with the real HTTP probe `probeSessionAlive`. When dead candidates are skipped before reaching a live one, stderr prints `attaching to <sid> (<title>) — skipped N dead entry(ies)`. When EVERY candidate is dead, returns `N detached entry(ies) on <backend> but none are still alive — gact detached --probe to inspect`. 5 unit tests now (3 prior + 2 new: skip-dead, all-dead). End-to-end against live emulator: 1-dead-1-live registry skips dead and attaches to live; all-dead prints the helpful error and exits 2.

## Phase EEEEEEEE — Empty-state resume hint

- [x] **EEEEEEEE1.** When no session is selected (fresh TUI start, deleted last session, etc.) AND App.previouslyDetached has entries, the empty-state callout now surfaces `↩ N detached session(s) on this backend — gact attach (no args) resumes the most recent` between the Press-Ctrl+N callout and the keys crib. Closes the discoverability loop: header chip + sidebar marker + dashboard column + empty-state hint + `gact attach` no-args + `gact detached` all read off the same registry. New unit test `TestEmptyState_DetachedResumeHint` (no hint when 0, "↩ 2 detached" when 2 entries match backend). Screenshot `screenshots/EEEEEEEE1_empty_state_resume_hint.png`.

## Phase DDDDDDDD — Header chip for detached count

- [x] **DDDDDDDD1.** Top header now carries a small `↩ N` chip (StatusBadge-style: theme Secondary bg + theme Bg fg, padded + bold) when the user has Ctrl+Z-walked-away sessions on this backend. Reads from App.previouslyDetached so the count stays consistent with the BBBBBBBB1 sidebar markers + CCCCCCCC2 dashboard column. Hidden when N=0 to avoid noise on a fresh install. Chip renders before the status badge so the eye groups them as a pair. New unit test `TestHeader_DetachedChip` (no chip when empty, "↩ 2" when two entries match the backend, cross-backend filtered out). Screenshot `screenshots/DDDDDDDD1_header_detached_chip.png` shows the chip + sidebar markers + sessions side by side.

## Phase CCCCCCCC — Detach UX polish (no-arg attach + dashboard marker)

- [x] **CCCCCCCC1.** `gact attach` with no arguments now picks the most-recent detached session for the current backend (resolved via the same env > config > built-in default precedence runTUI uses) and attaches there. Friction-killer for the common loop: `gact` → work → Ctrl+Z → `gact attach`. New `defaultAttachTarget()` reads detached.json, filters by backend, returns the newest sid (records are already sorted newest-first by LoadDetached). Empty/no-match prints a helpful error pointing to `gact detached` and Ctrl+Z. 3 unit tests cover (newest pick, no match, missing registry). End-to-end verified against the live emulator: stderr prints `attaching to most-recent detach: sess_… (title)` then connects.
- [x] **CCCCCCCC2.** `gact dashboard` (pretty + tsv) now carries a DET column with `↩` for sessions the user has previously Ctrl+Z-detached from on this backend. Same data source as the TUI sidebar (BBBBBBBB1) so dashboard ↔ TUI markers stay consistent. Column-width math switched to rune-count so the multibyte glyph doesn't widen the column. Soft-fails on missing/malformed registry — column just stays blank. End-to-end verified: detached row shows ↩, plain row shows blank. Existing TestCLI_Dashboard/Watch/StatusFilter still green.

## Phase BBBBBBBB — Detached-session sidebar marker + auto-prune

- [x] **BBBBBBBB1.** Sidebar now tags every session the user has previously Ctrl+Z-detached from with a small `↩` glyph. App.previouslyDetached map is seeded from the local detached.json registry at startup (filtered to the current backend so cross-backend entries don't leak). New `LoadDetachedRegistry([]DetachedRegistryEntry)` API on App + main.go wiring. Two-step `x/x` delete now prunes both the in-memory set and the on-disk registry via the new App.PruneDetachedRegistry callback so stale entries don't accumulate. Two new unit tests + screenshot `screenshots/BBBBBBBB1_detached_marker.png` showing one fresh + one marked session side-by-side. End-to-end VHS tape verified against live emulator.
- [x] **BBBBBBBB2.** `gact detached --probe` pretty output now sorts live sessions above dead ones (stable within each group preserves newest-first) and color-codes alive/dead via dependency-free ANSI (green/red/dim; TTY-gated so pipes stay clean). Footer summary `N alive · M dead · K unprobed` prints when probe ran. End-to-end verified with mixed-status registry against live emulator: alive-2 + alive-1 at top, DEAD-new + DEAD-old below.

## Phase AAAAAAAA — Detached-sessions registry + `gact detached`

- [x] **AAAAAAAA1.** New `tui/internal/config/detached.go` persists Ctrl+Z detach events to `detached.json` (sibling of config.json; honours `GACT_DETACHED_PATH`). Records: session_id + title + backend + workspace + detached_at. Dedupe by (backend, sid); trim to 64 most-recent. New `gact detached [--rm SID] [--probe] [--format pretty|tsv|json]` lists the registry; `--probe` GETs each session to mark alive/dead, `--rm` drops by sid across backends. App captures DetachedTitle + DetachedWorkspace alongside DetachedSessionID at Ctrl+Z; main.go appends after p.Run() returns. End-to-end verified through VHS tape (Ctrl+Z → JSON file → `gact detached` shows row, --probe = "yes" against live emulator). 5 new config tests, all green.

## Phase ZZZZZZZ — Body cursor visibility + visible-row snap

- [x] **ZZZZZZZ1.** Body cursor row now paints a `t.BgSubtle` background tint across the entire selected message (new `tintRowBg` helper that re-pads each line to width and fills with the theme's subtle bg) on top of the existing `█` Y1/FFFFF1 gutter. Cursor navigation (up/down/g/G/n/N + maybeInitBodyCursor) snaps past pairToolResults `absorbed[i]` indices via new `snapToVisibleMsg(idx, dir)` so the cursor always lands on a row the renderer actually paints — previously the cursor could land on an absorbed tool message, leaving no visible highlight (root cause of the user's "have not seen this, nor can I see it now" report). Screenshot `screenshots/ZZZZZZZ1_body_cursor_tint.png`. All `./internal/ui/` + `./` tests green (276s gact CLI suite).

## Phase TTTTTTT — Go claude-code adapter (stream-json direct)

Goal: reimplement the Python claude-agent-sdk sidecar in Go so the claude integration ships in a single binary — no Python / uv runtime dep. Same HTTP surface, same caps, same passing conformance.

- [x] **TTTTTTT1.** New adapters/claudecode/ Go module ships single-binary path. subprocess.go drives `claude` via stream-json; translate.go maps system/assistant/user/result frames + content blocks (text/thinking/tool_use/tool_result) to GACT shapes; server.go mirrors the Python sidecar surface. Real-LLM smoke 5.5s; `gact quick` against the live Go adapter returns the assistant reply with exit 0.
- [x] **TTTTTTT2.** captureCatalogs harvests tools/agents/slash_commands/mcp_servers from system/init; new endpoints serve tools/{id}, agents/{id}, commands, mcp/servers/{id}, metrics, sessions/{id}/export. caps.agents/commands/metrics/mcp=true. `gact conformance` against live Go adapter passes 14/14 — identical coverage to Python sidecar.
- [x] **TTTTTTT3.** Spawn args gain --permission-prompt-tool stdio so claude routes gated tools through the control protocol. handleControlRequest parks the request, broadcasts permission.requested + waiting_permission status, awaits POST /v1/permissions/{pid}, writes back control_response. New SPEC §6.11 endpoints. caps.permissions=true. Real-LLM smoke (~18s) drives a Write tool gating round-trip end-to-end.
- [x] **TTTTTTT4.** Streaming partials: spawn flag `--include-partial-messages` enables claude `stream_event` frames; translateStreamEvent maps Anthropic message_start → §7.4 message.created shell, content_block_start → message.part.added, content_block_delta(text_delta) → message.part.delta(text_append), content_block_stop → message.part.completed, message_stop → message.completed. sessionState.activeStreamMsgID threads the current msg id across deltas. Real-LLM smoke `TestSmoke_RealClaudeStreamingDeltas` (~5.7s) asserts ≥1 delta + added + completed via SSE. Python sidecar can now retire — Go adapter has full feature parity.
- [x] **TTTTTTT5.** translate.go.fileDiffForToolUse: Edit (with replace_all) + Write → sibling file_diff Part. claudeAssistantToGact threads cwd. New /v1/sessions/{id}/diffs + per-message endpoints. caps.diffs=true. `gact conformance` 16/16 against live Go adapter.

## Phase RRRRRRR — Goose tools catalog

- [x] **RRRRRRR1.** Wired GET /v1/tools + /v1/tools/{id} against Goose's /agent/tools?session_id=. firstSessionID() falls back when no query param. translate.go.toolToGact projects ToolInfo → GACT Tool. caps.tools=true. 2 unit tests + conformance now passes 11 sections (added Tools_List).

## Phase QQQQQQQ — Goose file_diff Parts

- [x] **QQQQQQQ1.** translate.go.fileDiffForToolRequest dispatches str_replace + write for developer__text_editor. messageToGact gained cwd param; threaded through all callers. New SPEC §6.10 endpoints: /diffs (aggregate) + /messages/{msg_id}/diffs (per-message). caps.diffs=true. 8 new tests + conformance still 8/8.

## Phase PPPPPPP — Goose docs refresh

- [x] **PPPPPPP1.** Goose adapter README replaced its 'scaffold' status block with a full endpoint feature table (every wired endpoint, what it does, conformance section count) + a Roadmap section. Root README adapter table now reads 'sessions/messages read+write + SSE; 8/8 conformance sections ✓' for Goose.

## Phase OOOOOOO — Goose POST messages + SSE

- [x] **OOOOOOO1.** Per-session subscriber map; POST /messages spawns runUpstreamReply goroutine that POSTs upstream /reply, parses SSE, calls translateMessageEvent, broadcasts to subscribers. GET /events writes SPEC §7.2 envelopes (event:/id:/data:) + 15s heartbeat. translate.go's translateMessageEvent maps all 7 Goose MessageEvent variants. caps.sse=true. Conformance now passes 8 sections (added Messages_Post + SSE).

## Phase NNNNNNN — Goose conformance test

- [x] **NNNNNNN1.** New conformance_test.go mirrors opencode/crush patterns. Caught a missing per-id message endpoint; added handleGetMessage. 6 sections green: Health, Capabilities, Workspaces, Sessions_List, Sessions_Get, Messages_List (with per-id drill). Goose adapter is now conformance-validated for every section it advertises.

## Phase MMMMMMM — Goose messages read

- [x] **MMMMMMM1.** Adapter now reads conversation from GET /sessions/{id} and projects it to GACT messages via translate.go's gooseMessage + contentToGactPart helpers. Handles tagged and untagged serde shapes. Variants: text, thinking, toolRequest, toolResponse with Ok/Err result wrapping. Synthesises stable ids when Goose omits Message.id. caps.messages=true. 4 new tests.

## Phase LLLLLLL — Goose adapter sessions wiring

- [x] **LLLLLLL1.** New translate.go holds gooseSession → gact.Session projection. GET /v1/sessions proxies + translates; GET /v1/sessions/{id} mirrors with upstream 404 → SPEC §6.0 envelope. caps.sessions=true. 4 new tests cover translation, 404 propagation, list loop. The TUI's sidebar populates with Goose sessions when pointed at a real goosed.

## Phase KKKKKKK — richer demo + next adapter

- [x] **KKKKKKK1.** screenshots/SDK-claude-tools.png shows the full agentic loop end-to-end against real Claude: USER prompt → Bash + Read + Edit tool calls → file_diff Part with red/green diff colors and `a/r` apply/reject hint inline → final assistant text. Tape: tui/screenshot_claude_sdk_tools.tape (caller pre-creates session + auto-allower for permission gates).
- [x] **KKKKKKK2.** New `adapters/goose/` Go module mirrors the crush/opencode pattern. Wired: health (probes upstream /health; healthy=false when goosed down), capabilities (workspaces=true, rest false), workspaces list/get. Tests use mocked Goose upstream. Added to go.work + Makefile. Root README adapter table updated.

## Phase JJJJJJJ — sidecar conformance gap-closing

- [x] **JJJJJJJ1.** Ran `gact conformance` against live sidecar; 4 sections were 404 (Sessions_Export, Commands_List, Metrics, Agents). All 4 wired to real SDK data: agents from data.agents, commands from data.slash_commands, metrics synthesized from state + cached usage, session export = session record + cached_messages. caps.agents/commands/metrics flipped true. Full GACT conformance suite now passes against live Claude (14 sections green; Diffs/Files auto-skip via cap=false).

## Phase IIIIIII — claude-agent-sdk session control + MCP

Goal: round out the sidecar with the operations the TUI's footer + catalog browser already have UI for.

- [x] **IIIIIII1.** POST /v1/sessions/{sid}/cancel routes to ClaudeSDKClient.interrupt(); SDK then yields ResultMessage(is_error=true) which the existing bridge already maps to session.status_changed:error. Also resolves any pending permission futures with deny so the SDK turn doesn't hang on a permission prompt mid-cancel. Idempotent on no-turn-in-flight. Real-LLM smoke (~500-word reply, cancel, assert idle/error within 30s) passes in 18s.
- [x] **IIIIIII2.** MCP catalog passthrough from SystemMessage(init).data.mcp_servers. Status enum mapped to SPEC §6.7 (connected→ready, needs-auth/failed→error, pending→connecting). Synthetic ids via _slug(name); raw SDK status preserved on x_claudecode_raw_status. Endpoints: GET /v1/mcp/servers, GET /v1/mcp/servers/{id}. capabilities.mcp=true. Real-LLM smoke (~4s) discovers 3 claude.ai connectors on this dev box and validates shape + per-id echo.

## Phase HHHHHHH — claude-agent-sdk permission flow

Goal: light up the TUI's `a/d/s/w` permission keys for SDK tool calls so `gact perms` and the inline banner work end-to-end.

- [x] **HHHHHHH1.** can_use_tool closure captures (Session, State); synthesises SPEC §6.11 PermissionRequest, parks asyncio.Future, broadcasts permission.requested + session.status_changed:waiting_permission. New endpoints: GET /v1/permissions[?session_id&status], GET /v1/permissions/{pid}, POST /v1/permissions/{pid} {action}. Capability permissions=true. Real-LLM smoke uses Write tool (Bash auto-allowed by SDK; only "dangerous" tools route through can_use_tool). 43 tests total.

## Phase GGGGGGG — claude-agent-sdk sidecar follow-ups

Goal: close out the sidecar's "Roadmap" section so capabilities the adapter advertises actually work, plus a UI proof.

- [x] **GGGGGGG1.** Wired `GET /v1/tools` (and `/v1/tools/{id}`) sourced from the SDK's first `SystemMessage(init)` data.tools. After one real turn, 33 tools discovered. 2 endpoint tests added.
- [x] **GGGGGGG2.** Visual proof shipped: `screenshots/SDK-claude-tui.png` shows the gact TUI rendering real Claude assistant replies via the sidecar. Surfaced + fixed two more bugs end-to-end (SSE CRLF mismatch in gact's parser; double-wrapped user-echo in post_message broadcast).
- [x] **GGGGGGG3.** Edit/Write ToolUseBlock now produces a sibling `file_diff` GACT Part. Pre-state read from disk (resolved against cwd); replace semantics match Anthropic's contract (single occurrence by default; replace_all=true does global). Language hint by extension. NotebookEdit skipped. 11 new tests including a real-LLM smoke that asks Claude to Edit a fixture file and asserts the file_diff rides alongside tool_call.
- [x] **GGGGGGG4.** include_partial_messages=True; bridge.stream_event_to_events translates Anthropic streaming protocol → GACT §7.4 partials (message_start→message.created shell, content_block_start→message.part.added, content_block_delta(text_delta)→message.part.delta, content_block_stop→message.part.completed, message_stop→message.completed). Final AssistantMessage still emits message.created which replaces streamed-in shell by id. Real-LLM smoke (`test_smoke_stream.py`) asks for 3-sentence reply, asserts ≥1 delta with valid SPEC payload — passes in ~5s. 39 tests total (was 31).

## Phase DDDDDDD — claude-code / Claude Agent SDK adapter (SUPERSEDED by EEEEEEE1)

Decision (2026-04-19): originally a Go adapter that would spawn `claude --output-format stream-json` directly. User rejected the all-Go approach — they explicitly wanted the Python `claude-agent-sdk` library (which is what they have configured). Phase EEEEEEE1 ships the Python sidecar instead. The Go scaffold was deleted and these tasks are obsolete.

- [x] ~~**DDDDDDD1.**~~ Superseded — see EEEEEEE1.
- [x] ~~**DDDDDDD2.**~~ Superseded — sidecar has session table + per-session ClaudeSDKClient.
- [x] ~~**DDDDDDD3.**~~ Superseded — sidecar's POST /messages spawns SDK turn in background, caches result.
- [x] ~~**DDDDDDD4.**~~ Superseded — sidecar's SSE handler emits message.created + session.status_changed + heartbeats.
- [x] ~~**DDDDDDD5.**~~ Superseded — sidecar's smoke test hits real Claude Code in ~4s; no need for a mocked CLI.

## Phase EEEEEEE — claude-agent-sdk Python sidecar

- [x] **EEEEEEE1.** New module `adapters/claude-agent-sdk-server/` (uv project, FastAPI, sse-starlette). Per-session ClaudeSDKClient held across HTTP requests. Bridge translates SDK dataclasses → GACT v0.1 wire envelopes. Wired endpoints: health, capabilities, workspaces list/get, sessions create/list/get/delete, messages post/list/get, SSE. 18 tests passing including a real-LLM smoke test against actual OAuth. Verified end-to-end: `gact quick "say hi in two words"` returns "Hi there", exit 0. Surfaced + fixed two real bugs (Message.model needed ModelRef wrapping, missing DELETE) that mocked tests would have hidden.

## Phase CCCCCCC — release polish

Goal: README + screenshots + install infra ready for the public.

- [x] **CCCCCCC1.** Added MIT `LICENSE` at repo root. Sole author; MIT matches Go ecosystem norm.
- [x] **CCCCCCC2.** Slimmed root README from 340→~110 lines; long-form moved to `docs/FEATURES.md`; License + Go-version badges; adapter table now lists all three backends.
- [x] **CCCCCCC3.** Added Install + `go install` sections to opencode + crush READMEs. Each links back to root README's TUI install.

## Phase AAAAAAA — conformance: tasks POST title echo

- [x] **AAAAAAA1.** Mirror of YYYYYY1 for tasks: extends `checkTasks`'s POST step to also assert the response carries back the `title` field we sent. Catches adapter authors that drop fields on the way through (a silent half-create where you get the id but lose the metadata). Read-write but the trailing DELETE keeps the suite idempotent. NB: phase prefixes rolled from 6-letter (ZZZZZZ) to 7-letter (AAAAAAA) here — same convention the project used at ZZZZZ → AAAAAA.

## Phase ZZZZZZ — conformance: policies post-PUT GET round-trip

- [x] **ZZZZZZ1.** Strengthens `checkPolicies` (already had PUT echo check) with a `GET /v1/policies` after the PUT to verify the rule actually persisted to the underlying store. Catches adapter authors whose PUT echoes the request body 200 OK but never writes — same bug pattern as YYYYYY1's post-create hook list check.

## Phase YYYYYY — conformance: hooks deeper validation

- [x] **YYYYYY1.** Strengthens `checkHooks` (already had POST/GET/DELETE shape) with two more assertions that catch a real adapter bug pattern from the MMM3 era: (1) POST response must echo `event` and `command` back — adapter authors that drop fields on the way through return 200 + an id but lose the configuration. (2) GET list immediately after POST must include the new hook by id — catches adapters that 200 the POST but never persist the row to the catalog. Read-write but the cleanup DELETE removes the test hook so the suite stays idempotent across runs.

## Phase XXXXXX — conformance: README refresh round 2

- [x] **XXXXXX1.** Brings the conformance README's "What it checks" table up to date with the QQQQQQ1..WWWWWW1 additions/tightenings. New rows: Sessions_Export (RRRRRR1), Context_Files (UUUUUU1), Repo_Map (UUUUUU1), Messages_Search (QQQQQQ1). Updated rows: Capabilities (SSSSSS1 — semver-ish + bool-typed cap values), Tasks (TTTTTT1 — PATCH + enum), Files (VVVVVV1 — per-file body endpoint), SSE (WWWWWW1 — occurred_at + id strictness).

## Phase WWWWWW — conformance: SSE occurred_at + id strictness

- [x] **WWWWWW1.** Strengthened `validateSSEEvent` (NNNNNN1 added envelope shape) with two more SPEC §7.2 envelope rules: (1) `data.occurred_at` must be present and parseable as RFC3339 — empty timestamp defeats client-side ordering and dedup; (2) if `id:` line is present, it must be non-empty — an empty id: breaks Last-Event-ID resumption (clients can't tell whether to resume from "" or skip). The id: check is gated on presence (SSE transport doesn't require it even though §7.2 documents a "monotonic event id"); occurred_at is unconditional since it's in the documented data envelope.

## Phase VVVVVV — conformance: file read endpoint

- [x] **VVVVVV1.** Extended `checkFiles` (already had list-shape coverage from UUUUU1) with the per-file body endpoint per SPEC §6.9: `GET /v1/workspaces/{id}/files/read?path=<p>`. Picks the first entry with `type=file` from the list, fetches it, asserts 200 + non-empty body. Adapter authors that wired the tree but forgot the body endpoint break the @-file picker preview + `gact files read` at runtime; this catches it at conformance time. Read-only.

## Phase UUUUUU — conformance: context files + repo_map

- [x] **UUUUUU1.** Adds two more SPEC §6.9 sections to the conformance suite, both gated on `capabilities.files`: (1) `Context_Files` (sid required) — `GET /v1/sessions/{id}/context/files` asserts 200 + non-nil `files` array + per-entry {path, mode} with mode in {edit|read|pin} enum. (2) `Repo_Map` (wsID required) — `GET /v1/workspaces/{id}/repo_map` asserts 200 + non-nil `tree` + `tokens` keys (specific tree shape stays per-backend; only the envelope is enforced). Both read-only — never POST/PATCH/DELETE so they stay idempotent against the live session/workspace. Adapter authors that don't claim `caps.files=true` auto-skip via the cap gate.

## Phase TTTTTT — conformance: tasks PATCH + status enum

- [x] **TTTTTT1.** Extended `checkTasks` (already had POST/GET/DELETE round-trip) with `PATCH /v1/tasks/{id}` per SPEC §6.18. Flips the created task to `status=running`, asserts 200 + id echoed back + status=running echoed + status in the documented enum (`pending|running|completed|failed`). Catches adapter authors that wired POST/GET/DELETE but forgot PATCH (which the TUI's task panel uses for in-place status flips).

## Phase SSSSSS — conformance: capabilities deeper validation

- [x] **SSSSSS1.** Strengthened `checkCapabilities` from "fields present" to "fields well-formed". (1) `contract_version` must look like a real semver-ish version (currently 0.x or 1.x) — catches accidents like `"contract_version": "GACT"` or empty-after-trim. (2) Every capability value must be a JSON bool — adapter authors that emit `"hooks": "yes"` or `"files": null` would silently downgrade to false in cap-gating logic; this catches it at the wire. Forward-compat carve-out: vendor-prefixed keys (`x_<vendor>_<flag>`) may be any JSON value. Catches a category of adapter regressions that the looser shape check would have let through.

## Phase RRRRRR — conformance: session export

- [x] **RRRRRR1.** Adds a `Sessions_Export` section that walks `GET /v1/sessions/{id}/export` (SPEC §6.2) after Messages_List. Asserts 200 + Content-Type starts with `application/json` + body parses as JSON. Specific exported shape stays per-backend (SPEC says "session blob" without locking the field set), so we only assert validity — just enough that `gact export` and `gact import` can round-trip without a 501 hiding in the middle. Read-only. New `Options.SkipSessionExport` opt-out wired through TestConformance_OptionsSkip plus both opencode + crush adapter conformance tests (neither implements export today).

## Phase QQQQQQ — conformance: messages search

- [x] **QQQQQQ1.** Adds `Messages_Search` section to the conformance suite (gated on `capabilities.search_messages` AND a non-empty session id). Walks `GET /v1/sessions/{id}/messages/search?q=hello&limit=5`. Asserts 200 + non-nil top-level `matches` array (empty list is fine — the seed message may not match the query; missing key violates spec). When matches are present, each must carry the documented {message_id, snippet} pair with non-empty message_id. Locks the wire shape that powers the @-search palette and `gact search`. Read-only. Adapter authors that don't implement search advertise `search_messages=false` and auto-skip via the cap gate. New `Options.SkipMessageSearch` opt-out.

## Phase PPPPPP — conformance README refresh

- [x] **PPPPPP1.** The conformance suite's README table was 7 sections behind reality (only Health/Capabilities/Workspaces/Sessions_List/Sessions_Create/Messages_Post/SSE were listed). Brings it up to the current 14 sections + per-id drill-downs, organized into "always-on" (non-cap-gated) vs "capability-gated" with the gating capability named explicitly for each. Each row points at the phase code that introduced or extended it (BBBBBB1, CCCCCC1, DDDDDD1, EEEEEE1, FFFFFF1, GGGGGG1, HHHHHH1, IIIIII1, JJJJJJ1, KKKKKK1, LLLLLL1, MMMMMM1, NNNNNN1) so the git history stays navigable from the docs.

## Phase OOOOOO — adapter conformance follow-ups

- [x] **OOOOOO1.** After adding 13 conformance sections (BBBBBB1..NNNNNN1) this run, adapters needed catch-up. Opencode now implements `GET /v1/workspaces/{id}` (synthetic single-workspace echo, returns 404 on id mismatch) so the §6.1 per-id drill stops returning 501. Both opencode + crush conformance tests now set `SkipAgents: true` since neither adapter proxies /v1/agents (no upstream concept). Mock upstream for opencode gains a /path handler so the new GetWorkspace handler can resolve. All adapter conformance subtests pass: Health, Capabilities, Workspaces, Sessions_List, Sessions_Get, Messages_Post, Messages_List, SSE.

## Phase NNNNNN — conformance: SSE envelope validation

- [x] **NNNNNN1.** Strengthened `checkSSE` from "first `data:` line received" to "first complete event matches SPEC §7.2 envelope": (1) `event:` line is present, (2) `data:` line parses as JSON with a `type` field, (3) `data.type` matches the `event:` value (the redundancy is per spec — clients can read whichever they prefer; the conformance suite locks both in sync). New `validateSSEEvent` helper reads up to the first `\n\n` delimiter and runs the assertions. Specific event types and payload shapes stay per-backend; we only enforce the envelope shape.

## Phase MMMMMM — conformance: metrics deeper validation

- [x] **MMMMMM1.** Strengthened `checkMetrics` from "uptime_s present" to "full top-level envelope present per SPEC §6.16": {sessions, messages, tokens} must each be a JSON object (not just a present-but-null key); sessions+messages must carry `total`; tokens must carry input_total + output_total. Specific values stay unchecked (operational and change per request) but the structural presence is locked so the metrics tab can render row totals without a nil dereference. Adapter authors that emit only uptime_s now get caught here.

## Phase LLLLLL — conformance: MCP resources + prompts coverage

- [x] **LLLLLL1.** Extended `checkMcp`'s per-server drill (JJJJJJ1 added /tools) with the remaining read-only MCP catalog endpoints per SPEC §6.7: (1) `GET /v1/mcp/servers/{id}/resources` — non-nil `resources` array, each entry with non-empty uri; (2) `GET /v1/mcp/servers/{id}/prompts` — non-nil `prompts` array, each entry with non-empty name. Adapter authors that wired only servers + tools missed both of these MCP catalog surfaces (used by the slash-command palette and the @-resource picker). Read-only — never POSTs to /resources/read or /prompts/get.

## Phase KKKKKK — conformance: providers per-id drill-down

- [x] **KKKKKK1.** Extended `checkProviders` (already had per-provider /models drill) with the missing `GET /v1/providers/{id}` detail endpoint. Per SPEC §6.12, adapter authors that wired only the list + models endpoints had a silent gap on the per-provider detail. Per-id response must echo the same id back and have a non-empty `name`. Read-only.

## Phase JJJJJJ — conformance: MCP per-server drill-down

- [x] **JJJJJJ1.** Extended `checkMcp` (existing list-shape coverage) with two per-server drills for the first server in the list (when present): (1) `GET /v1/mcp/servers/{id}` — detail endpoint, must echo id back; (2) `GET /v1/mcp/servers/{id}/tools` — tools listing per server, must have non-nil `tools` array with each entry carrying a non-empty id. Both required by SPEC §6.7. Catches adapters that wired only the list endpoint — the per-server detail + tools listing were silent gaps before. Read-only.

## Phase IIIIII — conformance: messages list + per-id drill-down

- [x] **IIIIII1.** Adds a `Messages_List` section that walks `GET /v1/sessions/{id}/messages` (SPEC §6.3) plus per-id drill into `GET /v1/sessions/{id}/messages/{msg_id}` for the first entry. Asserts 200 + non-nil top-level `messages` array (empty is fine; missing key violates spec) + per-entry required {id, role, parts} with `role` in the documented enum (user|assistant|system|tool). For the first message, drills into the per-id endpoint and verifies id is echoed back. Locks the wire shape that powers `gact log` and the conversation pane's history fetch. Read-only. New `Options.SkipMessageList` opt-out wired through TestConformance_OptionsSkip.

## Phase HHHHHH — conformance: sessions per-id drill-down

- [x] **HHHHHH1.** Adds a `Sessions_Get` section that walks `GET /v1/sessions/{id}` after the existing Sessions_Create (or pinned via `Options.SessionID`). Asserts 200 + id echoed back + non-empty status (sessions always carry a lifecycle state per the Session schema). Skips when no sid is available — the caller already gates on that. Catches adapters that wired only the list/create endpoints and forgot the per-id read. Read-only.

## Phase GGGGGG — conformance: workspaces per-id drill-down

- [x] **GGGGGG1.** Mirror of EEEEEE1/FFFFFF1 for workspaces. Extended `checkWorkspaces` to drill into `GET /v1/workspaces/{id}` for the first workspace in the list (when present). Per-id response must echo the same id back and have a non-empty root_path (a workspace without one is not a workspace). Catches adapters that wired only the list endpoint — the SPEC §6.1 promise of per-id reads was a silent gap before. Read-only.

## Phase FFFFFF — conformance: agents per-id drill-down

- [x] **FFFFFF1.** Mirror of EEEEEE1 for agents. Extended `checkAgents` to drill into `GET /v1/agents/{id}` for the first agent in the list (when present). Per-id response must echo the same id back and have non-empty source/title — same shape as a list entry per SPEC §6.5. Catches adapters that wired only the list endpoint. Read-only.

## Phase EEEEEE — conformance: tools per-id drill-down

- [x] **EEEEEE1.** Extended `checkTools` to assert each list entry carries the required {id, name} pair (SPEC §6.6 + §4.6) and to drill into `GET /v1/tools/{id}` for the first tool in the list. Per-id response must echo the same id back and have a non-empty name. Catches a missing per-id endpoint at conformance time — adapter authors that wired only the list got a silent gap before. Read-only.

## Phase DDDDDD — conformance: Agents section

- [x] **DDDDDD1.** Adds an `Agents` section to the conformance suite (no capability gate — agents read is always available per SPEC §6.5; backends with a totally different agent model can SkipAgents). Walks `GET /v1/agents`. Asserts 200 + non-nil top-level `agents` array (empty list is fine; missing key violates spec) + per-entry required {id, source, title} with `source` in the documented enum (builtin|user|recipe|skill). Locks the wire shape that powers the Settings → Agent picker (ListAgents → settingsLoadedMsg) and `gact agents list`. Read-only — never POSTs. New `Options.SkipAgents` opt-out wired through TestConformance_OptionsSkip. TestCLI_Conformance updated to require the new section name. Confirmed against the emulator: `▶ Agents ✓ Agents PASS`.

## Phase CCCCCC — conformance: per-message Diffs section

- [x] **CCCCCC1.** Adds a `Messages_Diffs` section to the conformance suite (gated on `capabilities.diffs` AND a non-empty session id). Lists session messages, picks the first id, walks `GET /v1/sessions/{id}/messages/{msg_id}/diffs`. Asserts 200 + non-nil `diffs` array + same per-entry file_diff shape as BBBBBB1 (path required + non-empty, applied bool-typed, language string|null when present). Skips quietly when the session has no messages yet — listing returns empty so there's nothing to drill into. Read-only — never POSTs to apply/reject. Locks the wire shape that powers per-turn diff drill-down (Ctrl+E from a tool_result row). New `Options.SkipMessageDiffs` opt-out. TestCLI_Conformance updated to require the new section name. Confirmed against the emulator: `▶ Messages_Diffs ✓ Messages_Diffs PASS`.

## Phase BBBBBB — conformance: Diffs section

- [x] **BBBBBB1.** Adds a `Diffs` section to the conformance suite (gated on `capabilities.diffs` AND a non-empty session id). Walks `GET /v1/sessions/{id}/diffs`: asserts 200, top-level `diffs` array present (non-nil), and each entry carries the file_diff shape from SPEC §5.4 — required `{path, applied}` (with `applied` bool-typed, `path` non-empty), optional `language` typed as string|null when present. Read-only — never POSTs to `/diffs/apply` or `/diffs/reject`, so it stays idempotent against the live session. Locks the wire shape that powers `gact diff` and the conversation pane's a/r apply/reject keys. New `Options.SkipDiffs` opt-out for adapters that don't surface diffs. Adapters that don't claim `diffs=true` auto-skip via the cap gate. TestCLI_Conformance updated to require the new section name. Confirmed against the emulator: `▶ Diffs ✓ Diffs PASS`.

## Phase ZZZZZ — input newline copy honest about Shift+Enter terminal-fold

- [x] **ZZZZZ1.** User feedback: Shift+Enter still doesn't insert a newline despite earlier work. Root cause is terminal-side: many terminals fold Shift+Enter to plain Enter unless they negotiate kitty/modifyOtherKeys protocol — there's nothing the application can do to make a terminal send modifiers it isn't sending. Fix is to be honest in the copy: placeholder now leads with the always-works `\<Enter>` option ("type a message — Enter to send · `\<Enter>` for newline (Shift+Enter on supporting terminals)"). Help-tab Input section reorders to put `\<Enter>` first ("always works — Claude-Code style") with Shift+Enter / Alt+Enter / Ctrl+J grouped as "terminal-dependent". The keybinding code is unchanged (already accepts all three) — only the user-facing text is updated. Also folded the YYYYY1 paste-threshold change into the help-tab text: "Paste ≥ N lines" instead of the previously hard-coded ≥3. Help-overlay golden regenerated.

## Phase YYYYY — Settings TUI tab: paste-compress + intro splash toggle

- [x] **YYYYY1.** User feedback: "your settings are very shallow still" — paste auto-compress threshold (the `≥3 lines` hint they saw in the empty state) and intro splash on/off should be Settings rows, not hard-coded constants. Two changes wire the existing config plumbing through to user-controllable rows: (1) added `Theme.PasteCompressThreshold` (defaults to 3) + `config.Config.PasteCompressThreshold` (already had `IntroSkip` from JJJ1, just needed surfacing). (2) added `App.IntroDisabled` field that mirrors the resolved `IntroSkip` state at startup. Bumped `tuiPrefsRowCount` to 5; rows 3+4 are paste-compress (◀ N lines ▶, clamped to 2..20) and intro splash skip (◀ on / off ▶ boolean toggle). Both persist via `persistPrefs` to `config.json` so they survive across launches; CLI flags (`--no-intro`, env vars) still win as overrides at startup. `gact emit-config` sample updated to include `paste_compress_threshold`. Rendering of multi-line pastes in the input now reads `Theme.PasteCompressThreshold` instead of the hard-coded 3. New unit test covers row 3/4 ←/→ behavior, clamping, boolean flip, cross-talk-free with row 0. Screenshot: `screenshots/YYYYY1_settings_paste_intro.png`.

## Phase XXXXX — tool output Claude-Code-grade contrast

- [x] **XXXXX1.** User feedback: "could we get the output not just elbow bended, but maybe on a slightly different color or something" — comparing GACT's tool_result rendering unfavorably to Claude Code's. Two changes to render.go's PartTypeToolResult path: (1) body text uses `Foreground(t.Fg)` (full bright) instead of `Foreground(t.FgMuted)` so log output reads as content not annotation; (2) continuation indent renders ` │ ` styled in `RoleTool` color (yellow) instead of plain spaces, so a colored vertical bar runs the full height of the output block, anchoring it visually under the call. The `⎿` glyph stays on the first line. Errors keep red (Danger) for both glyph and bar. Existing TestRenderPart_ToolResultLeadingGlyph relaxed to accept either the new ` │ ` shape or the legacy `   ` shape (both keep content at column 3 with leading whitespace). Help-overlay golden regenerated. Screenshot: `screenshots/XXXXX1_tool_output_contrast.png`.

## Phase WWWWW — body cursor follows ↑/↓ scroll

- [x] **WWWWW1.** User feedback: "now i do see the cursor on the selected segment but when i press up the window scrolls but the cursor remains there" — scrollOffset moved on ↑/↓ but bodySelMsgIdx didn't, leaving an orphan marker offscreen. Rebound up/down/k/j in handleBodyKey to behave like N/n: walk the cursor through messages and let `scrollToSelectedMessage` keep it visible. g/G now jump cursor to first/last (not raw scroll). PgUp/PgDn/Ctrl+U/Ctrl+D added to handleBodyKey for the within-message use case (raw page scroll, cursor stays put). First press on an unset cursor seeds it (up = latest, down = first) — composes with FFFFF1's maybeInitBodyCursor. Help-tab text refreshed: "↑/↓ · j/k move message cursor (▌ gutter; cursor stays visible)" + dedicated PgUp/PgDn line. Two new unit tests cover the cursor walk + the seeding semantics. Goldens regenerated for the help-tab text shift. Screenshot: `screenshots/WWWWW1_cursor_follows_scroll.png` (cursor visible on USER message at top after 4× ↑).

## Phase VVVVV — input prompt `>` only on first row

- [x] **VVVVV1.** User feedback: "i do not like the > on > fdshfjkdshjflkdsf | > fdkjfkdsjfdskf | >" — the textarea's `Prompt = "> "` was applied to every visible row, so multi-line input got an ugly chevron column. Switched to `SetPromptFunc(2, …)` rendering `> ` on row 0 and `  ` (two spaces) on continuation rows. Width matches so the cursor column doesn't shift. Golden snapshots regenerated for the 7 view fixtures whose input region now has the new prompt shape. Screenshot: `screenshots/VVVVV1_prompt_first_row_only.png` showing 3-line input with single `>` on top row.

## Phase UUUUU — conformance: Files section

- [x] **UUUUU1.** Adds a `Files` section to the conformance suite (gated on `capabilities.files` AND a non-empty workspace id). Walks `GET /v1/workspaces/{id}/files`: asserts 200, top-level `entries` array present, and each entry carries `path` + `type` with type in the `file|dir` enum. Locks the wire shape that powers `gact files list`, the @-file picker (M6), and `gact repo-map`'s tree view. Read-only — doesn't fetch file bodies, so it stays decoupled from fixture content. New `Options.SkipFiles` opt-out. Adapters that don't claim `files=true` auto-skip via the cap gate. TestCLI_Conformance now requires the new section name. Confirmed against the emulator: `▶ Files ✓ Files PASS`.

## Phase TTTTT — conformance: Providers section

- [x] **TTTTT1.** Adds a `Providers` section to the conformance suite (gated on `capabilities.providers`). Walks `GET /v1/providers` and per-provider `GET /v1/providers/{id}/models`: asserts 200, top-level `providers`/`models` arrays present, and each entry carries the required `id` + `name` fields. Locks the wire shape that powers Settings → Model tab, `gact models list`, and the model-pick palette items. New `Options.SkipProviders` opt-out for adapters that don't proxy `/v1/providers` (crush + opencode both auto-skip via the capability gate since they don't claim providers=true). TestCLI_Conformance now requires the new section name. Confirmed against the emulator: `▶ Providers ✓ Providers PASS`.

## Phase SSSSS — subagent scenario variants

- [x] **SSSSS1.** Closes the variant arc — every rich scenario family (default, big tool, long, multi-tool, diff, subagent) now produces per-turn variety. `runSubagentScript` cycles through `subagentVariants` per session via `NextCallIndex`. Three variants spawn three different agent identities so repeat "spawn a subagent" turns feel like distinct delegations: code_reviewer (preserved), security_auditor (HIGH/MEDIUM/LOW JWT findings), perf_profiler (3-hot-spot pprof attribution with measured impact). Each variant has its own thinking line, intro, prompt, sub-body, summary, and parent followup. New unit test sends three "spawn subagent" turns, asserts ≥3 subagent_call parts emit with 3 distinct agent_ids, and that both security_auditor + perf_profiler fire across the run (order-agnostic).

## Phase RRRRR — diff scenario variants

- [x] **RRRRR1.** Closes the four-scenario-family arc (bigtool/long/multi-tool now diff). `runDiffScript` cycles through `diffVariants` per session via `NextCallIndex`. Three variants spanning three languages: existing Go logging swap (variant[0], preserved); Python try/except + structured logging around a network call (variant[1]); JS callback-chain → async/await refactor (variant[2]). Each variant has its own intro narration. Different (path, language) pairs per variant exercise the diff renderer's syntax-hint path through Go, Python, and JS lexers. New unit test sends three "propose an edit" turns, asserts ≥3 file_diff parts emitted, all three (path, language) pairs distinct, and that both python + js variants fire across the run (order-agnostic since ListMessages is newest-first).

## Phase QQQQQ — multi-tool scenario variants

- [x] **QQQQQ1.** Mirrors GGGGG1/PPPPP1 for the multi-tool path. `runMultiToolScript` cycles through `multiToolVariants` per session via `NextCallIndex`. Three variants: existing read_file/grep/edit_file refactor flow (variant[0], preserved for back-compat with existing test); a new psql/psql/go-vet schema-migration check (variant[1]); a go-test/grep/go-test failing-test triage flow (variant[2]). Each variant has its own intro + followup. New unit test sends two "many tools" turns and asserts (a) different tool-call sequences fire across the turns (variant cycle works) and (b) the union covers both `shell` (variant[1]) and `read_file` (variant[0]) tool names. Order-agnostic since `ListMessages` is newest-first. Existing `TestRichScripts_MultiTool` still passes against variant[0]'s 3-tool shape.

## Phase PPPPP — long-reply scenario variants (cycle for cursor demo)

- [x] **PPPPP1.** Mirrors GGGGG1 for the long-reply path. `runLongScript` now picks from `longReplyVariants` per session via `NextCallIndex`. Three distinct writeups: existing rendering-strategy memo (variant[0], unchanged so TestRichScripts_LongReply still passes), a new request-lifecycle architecture trace (variant[1]), a profiling-triage runbook (variant[2]). Each variant has its own opening "thinking" line. New unit test sends three "long writeup" turns, asserts all three text bodies are distinct and that variant[1]/variant[2] markers ('## Request lifecycle' / '## Profiling triage') both appear. Pairs with FFFFF1: cursor-aware Ctrl+E now has two scenario families (bigtool + long) that produce real variety so users can demo the cursor against multiple bulky outputs.

## Phase OOOOO — gact perms list --format json

- [x] **OOOOO1.** `gact perms list <sid> --format json` returns the raw `[]PermissionWire` array including the full `tool_call` payload (tool_name + input args + annotations) — info that the TSV view drops because it only shows id/status/action/summary. Useful when scripting "did the agent ever try to delete /etc/* in this session?" against the structured payload. Default tsv preserved (TestCLI_Perms relies on it). Empty list serializes as `[]` not `null`. Unknown format → exit 2 client-side. CLI test triggers the `delete` permission scenario, asserts JSON parses with the expected ToolCall.input.command field, default tsv still works, unknown format exits 2.

## Phase NNNNN — gact info --include perms

- [x] **NNNNN1.** Closes the explicit OOOO1 follow-up: `gact info --include perms` adds a section for every permission request the session has seen (pending + resolved). Works in both text mode (TSV-ish `status<TAB>id<TAB>summary [action=…]` rows under `--- perms ---`) and JSON mode (wrapped as `perms` array on the top-level result object alongside session/tasks/hooks). Composes with the existing tasks/hooks tokens. Unknown --include token still exits 2 client-side. CLI test triggers the `delete` permission scenario, asserts the pending row appears in both modes, then resolves with deny and asserts `resolved` + `action=deny` surface in the next render.

## Phase MMMMM — gact env --format json

- [x] **MMMMM1.** `gact env --format json` emits a single object with the resolved config (backend_url, theme, voice_cmd, intro_file, config_path, plugins_dir) plus a nested `env` object containing every `GACT_*` variable. Default tsv preserved for back-compat with diag bundle scripts. Unknown format → exit 2. CLI test parses the JSON, asserts both config and env nested fields round-trip the values set via test env.

## Phase LLLLL — Settings TUI tab: cost-warn / cost-danger token thresholds

- [x] **LLLLL1.** Closes part of feedback_tui_ux_direction item 6 ("Settings modal is thin"). The TUI tab had only one editable knob (collapse threshold) — now also has cost-warn and cost-danger token thresholds. Both already existed in `Theme` and were used by the footer cost chip color logic; just weren't surfaced in the picker. Bumped `tuiPrefsRowCount` from 1 to 3, added `costStep` (25_000) / `costMin` (1_000) / `costMax` (1_000_000) constants, refactored render path through a shared `editableRow` helper so all three rows render identically. ←/→ on each row clamps independently against its own range. New unit test asserts: row 1 ←/→ moves warn but not danger; row 2 moves danger; bounds at costMin/costMax; row 0 still only touches collapse threshold (no cross-talk). Existing collapse-threshold test unchanged. Screenshot: `screenshots/LLLLL1_settings_tui_costs.png`.

## Phase KKKKK — empty-state hints surface session-lifecycle keys

- [x] **KKKKK1.** Closes the discoverability gap from feedback_tui_ux_direction item 7 ("user asked 'can I rename, delete, hide sessions?' — all three work but the user didn't know"). The empty-state crib (the only thing visible before the first message lands) was the right place for these hints, not the help overlay (which the user might never open). Expanded the in-sidebar block from 3 entries (n, x, ↑/↓) to 7 (added e=rename, A=archive, h=toggle archived view, /=filter, o=attach context). Also surfaced Ctrl+Z as the new tmux-like detach (IIIII1) so users see the reattach hint before they need it. Help-overlay golden regenerated for the layout shift. Screenshot: `screenshots/KKKKK1_empty_state_hints.png`.

## Phase JJJJJ — Ctrl+C cancels in-flight turn before quit

- [x] **JJJJJ1.** Pairs with IIIII1 to give the user the two halves they asked for: Ctrl+Z is "leave it running" (clean detach + reattach hint), Ctrl+C is "stop everything". Previously Ctrl+C just cancelled the SSE stream and quit — leaving the backend churning on the in-flight turn the user just abandoned. Now Ctrl+C also fires `cancelCmd(c, sid)` when the current session's status is `running` or `waiting_permission` (idle sessions skip — no in-flight work to cancel, and a redundant POST would just add backend log noise). Both commands are run via `tea.Batch(cancel, tea.Quit)` so the cancel posts before the program tears down. Two new httptest-backed unit tests: running session → 1 POST /cancel; idle session → 0 POSTs. Help-tab entry refreshed: `Ctrl+C   quit (cancels in-flight turn before exit)`. Help-overlay golden regenerated.

## Phase IIIII — tmux-like detach: clean exit + reattach hint

- [x] **IIIII1.** Replaced LLL8b's SIGTSTP-suspend Ctrl+Z with a clean tmux-like detach. User explicitly said the previous "leveraging the linux background execution is just cheap" — losing the session if the terminal closed defeated the point. Now Ctrl+Z stamps `App.DetachedSessionID` with the current sid + returns `tea.Quit`; main.go reads the field after `p.Run()` returns and prints `Detached. Reattach with: gact attach <sid>` to stderr. Backend session keeps running by design (sessions are server-side state); KKK1's `gact attach <name|sid>` already exists for the reattach side. Help-tab entry refreshed: `Ctrl+Z   detach (TUI exits; \`gact attach <sid>\` reattaches)`. Two new unit tests: detach with a current session stamps the sid; detach with no session stamps empty (no spurious hint). Old `TestUpdate_CtrlZSuspends` rewritten as `TestUpdate_CtrlZDetachesCleanly`. Help-overlay golden regenerated. Follow-ups (not in this phase): Ctrl+C cancel-on-quit (kill the running turn before exiting); session listing surface enhancement (`gact list --running` already exists via WWWW1's --status filter).

## Phase HHHHH — unified `/tools` menu (built-in + MCP)

- [x] **HHHHH1.** `/tools` is now the single entry point for the user's "tools and mcps were meant to be the same menu, not a separation" feedback. The catalog browser kind=catalogKindTools loader: (1) sorts by (source, name) so MCP-sourced tools cluster together, (2) tags each row with its source (`builtin`/`mcp`/`recipe`/`extension`) via `statusTag`, (3) prepends `from <server-id>` to the description for MCP rows so the originating server is visible inline. Title now reads `Tools (built-in + MCP)`. Added `/catalog` as an alias slash command for the same view (back-compat: `/tools` still works). `/mcp` kept as a server-management view (health/reconnect — distinct concern). Help-tab entries updated. New unit test stands up an httptest backend serving four tools across three sources (builtin, two MCPs, recipe), asserts the loader's sort, source tags, and that MCP rows surface their server id while built-in rows don't gain a spurious "from" prefix. Existing catalog tests updated for the new title. Screenshot: `screenshots/HHHHH1_unified_tools.png`.

- [x] **GGGGG1.** `dump the log` no longer returns the same canned 80-line server-log payload every time. Engine now keeps a per-(session, scriptKey) call counter (`NextCallIndex`) and `runBigToolScript` uses it to pick from `bigLogVariants` — three distinct payloads with their own intro / shell command / body / followup: server logs (existing), python tracebacks from a worker pod, nginx access logs dominated by one misbehaving client. Cycles in order; per-session counter so different sessions don't drift. The user explicitly flagged this as a prerequisite for FFFFF1's cursor-aware Ctrl+E to be testable. New unit test sends three back-to-back "dump the log" turns, asserts all three tool_result bodies are distinct, and that variant[1]'s "Traceback (most recent call last)" + variant[2]'s "GET /api/v2/search" markers both appear. Existing TestRichScripts_BigToolOutput still passes (variant[0] is the original server-log content).

## Phase FFFFF — cursor-aware Ctrl+E + visible cursor on Tab

- [x] **FFFFF1.** Two changes ship together so the body-message cursor is actually usable. (1) `maybeInitBodyCursor` seeds `bodySelMsgIdx` to the latest message whenever Tab/Shift-Tab lands on FocusBody and the cursor is still -1 — the user reported they "have not seen this, nor can [they] see it now" because the previous cursor stayed invisible until they pressed n/N. (2) Marker upgraded from a thin half-block `▌` in plain bold to a solid `█` glyph painted with both fg AND bg in the secondary colour — reads as a fat vertical bar that runs the full height of the selected message instead of a faint stripe in the gutter. Ctrl+E already preferred the cursor's bulky part (Z1) — pinned with two new tests: (a) cursor on EARLIER message expands EARLIER not LATEST, (b) no-cursor + non-body focus falls through to LATEST (back-compat with L3). Plus two cursor-init tests: Tab-from-input seeds bodySelMsgIdx=last, and re-Tabbing through the focus cycle preserves an existing user selection. Screenshots: `screenshots/FFFFF1_cursor_on_tab.png` (latest message, cursor visible) and `screenshots/FFFFF1_cursor_earlier_message.png` (after 4× N, cursor on a middle ASSISTANT block).

## Phase EEEEE — intro splash uses figlet (slant font)

- [x] **EEEEE1.** Replaced the hand-rolled `GACT` ASCII art (and the small mountain glyph above it) with `github.com/common-nighthawk/go-figure` rendering "GACT" in the `slant` font at startup. User explicitly asked for "a ready solution" rather than bespoke art. Mountain glyph dropped — uncluttered splash; users who want a logo can supply one via `intro_file`. Existing intro tests adjusted: instead of asserting the exact `/_\` glyph from the old hand-rolled art, just check the splash contains a multi-line slant-style block (≥8 forward slashes). All other intro tests (key dismiss, custom file override) unchanged. Screenshot: `screenshots/EEEEE1_intro_figlet.png`.

## Phase DDDDD — footer flicker on transient SSE drops

- [x] **DDDDD1.** "(reconnecting…)" badge in the footer no longer flashes for one frame on routine sub-second SSE blips. Added an `sseDownSince` clock (set when `sseBackoffAttempts` goes 0→positive, cleared on `sseEventMsg`); renderFooter now requires `time.Since(sseDownSince) >= 800ms` before painting the badge. Real outages still surface within a second; the typical 250 ms reconnect cycle stays silent. Three new unit tests pin the gate (visible past gate, hidden during sub-gate blip, hidden when down-clock is zero) plus the existing healthy/backoff cases. Screenshot: `screenshots/DDDDD1_footer_steady.png`.

## Phase CCCCC — conversation pane overflow / sidebar misalignment

- [x] **CCCCC1.** Shipped previous iteration. Lipgloss .Height(N) is OUTER (border included); the renderer was passing Height(N-2) treating it as inner content, leaving each bordered pane 2 rows short. Sidebar `╰╯` floated up while conversation `╰╯` stayed at full bodyH, breaking the bottom alignment. Fixed by passing the outer target straight to .Height on all three pane styles + a `fitLines()` belt-and-braces helper. Golden snapshots regenerated. Screenshots: `screenshots/CCCCC1_overflow_{before,after}_fix.png`.

## Phase BBBBB — conformance: Mcp section + adapter test repair

- [x] **BBBBB1.** Conformance suite gains an `Mcp` section (gated on `capabilities.mcp`) that walks `GET /v1/mcp/servers`: asserts 200, top-level `servers` array shape, and each server has the required `id`/`name`/`transport`/`status` fields with status in the enum (connecting|ready|error|disconnected). Locks the wire shape that JJJJ1's `gact mcp list` and the TUI catalog both depend on. New `Options.SkipMcp` opt-out preserves back-compat. Discovered + fixed a latent breakage along the way: both adapter conformance tests (crush + opencode) were calling `conformance.Run(t, ...)` with raw `*testing.T`, which broke when the suite was refactored to `Reporter`. Wrapped both calls with `conformance.FromTest(t)`. Confirmed the new section runs against the emulator (`gact conformance` shows `▶ Mcp ✓ Mcp PASS`) and TestCLI_Conformance now requires the new section name.

## Phase AAAAA — gact context list --mode/--glob filters

- [x] **AAAAA1.** `gact context list <sid>` gains two filters: `--mode read|edit|pin` (exact) and `--glob PATTERN` (Go path.Match with basename fallback, mirrors ZZZZ1). Both empty by default = no filter (back-compat). Combined filters AND together. Bad --mode or --glob → exit 2 client-side without hitting the backend. JSON returns `[]` not `null` after filtering. CLI test seeds 3 entries (read/pin/edit; .go and .md), asserts each filter narrows correctly + the combined case + bad-value exits.

## Phase ZZZZ — gact files list --glob PATTERN

- [x] **ZZZZ1.** `gact files list <ws-id> --glob PATTERN` filters workspace listings by Go `path.Match` pattern. Empty = no filter (back-compat). Two-pass match: full path first, then basename fallback so `*.go` matches `src/foo.go` (otherwise `*` wouldn't cross `/`). Bad pattern → exit 2 client-side without hitting the backend. JSON returns `[]` not `null` after filtering. CLI test seeds the default workspace, asserts `*.go` keeps Go files but drops `README.md`/`go.mod`, basename fallback works for `main.go`, and bad pattern exits 2.

## Phase YYYY — gact dashboard --status FILTER (+ list/dashboard waiting alias fix)

- [x] **YYYY1.** `gact dashboard --status idle|running|waiting|error` filters dashboard rows by status (single value or comma-separated set). Empty filter = all (back-compat). Fast-fail validation on typo (exit 2). Discovered + fixed a latent bug while implementing: `gact list --status waiting` and the new `gact dashboard --status waiting` never matched anything because the actual server status is `waiting_permission` (per SPEC). Now both verbs translate the user-friendly `waiting` alias to `waiting_permission`. CLI test seeds an idle session + a waiting one (via the `delete` permission scenario), asserts the filter keeps the waiting row + drops the idle one, then resolves perms and asserts both reappear under `--status idle`. Comma-list and unknown-status (exit 2) cases also covered.

## Phase XXXX — gact hooks list --event/--scope filters

- [x] **XXXX1.** `gact hooks list` gains two filters: `--event TYPE` (exact match; `*` matches the universal-hook entry) and `--scope global|session|workspace`. Both empty by default = no filter (back-compat). Combined filters AND together. Unknown --scope → exit 2 client-side. JSON mode returns `[]` not `null` after filtering. CLI test seeds three hooks (one in each scope kind), asserts each filter keeps the right one and drops the rest, plus a combined filter case.

## Phase WWWW — gact tasks list --status FILTER

- [x] **WWWW1.** `gact tasks list <sid> --status pending,running,…` filters tasks by status (single value or comma-separated set). Empty filter = all (back-compat). Validation runs client-side so a typo errors fast (exit 2) instead of returning a silently-empty set. Works in both TSV and JSON modes (JSON returns `[]` not `null` after filtering). CLI test seeds 3 tasks with different statuses, asserts single-value filter, comma-list filter, JSON shape after filter, and unknown status → exit 2.

## Phase VVVV — gact grep --limit N

- [x] **VVVV1.** `gact grep <query> --limit N` truncates the cross-session search output. Default 0 = unlimited (back-compat). Truncation runs AFTER sorting by sid so the kept rows are still the lexicographically-smallest sids (deterministic). Negative --limit → exit 2. CLI test seeds 4 sessions with the same marker, asserts no-limit returns ≥4 rows and `--limit 2` returns exactly 2.

## Phase UUUU — gact stream --filter (mirrors tail's RRR1)

- [x] **UUUU1.** `gact stream --filter type1,type2` drops events whose type isn't in the keep set, mirroring `gact tail --filter` (RRR1). Useful for live human debugging when message.part.delta floods drown out the interesting events. Empty filter = passthrough (back-compat). CLI test runs stream in --filter notification mode bounded by sleep+kill, fires an mcp reconnect to trigger a notification, asserts the notification row appears while server.connected does not.

## Phase TTTT — gact tail --format text

- [x] **TTTT1.** `gact tail --format text` reuses `streamRow()` (the same human-readable formatter `gact stream` uses) so live debugging doesn't require piping NDJSON through `jq`. Default kept as `json` (NDJSON) for back-compat with existing tooling. CLI test runs tail in --format text bounded by sleep+kill, asserts no JSON keys leak through, the `server.connected` row appears, and every line starts with an `HH:MM:SS` time field. Unknown format → exit 2.

## Phase SSSS — gact watch --format json (NDJSON state changes)

- [x] **SSSS1.** `gact watch <sid> --format json` emits one NDJSON record per state change: `{ts,sid,status,message_count,tokens_out}`. Default tsv unchanged. Same trigger logic (status flip OR msg/token-count delta). Idle-streak exit semantics preserved. CLI test fires a turn in a goroutine, runs watch in --format json, asserts ≥2 NDJSON rows, every line parses, sid is consistent, and an idle-status row appears before the run terminates. Unknown format → exit 2.

## Phase RRRR — parallelize gact dump-bundle session export

- [x] **RRRR1.** `gact dump-bundle` now uses the same 8-wide bounded fanout as `gact export --all` (QQQQ1) for the per-session export+write loop. Was strictly serial — bug-report bundles for instances with many sessions paid sessions×RTT in latency. The version.txt / diag.txt / metrics.json paths are untouched (single-shot, not in the hot path). Per-session error tolerance preserved (failures logged but don't abort). CLI test seeds 12 sessions (>workers) and asserts the summary count + every session.json lands.

## Phase QQQQ — parallelize gact export --all

- [x] **QQQQ1.** `gact export --all -o DIR` now fans out per-session export+write across a bounded worker pool (8-wide, mirroring FFFF1's tasks-summary fanout). Previous behavior was strictly serial — a 200-session backup paid 200×RTT in latency. The pool size is fixed: 8 saturates a LAN backend without DoSing it. Per-session error tolerance preserved (one bad session doesn't trash the run; failed count goes to stderr summary). CLI test seeds 12 sessions (>workers) so the pool must reuse slots, asserts every session.json lands and the summary shows `12 ok, 0 failed`.

## Phase PPPP — gact context list --format json

- [x] **PPPP1.** `gact context list <sid> --format json` emits the raw `[]gact.ContextFile` array for jq pipelines (path, mode, added_at). Default tsv kept for back-compat. Empty list serializes as `[]` not `null`. CLI test seeds two files, asserts json parses to 2 items with correct mode mapping, default tsv unchanged, unknown format → exit 2.

## Phase OOOO — gact info --include tasks,hooks

- [x] **OOOO1.** `gact info <sid> --include tasks,hooks` adds composite sections to the existing single-session info dump. In text mode, appends `--- tasks ---` and `--- hooks ---` blocks (TSV rows or `(none)`). In JSON mode, the response is wrapped: `{session, tasks?, hooks?}`. Hook scoping rule: keep session-scoped hooks for this session, plus global (`session=""` and `workspace=""`) and workspace-scoped hooks matching `s.workspace_id` (since those fire for this session). Unknown --include token → exit 2. Bare `gact info` unchanged. CLI test seeds two tasks (one completed) + one session-scoped hook, asserts both modes contain expected rows + JSON parses to {session,tasks,hooks} with correct counts.

## Phase NNNN — gact follow --format json (NDJSON)

- [x] **NNNN1.** `gact follow <sid> --format json` emits NDJSON for both the initial snapshot and streamed messages, so `gact follow $sid --format json | jq -c .` works as a poor-man's event tap. Default text mode unchanged. Refactored the message printing into an `emit(msg)` closure so snapshot + SSE-completed paths stay format-aware. CLI test runs follow in a goroutine bounded by `runGactWithDuration(5s)`, sends a second message mid-stream, asserts both ALPHA (snapshot) + BRAVO (stream) appear in NDJSON parts and every line parses as a Message.

## Phase MMMM — gact log --format json (NDJSON)

- [x] **MMMM1.** `gact log <sid> --format json` emits one message per line as NDJSON (no indentation, line-delimited) so callers can pipe to `jq -c` and friends. Default text mode unchanged. Plays well with the existing `--limit` / `--since` filters since both run before serialization. CLI test sends a user message + waits for assistant reply, then asserts `--format json` produces ≥2 lines that each parse to a Message-shaped object containing the right session_id and both user + assistant roles. Unknown format → exit 2.

## Phase LLLL — gact ping --json

- [x] **LLLL1.** `gact ping --json` emits a single-line JSON object on both branches: `{"ok":true,"backend":URL,"uptime_s":N}` on success, `{"ok":false,"backend":URL,"error":STR}` (with `uptime_s` if backend was reached but unhealthy) on failure. Existing text behavior unchanged when --json is absent. Existing -q still suppresses the success/unhealthy text but is overridden by --json (--json always emits one line). CLI test parses both branches with `encoding/json` to assert structured shape, not just substrings.

## Phase KKKK — perms rules list --format tsv

- [x] **KKKK1.** `gact perms rules list` gains `--format json|tsv` (default kept as `json` for back-compat with existing scripting callers; `--format tsv` is the new opt-in human view). TSV columns: scope, scope_id (`*` for any), tool_pattern, path_pattern (`-` if empty), action, annotations (sorted `k=v` list or `-`). CLI test seeds two policies, asserts both rows in TSV, default JSON shape preserved, unknown format → exit 2.

## Phase JJJJ — gact mcp list

- [x] **JJJJ1.** `gact mcp list [--format tsv|json]` enumerates the backend's connected MCP servers via `GET /v1/mcp/servers`. TSV columns: id, name, status, transport, protocol_version, capabilities (compact `tools,resources,prompts,logging`), last_error. JSON mode dumps the array as-is. Aliased to `mcp ls`. Help text + verb dispatcher updated. CLI test seeds the `default` emulator scenario (one fake-mcp), asserts both formats and that unknown format exits 2.

## Phase IIII — gact theme set

- [x] **IIII1.** `gact theme set <name>` writes the chosen theme to `config.json` (validates against `ui.AllThemeModes`, rejects unknown names with exit 2 and no file write). GACT_THEME still wins at resolution, by design — `set` only updates the config-level value. CLI test uses isolated `XDG_CONFIG_HOME` to assert: happy-path writes the file, `theme list` then marks the new value active, unknown names exit 2 without mutating the file, and missing arg exits 2.

## Phase HHHH — gact theme list

- [x] **HHHH1.** `gact theme list` enumerates `ui.AllThemeModes`, prints `<name>\n` per palette, and appends `\t*` to the resolved active line. Useful for discovering valid `--name` values + driving shell completions. Help text updated. CLI test asserts known names appear, exactly one `*` marker, and that the marker tracks `GACT_THEME`.

## Phase GGGG — gact theme show

- [x] **GGGG1.** `gact theme show [--name N]` prints the resolved theme palette as TSV (`key\thex`). Resolution honors --name flag, falls back to `config.Resolve(cfg.Theme, $GACT_THEME, "", defaultTheme)`. Emits `name<TAB>mode` row + 16 color rows (bg, fg, primary, secondary, success, warning, danger, border, role_*). Pure local — no backend dep. Help text + completion entries (bash/zsh/fish) updated. CLI test asserts env override, --name override, unknown verb exits 2.

## Phase III — tool-call/result linkage (user-flagged)

- [x] **III1.** Tool calls and tool results now interleave: `pairToolResults(msgs)` walks the message slice, builds `inlineResults[i]={call_id→result_part}` for each assistant that emitted tool_calls, and marks the absorbed tool messages so they don't render standalone. `renderPartsForRoleWithResults` emits each call's matching result immediately after the call header. Unpaired results stay visible (never silently dropped). Collapse-affordance `[N more lines · Ctrl+E to expand]` was already in place at render.go:365-378. Three unit tests + screenshot 67.

## Phase NNN — emulator hardening (found during MMM7)

- [x] **NNN1.** Emulator scenario engine no longer panics when messages are deleted mid-flight. Made `addPart` and `createAssistantMessage` nil-safe — they return placeholder `&gact.Part{}` / `&gact.Message{}` with empty IDs on error rather than nil. Subsequent calls to UpdateMessagePart/AppendPart/etc. return ErrNotFound (which the scenario already discards), so the script gracefully degrades to no-op instead of crashing the server. Regression test `TestDefaultScriptSurvivesMessageDelete` deletes the assistant message mid-flight and verifies the session survives.

## Phase FFFF — tasks summary

- [x] **FFFF1.** `gact tasks summary [--workspace WS_ID]` ships. Bounded-pool fanout (8-wide) over ListSessionTasks per session, sums by status. Skips sessions with no tasks. Prints TSV table + TOTAL footer with `(N sessions)` count. CLI test seeds two sessions, asserts both rows + correct TOTAL aggregate.

## Phase EEEE — dump-bundle --since

- [x] **EEEE1.** `gact dump-bundle --since DUR` filters bundled sessions by UpdatedAt cutoff. Logs `kept N/M sessions` to stderr. Sessions with zero UpdatedAt always survive (defensive against backends that don't stamp). CLI test seeds two sessions, verifies wide window keeps both and narrow window keeps only the recently-touched one.

## Phase DDDD — gact env

- [x] **DDDD1.** `gact env` ships. TSV `KEY<TAB>VALUE` for backend/theme/voice/intro/config-path/plugins-dir, then a `--- ENV ---` section listing every GACT_* env var. Pure local — no backend dep. Test asserts both env vars + their resolved values appear.

## Phase CCCC — replay

- [x] **CCCC1.** `gact replay <export-file|->` ships. Reads + decodes via existing client.ImportSession, prints new sid + "created session ... with N messages" notice. `--attach` flag bridges into the TUI via GACT_ATTACH_SESSION_ID + runTUI (OOO1 mechanism). CLI test exports a session, replays, asserts the imported log contains the original marker token.

## Phase BBBB — dashboard watch

- [x] **BBBB1.** `gact dashboard --watch [--interval DUR]` ships. Extracted renderDashboardOnce so --watch can call it on each tick. ANSI `\033[2J\033[H` clear+home between frames; banner with backend URL + interval + "Ctrl+C to exit". Tests: 2.5s run with --interval 1s asserts ≥2 clear sequences + seeded session in output.

## Phase AAAA — conformance for MMM endpoints

- [x] **AAAA1.** conformance suite gained Hooks (§6.17), Policies (§6.11), Tasks (§6.18) sections. Each is gated by `capabilities.{hooks,permissions,session_tasks}` so adapters that wire only a subset get auto-skipped. New SkipHooks/SkipPolicies/SkipTasks options + matching --skip names in `gact conformance`. Each section runs GET + write + delete to exercise the round-trip. Manual e2e: full suite passes against emulator with all 3 new sections green.

## Phase ZZZ — gact follow

- [x] **ZZZ1.** `gact follow <sid>` ships. Snapshots existing messages (chronological), then subscribes to SSE for the session and renders any new completed messages until Ctrl+C. `seen` map dedupes against SSE replay. Extracted printLogMessage helper so log + follow share one render path. CLI test seeds + waits ALPHA, starts follow with deadline, sends BRAVO, asserts both surface in the captured output.

## Phase YYY — wait any-of

- [x] **YYY1.** `gact wait --any-of sid1,sid2,...` ships. Polls each id per round; first idle wins. In --any-of mode the winning sid prints to stdout so chained scripts can branch on it. Single-arg form unchanged. Test fires two async tells, asserts winner ∈ the input set.

## Phase XXX — concurrent bench

- [x] **XXX1.** `gact bench --concurrent C` ships. Refactored runBench into a worker pool: C goroutines each own a session and run N turns serially. Aggregate stats across all C×N samples + a `thrpt` line (turns/s) shown only when concurrent>1. Default C=1 = old serial behaviour. Test extended to cover both modes + asserts thrpt hidden in serial mode.

## Phase WWW — cross-session grep

- [x] **WWW1.** `gact grep <query>` ships. Cross-session SearchMessages with a 8-wide goroutine pool. Each session's matches fetch a ListMessages call to map mid→role. Sorted by sid for stable output. TSV format `sid<TAB>title<TAB>mid<TAB>role<TAB>snippet`; JSON dumps the hit slice. CLI test seeds two sessions with a unique token + asserts both surface.

## Phase VVV — dashboard

- [x] **VVV1.** `gact dashboard` ships. Three formats: pretty (column-aligned ASCII, no box chars so `column` etc. work on it), tsv (grep-friendly), json (raw session structs for jq). Columns: id, status, title, model, age, tokens-in/out (compact: 1.2K/M), cost. Helpers humanAge + humanTokensCLI compact the numeric columns. CLI test exercises all three formats.

## Phase UUU — sidebar task badges

- [x] **UUU1.** Sidebar rows show `(N tasks)` badge (warning color, italic) when the session has open §6.18 tasks. Counts only pending+running statuses. Loaded lazily via new loadSessionTasksCmd in selectSession; cached in App.taskCountBySession. Title truncation accounts for badge width so layout doesn't overflow. 2 unit tests + screenshots/73-task-badge.png.

## Phase TTT — log time filter

- [x] **TTT1.** `gact log --since DUR` ships. After ListMessages returns, drops messages with CreatedAt older than now-DUR. Empty/0 = passthrough. CLI test sends AAA, sleeps 2s, sends BBB, asserts --since 1h keeps both, --since 1500ms keeps only BBB.

## Phase SSS — conformance CLI (deferred)

- [x] **SSS1.** `gact conformance` ships. Refactored `contract/conformance` to a `Reporter` interface (Helper/Run/Errorf/Fatal/Fatalf) — testing.T wraps via `FromTest`, CLIReporter implements it for command-line use. NewCLIReporter prints `▶`/`✓`/`✗` per section + tracks Failed; FailedSections() returns leaf failures. CLI accepts `--skip Section,…` to disable sections. Exit 0 = pass, 1 = fail, 2 = bad usage. CLI test runs full suite vs emulator and asserts PASS in stderr.

## Phase RRR — tail filter

- [x] **RRR1.** `gact tail --filter` ships. Comma-separated type list parsed once into a lookup map; events whose type isn't in the set get dropped before encode. Empty/unset = passthrough. CLI test asserts notification is kept and server.connected is filtered out when filter targets only "notification".

## Phase QQQ — bench

- [x] **QQQ1.** `gact bench [-n N] [--message TEXT] [--workspace] [--timeout]` ships. Creates a fresh session, runs N turns serially, polls each send→idle for per-turn duration, computes p50/p90/p99/avg/min/max/total, deletes the session, prints a summary table. CLI test asserts the table fields appear and the session is cleaned up (post-bench list count == pre).

## Phase PPP — voice CLI

- [x] **PPP1.** `gact voice <sid> <audio-file|->` ships. Wraps `client.VoiceTranscribe`. Reads file or stdin, defaults `--mime audio/wav`, prints recognised text on stdout. CLI test feeds a deterministic file + asserts non-empty transcription, plus exit-2 on empty audio.

## Phase OOO — TUI launch shortcuts

- [x] **OOO1.** `gact attach <name|sid>` ships. New runAttach dispatcher sets GACT_ATTACH_SESSION_ID env, strips its own argv, and re-enters runTUI. App.AttachSessionID + new pickAttachIndex helper select the right row on connectedMsg (matches by id OR title). Missing id falls back to row 0 with a transient hint. CLI test (TestPickAttachIndex) covers no-attach default, match-by-id, match-by-title, missing+fallback. Screenshot 72.

## Phase MMM — additional contract / feature follow-ups (filed in LLL7)

- [x] **MMM8b.** Plugins now surface in the slash palette. App carries `[]pluginCommand` (flattened from `plugins.Plugin × Command`); paletteMatches merges them in with `Source="plugin"`; Enter on a plugin command short-circuits the runCommandCmd path and execs the plugin binary in the background. Output (or failure) lands as a transient hint. Plugin scripts get `GACT_SESSION_ID`, `GACT_BACKEND`, `GACT_PLUGIN_DIR` env vars. Cross-package types `ui.PluginsLoaded`/`PluginsCommand` mirror plugins.* to keep the dep one-way. Test asserts merge + filter + lookup.


- [x] **MMM1.** SPEC already had `notification` event type at §7.3 line 680; wired it end-to-end. Emulator: `handleMcpReconnect` now publishes `{level: "info", title: "MCP server reconnected", body: server_id}`. TUI: `applySSE` case `notification` sets `transientHint = "<level>: <title> — <body>"`. CLI: `gact stream` prints `[<level>] <title> — <body>` row. CLI test asserts the workspace tail catches the event when reconnect fires.
- [x] **MMM2.** `Config.ConfigVersion *int` field + `internal/config/migrate.go` with `CurrentConfigVersion=1` and an ordered `migrations` slice. `Migrate(cfg)` walks forward from the user's current version. v1 just stamps the field on pre-MMM2 configs. Wired into LoadFrom — every `config.Load()` call now returns a migrated config. 3 unit tests cover pre-versioned full-run, already-current no-op, and partial-run with a swapped fake migrations list.
- [x] **MMM3.** Hooks shipped end-to-end: SPEC §6.17 added + `capabilities.hooks` flag + `gact.Hook` type + emulator hooks store + bus dispatcher + GET/POST/DELETE `/v1/hooks` + client.{List,Create,Delete}Hook + `gact hooks list/add/rm` CLI. Hook commands receive event JSON on stdin; URL targets get a POST. CLI test wires up a script-hook on `notification`, triggers a reconnect, asserts the script captured the event JSON, and removes it.
- [x] **MMM4.** SPEC §6.11 already had `Policy` type + `/v1/policies` endpoints (lines 490-505); wired them end-to-end. Emulator: `Permissions.SetPolicies/Policies/matchPolicies` + auto-resolve in `Create`. Tiny `*`/`**` glob matcher walks tool_name_pattern + path_pattern. Client: `ListPolicies`, `PutPolicies`. CLI: `gact perms rules list/set/clear` (set takes a `{policies:[…]}` JSON file or stdin). CLI test installs a deny rule, triggers a permission scenario, asserts the request landed `resolved/deny` automatically.
- [x] **MMM5.** SPEC §6.18 added (Tasks). `gact.SessionTask` type + `capabilities.session_tasks` flag. Emulator: in-memory `tasksStore` keyed by id with sessionID indexing; 4 routes (GET/POST/PATCH/DELETE). Client: ListSessionTasks, CreateSessionTask, PatchTask, DeleteTask. CLI: `gact tasks list/add/set/rm`. CLI test exercises full lifecycle (add → list shows pending → set running → list reflects → rm → empty).
- [x] **MMM6.** SPEC §6.2 summarize body extended with `instructions?: string`. Emulator echoes the instructions into the placeholder summary so callers can verify the field round-tripped. Client.SummarizeSession signature gains `instructions string`. CLI `gact summarize --instructions "…"`. Existing TestCLI_Summarize extended to assert the round-trip.
- [x] **MMM7.** SPEC §6.10 extended with `POST /v1/sessions/{id}/rewind` (`{to_message_id, include_target?}` → `{deleted_messages: [...]}`). Emulator finds the target in the message list, deletes everything newer, optionally drops the target. Client.RewindSession + `gact rewind <sid> <mid> [--include-target]` CLI. Test exercises both default and --include-target paths after waiting for idle (avoids pre-existing scenario-engine race noted as NNN1).
- [x] **MMM8.** Plugin loader shipped: `tui/internal/plugins/` with manifest schema (`{name, version?, description?, commands: [{id, title?, description?, command, args?}]}`). `Load(dir)` + `LoadVerbose(dir)` (latter returns per-manifest errors). XDG-aware `DefaultDir()`. Bad manifests are skipped, bad individual commands within a good manifest are also skipped (validation: id must start with `/`, command must be non-empty). `gact plugins list/dir [--dir DIR]` CLI wired up. 4 unit tests + 1 CLI integration test. NB: TUI palette wiring (auto-load plugins into the slash menu and exec on enter) is a future task — this iteration ships the loader + CLI surface only.

## Phase LLL — UX polish round (user-flagged 2026-04-18)

- [x] **LLL1.** 13 screenshots refreshed via existing tapes (screenshot, screenshot_collapse, screenshot_compose, screenshot_themes). Now reflect HHH1 header (model/agent) and III1 interleaved tool rendering.
- [x] **LLL2.** Catalog browser gained two TUI features: (a) Tools — `Space` toggles a tool's disabled state; disabled tools render dim+italic with `(disabled)` tag; persisted to `Config.DisabledTools`. (b) MCP — `Enter` on a server row drills into a unified tools+resources+prompts subview (`[tool]`/`[res]`/`[prompt]` prefixes) backed by the existing client.McpServerTools/Resources/Prompts methods; `Esc`/`Backspace` pops back to the server list. Per-kind hint line. 5 unit tests + screenshots/68-mcp-detail.png.
- [x] **LLL3.** /skills now hits ListAgents and filters source="skill" (per SPEC §6.5: skills are agents). Seeded two skill-source agents in the emulator (`test_writer`, `release_notes`) so /skills has real data. /agents continues to route to Settings>Agent which shows all 4 (2 builtin + 2 skill). New catalogKindAgents kind added for future browse-only routes. Screenshots 69 (skills) + 70 (agents in Settings).
- [x] **LLL4.** Settings + catalog browser modals got real header bars (full-width Primary bg, inverted text) instead of plain bold-foreground titles. Selected rows now get a Bg-color background strip behind the entire row in addition to the existing `▌` marker, so selection is visible at a glance even with peripheral vision. Settings rowLine helper extracted (collapses model/agent/theme tab repetition). Screenshots 68/69/70 refreshed.
- [x] **LLL5.** Sidebar height now matches the conversation pane height (was full bodyH including input), so both bottom borders close on the same row. Extracted `conversationPaneHeight()` helper used by both `viewMainBase` (sizes sidebar) and `renderBody` (sizes msg pane). UI goldens regenerated.
- [x] **LLL6.** Footer now groups hints into 3 clusters (action | nav | exit) with `·` between hints and `│` between clusters. Cost rendered as a styled chip with chipBg=Bg, $ amount in Secondary bold + tokens in dynamic-color (warning/danger by context-window threshold). UI goldens regenerated. Visible in screenshots/01-initial.png.
- [x] **LLL7.** Filed an 8-item follow-up queue (MMM1-MMM8) covering missing contract surface and capabilities the spec already implied but the binary hadn't wired: SSE `notification` event type, versioned config migrations, hooks system, permission auto-resolution policies, session tasks, summarize with instructions, /rewind to message N, and a plugins directory. Top-3 by impact ranked first.
- [x] **LLL8a.** `gact tell --async` posts the message and exits immediately, printing `sid<TAB>msg_id` to stdout. Combine with `gact watch <sid>` or `gact log <sid>` to pick up the reply later. Same find-or-create-by-name semantics as the sync path. CLI test asserts both orderings (positional-then-flag, flag-then-positional) work and that resume keeps the same sid.
- [x] **LLL8b.** Ctrl+Z now binds to `tea.Suspend` (bubbletea/v2 has built-in SIGTSTP handling — no syscall needed). Sets a transientHint "detached — `fg` to resume; backend session keeps running" so the user has reassurance on resume. Help overlay updated. CLI test asserts the hint and a non-nil cmd.

## Phase JJJ — intro/splash screen (user-flagged)

- [x] **JJJ1.** ASCII splash shipped. New `StageIntro` shown before connect (Init guards connectCmd while in StageIntro). `viewIntro` renders Triangle logo + GACT block-letters + "press any key to continue". Custom splash via `--intro-file PATH`, `GACT_INTRO_FILE`, or `intro_file` config (format: logo block, blank line, name block). Bypassed by `--no-intro` flag, `GACT_NO_INTRO` env, or `intro_skip: true` config. Any non-Ctrl+C key dismisses → connect. 4 unit tests + screenshots/71-intro-splash.png. NB: deferred the "if no model/agent: open Settings>Model" routing — both fields default to anthropic/claude-opus-4-7 in createSessionCmd today, so nothing's "unset"; revisit when those defaults move into Settings.

## Phase KKK — name-based tell (user-flagged)

- [x] **KKK1.** `gact tell <name> <msg>` — single verb, idempotent. First call creates a session whose title is `<name>` (anthropic/claude-opus-4-7 + default agent). Subsequent calls with the same name resolve to the existing session and append. `<name>` may be a literal `sess_<id>` (resolver short-circuits). Prints assistant reply to stdout; "created session …" notice goes to stderr only on creation. CLI test covers create→resume→both turns landing in same sid.

## Phase HHH — model indicator in header

- [x] **HHH1.** Header now appends `model: <model_id>  agent: <agent_id>` after the session label and before the status badge. Drops cleanly on narrow widths via the existing avail logic. Two renderer tests cover the wide-window happy path and the narrow-window fallback. Screenshot at `screenshots/66-header-model.png`.

## Phase GGG — capabilities CLI

- [x] **GGG1.** `gact capabilities` (alias `caps`) wraps existing `client.Capabilities`. Text mode prints contract version, backend identity, transports, auth, then a `✓`/`·` matrix of all 23 SPEC §3.3 flags. Extensions follow. JSON dumps raw `gact.Capabilities`. CLI test asserts contract_version line, three core flag rows in text, and JSON shape.

## Phase FFF — list filters

- [x] **FFF1.** `gact list` gained `--status STATUS`, `--archived`, `--parent SID`, `--limit N`. Status/limit applied client-side (server has no query params); workspace+archived+parent flow through SessionFilter. Validates --status against the known set with exit 2. CLI test seeds 2 sessions, asserts --limit 1 truncates, --status idle keeps idle rows, --status running yields empty, and bogus status fails 2.

## Phase EEE — MCP resource read

- [x] **EEE1.** `gact mcp resource-read <srv-id> <uri>` (alias `mcp read`) wraps new `client.McpResourceRead`. Walks returned `contents` slice and writes each chunk's `text` to stdout (or base64-decodes `data` for binary). CLI test reads seeded `file:///docs/welcome.md` and asserts `demo content` lands.

## Phase DDD — agent detail + watch

- [x] **DDD1.** `gact agent show <id>` (alias `agents show`) wraps new `client.GetAgent`. Text mode lists id, source, title, description, default_model, tools, parameters, then system_prompt block. JSON mode dumps raw AgentDef. CLI test asserts seeded `default` agent renders correctly.
- [x] **DDD2.** `gact watch <sid> [--interval DUR] [--timeout DUR]` polls GetSession and emits TSV row `HH:MM:SS<TAB>status<TAB>msg_count<TAB>tokens_out` whenever status/messages/tokens change. Exits cleanly after seeing activity + 2 idle ticks (timeout otherwise). Activity = any non-idle status OR any change in counts after the first poll — this lets the loop terminate on fast emulator turns that skip running state. CLI test backgrounds a send, asserts ≥2 rows + 4-col TSV.

## Phase CCC — tool detail + MCP reconnect

- [x] **CCC1.** `gact tool show <id>` (alias `tools show`) — wraps `/v1/tools/{id}` via new `client.GetTool`. Text mode prints id, source, server, name, title, description, permission_default, plus pretty-JSON for input/output schemas; JSON mode dumps the raw `gact.Tool`. CLI test asserts seeded `bash` round-trips with name, description, and schema.
- [x] **CCC2.** `gact mcp reconnect <srv-id>` — POSTs `/v1/mcp/servers/{id}/reconnect` via new `client.McpReconnect`. Exit 0 on success. CLI test asserts `mcp_fake` reconnects (exit 0) and an unknown id fails (non-zero).

## Phase BBB — MCP detail CLI

- [x] **BBB1.** `gact mcp tools|resources|prompts <server-id>` wraps the three previously-unexposed `/v1/mcp/servers/{id}/...` GET endpoints. Added `client.McpServerTools/Resources/Prompts`. TSV columns are tuned per type: tool=id·name, resource=uri·mime·name, prompt=name·title. JSON mode dumps the raw slice. CLI test asserts each verb returns ≥1 row for the seeded `mcp_fake` and JSON mode has the right shape.

## Phase AAA — repo map CLI

- [x] **AAA1.** `gact repo-map <ws-id> [--format tree|json]` — wraps `/v1/workspaces/{id}/repo_map`. Added `client.WorkspaceRepoMap` returning `RepoMapResponse{Tree, Tokens}`. Tree mode renders nested paths with `├──`/`└──` glyphs and hangs symbol outlines as `· name` children. JSON dumps the raw response. Token cost goes to stderr so stdout stays clean for `tee`. CLI test asserts main.go and Handler appear and JSON shape lands.

## Phase ZZ — workspace files CLI

- [x] **ZZ1.** `gact files list <ws-id> [--format tsv|json]` — wraps `/v1/workspaces/{id}/files` (existing client.ListWorkspaceFiles). TSV columns: type, size, path. JSON dumps the raw FileEntry slice. CLI test asserts seeded `main.go` shows up.
- [x] **ZZ2.** `gact files read <ws-id> <path>` — wraps `/v1/workspaces/{id}/files/read?path=...`. Added `client.ReadWorkspaceFile([]byte, error)` since none existed (response is octet-stream, not JSON). Bytes go straight to stdout for shell piping. CLI test reads `main.go` and asserts `package main` appears.

## Phase YY — undo CLI

- [x] **YY1.** `gact undo <sid> [--count N]` — POSTs `/v1/sessions/{id}/undo`. Added `client.UndoSession(ctx, id, count)` (no wrapper existed) returning the reverted message ids. Stdout: one mid per line. Stderr: `reverted N message(s)` summary. CLI test sends + waits for a turn, undoes 1, asserts the reverted-ids list has length 1, the stderr summary lands, and the log's role-header count drops by exactly 1.

## Phase XX — session info CLI

- [x] **XX1.** `gact info <sid> [--format text|json]` — wraps GetSession with a key:value text output (one field per line, awk-friendly) plus raw JSON dump for jq pipelines. Surfaces id, title, status, workspace, parent, model, agent, message_count, tokens, cost, created/updated/archived, summary. CLI test asserts title round-trip and status in known set.

## Phase WW — models CLI

- [x] **WW1.** `gact models list [--provider PID] [--format tsv|json]` — chains ListProviders + per-provider ListProviderModels in one command. TSV columns: provider_id, model_id, name, context_window. `--provider` skips the providers round-trip and lists only that provider's models. CLI test asserts all three seeded providers (anthropic, openai, local) appear, that `--provider anthropic` filters correctly, and that JSON output exposes `provider_id`+`model_id`.

## Phase VV — fork CLI

- [x] **VV1.** `gact fork <parent-sid> [--at MID] [--title T]` — POSTs a new session with `parent_session_id` (and optionally `fork_at_message_id`), inheriting the parent's workspace via a GetSession lookup. Prints the new id to stdout. CLI test forks an existing session and asserts the child surfaces under `?parent_session_id=`.

## Phase UU — workspaces CLI

- [x] **UU1.** `gact workspaces list [--format tsv|json]` — wraps `/v1/workspaces` so scripts can discover workspace ids without booting the TUI. TSV columns: id, name, root_path. Aliases: `workspace`, `ws`. CLI test asserts the seeded `ws_default` shows up in both TSV and JSON.

## Phase TT — search CLI

- [x] **TT1.** `gact search <sid> <query>` — uses GET `/v1/sessions/{id}/messages/search` (client.SearchMessages). TSV output is `mid<TAB>role<TAB>snippet`; one ListMessages up front resolves role per message. `--format json` pretty-prints the raw match objects. CLI test seeds a unique token and asserts mid+role+snippet land in both TSV and JSON output.

## Phase A — Emulator skeleton

- [x] **A1.** `emulator/go.mod`, package layout. **Decided:** stdlib `net/http` only (Go 1.22+ method-prefixed mux), `github.com/google/uuid` for IDs. Module `github.com/JaimeCernuda/gact-tui/emulator`. Layout: `cmd/emulator-server/`, `internal/server/`, `pkg/gact/`.
- [x] **A2.** Server bootstrap: `cmd/emulator-server/main.go` with `--port`, `--scenario` flags. `go run ./cmd/emulator-server` boots, listens, gracefully shuts down on SIGTERM.
- [x] **A3.** `GET /v1/health` returns `{healthy: true, uptime_s: <int>}` (per SPEC §3.4).
- [x] **A4.** `GET /v1/capabilities` returns the capability bundle (per SPEC §3.3). Hard-coded; reflects what the emulator implements (workspaces/sessions/subagents/MCP/files/diffs/permissions/providers/commands/metrics/branching/export/cost/thinking/search = true; LSP/voice/scheduled/sharing/edit_modes/plan_mode/agent_write/skills_extraction = false in v0.1).
- [x] **A5.** Internal storage layer: in-memory state for workspaces, sessions, messages, parts. **Decided:** sync.RWMutex per-Store (single mutex, simpler than per-resource), maps keyed by ID, secondary index `messagesBySession`. Cascade delete (workspace→sessions→messages). System messages filtered by default in ListMessages. Cursor pagination via `Before` (last seen msg ID).
- [x] **A6.** Workspaces endpoints (SPEC §6.1): GET list, POST create, GET one, PATCH, DELETE. Seeded `ws_default` at `/tmp/gact-emulator-workspace`. Auto-name from basename if not supplied. DisallowUnknownFields for strict request validation.
- [x] **A7.** Sessions endpoints (SPEC §6.2): list (filter workspace_id, parent_session_id, archived), create (with optional fork-at-message), get, patch (title, archived, agent, model, status, metadata), delete, fork (copies messages from parent), cancel (resets status to idle — event emission deferred to A10/A11), summarize (placeholder summary — real summary via A11 scenario), export (chronological), import (resets IDs). **Fix:** store.CreateSession now resets MessageCount/Tokens/CostUSD — derived fields managed by store, not callers.
- [x] **A8.** Messages endpoints (SPEC §6.3): list cursor-paginated, get, POST 202, DELETE, PATCH part, search (substring + snippet).
- [x] **A9.** SSE event stream: per-client filter, ring-buffer replay via Last-Event-ID, heartbeat 15s.
- [x] **A10.** Event bus: in-process pub/sub with monotonic SeqID, ring buffer, slow-subscriber drops counted, race-clean fan-out.
- [x] **A11.** Scenario engine: per-session goroutine + cancel; DefaultScript synthesizes thinking + intro + tool_call + tool_result + finish, optionally with permission flow on dangerous keywords.
- [x] **A12.** Permissions: list (pending filter), get, respond (allow/deny/allow_session/allow_workspace). Per-request resolveCh wakes the scenario.
- [x] **A13.** Providers + models: anthropic / openai / local with realistic models + pricing.
- [x] **A14.** Tools: bash/read_file/edit_file/web_search + 2 mcp-sourced tools, all with input_schema and ToolAnnotations.
- [x] **A15.** MCP: one fake server (`mcp_fake`) — list/get/reconnect/tools/resources/templates/read/subscribe/prompts/prompts.get.
- [x] **A16.** Agents: default + code_reviewer (read). Write API + extract → 501 per `agent_write=false`.
- [x] **A17.** Files / context / repo_map: per-session context-files set + workspace files demo + repo_map demo tree.
- [x] **A18.** Diffs: aggregate file_diff parts across messages, apply/reject mark Applied flag, undo deletes last N messages.
- [x] **A19.** Commands: /clear /cancel /model /agent /add /drop /diff /undo /help /summarize (mcp_prompt).
- [x] **A20.** Metrics: tokens, sessions+by_status, messages+by_role, cost+by_provider.
- [x] **A21.** Cancellation: handleCancelSession invokes engine.Cancel + emits status_changed (verified by E2E test).

## Phase B — Emulator tests (DONE)

- [x] **B1.** Table-driven endpoint tests across handlers_*_test.go files.
- [x] **B2.** SSE integration via `cmd/emulator-server/e2e_test.go::TestE2E_FullScenarioFlow`.
- [x] **B3.** Permission flow E2E in `TestE2E_PermissionFlow`.
- [x] **B4.** Cancel mid-stream covered by `TestE2E_CancelInflight`.
- [x] **B5.** Coverage ≥ target: events 87.3%, scenario 82.2%, server 79.9%, store 90.3%.

## Phase C — TUI scaffold

- [x] **C1.** `tui/go.mod`. Module `github.com/JaimeCernuda/gact-tui/tui`. Bubbletea v2, lipgloss v2, bubbles v2. `gact` binary builds (~11.5MB).
- [x] **C2.** `tui/internal/client/` — typed Go HTTP+SSE client. Covers capabilities, sessions, messages, events, agents, tools, providers, commands, permissions, metrics. Integration test boots emulator binary and exercises the wire.
- [x] **C3.** SSE consumer: tea.Cmd loop pattern. waitForSSE re-enqueues itself on every event. Reconnect on `sseClosedMsg`.
- [x] **C4.** Root model + layout: header / sidebar+body / footer via lipgloss.JoinVertical/Horizontal. AltScreen + Bg/Fg colours.
- [x] **C5.** Sidebar with sessions list, ▌ marker on selected, status colour-italic underneath.
- [x] **C6.** Body conversation pane: role-coloured headers (USER/ASSISTANT/TOOL/SYSTEM), thinking/text/tool_call/tool_result/file_diff/error rendering, scroll-clip with sticky-bottom.
- [x] **C7.** Input pane: simple text buffer + Enter-to-send (textarea bubble can replace later). Cursor blink.
- [x] **C8.** Footer: focus zone, key hints (Tab pane, Enter send, ?help, ctrl+c quit), UTC clock.
- [x] **C9.** Streaming: message.created → part.added → part.delta (text_append, thinking_append, input_json_append) → part.completed (parses tool_call input). Verified end-to-end via 02-streaming + 03-completed screenshots.
- [x] **C10.** Permission dialog: yellow warning banner above conversation when permission.requested arrives. Verified via 04-permission screenshot. (Action submit keys still TODO — see C10b.)
- [x] **C10b.** Permission action keys (a/d/s/w → POST /v1/permissions/{id}).
- [x] **C11.** Slash palette ('/' on empty input opens it; fuzzy filter; Enter dispatches POST /v1/sessions/{id}/commands/{cmd_id}).
- [x] **C12.** Help overlay ('?' toggles).
- [x] **C13.** WindowSizeMsg propagated through layout.
- [x] **C14.** Connect screen: capabilities probe on startup; error stage on failure; capabilities-aware UI (e.g. would hide panels if capability=false).
- [x] **C15.** Settings panel — Ctrl+s opens modal with Model/Agent tabs; lists from /v1/providers + /v1/agents; Enter applies via PATCH /v1/sessions/{id}. Theme switching deferred to E3.
- [x] **C16.** File context panel — sidebar CONTEXT section lists files for current session with mode badges (E/R/P colored). Loaded on session select via GET /v1/sessions/{id}/context/files. Add/remove via REST is wired in client (AddContextFile/RemoveContextFile) but not yet exposed via UI keys.
- [x] **C17.** Diff viewer: a/r keys on body focus apply/reject all pending diffs via /v1/sessions/{id}/diffs/{apply,reject}. Diff part shows status badge: '(applied)' / '(rejected)' / inline hint when pending. Emulator scenario triggered by 'diff' / 'edit' / 'patch' / 'propose' keywords.
- [x] **C18.** Cost meter — emulator now emits `cost.updated` after every assistant turn (synthetic 1500-in/600-out at Sonnet rates ≈ $0.0135/turn) and rolls into the session aggregate; TUI consumes the event, updates the in-memory session, renders `$X.XXXX (N in / N out)` right-aligned in the footer.
- [x] **C19.** Subagent indication: scenario spawns a subagent on "split"/"with help"/"subagent" triggers; emits subagent.started/completed events; parent carries subagent_call/result parts; TUI renders both with ▼/▲ markers; sidebar shows subsessions indented with `└`. Verified via 15-subagent-parent + 16-subagent-sidebar screenshots.

## Phase D — TUI tests + visual verification

- [x] **D1-D5.** Golden snapshots for ConnectingStage, ErrorStage, ReadyEmpty, ReadyWithSessions, StreamingConversation, PermissionBanner, HelpOverlay, PaletteOpen, PaletteFiltered (9 states under `tui/internal/ui/testdata/`).
- [x] **D6-D10.** Visual screenshots — exceeded scope: 14 PNGs in `screenshots/` covering every visible state including markdown rendering and textarea input.

## Phase E — Polish & integration

- [x] **E1.** TUI teatest e2e — unblocked by adding `App.DisableAltScreen` (test-only knob). 3 tests in tui/internal/ui/e2e_test.go cover happy path (Ctrl+N → type → wait for ASSISTANT/read_file/TOOL render), permission flow (delete → permission banner → 'a' allow → completion), and overlays (? help, / palette). Took 2.84s race-clean.
- [x] **E2.** README.md at repo root.
- [x] **E3.** Theming — LightTheme() + ThemeForMode() + ParseThemeMode(); main.go honors `--theme=light|dark` flag (and `GACT_THEME` env). Glamour markdown style still hardcoded dark — visible mismatch on light bg (follow-up).
- [x] **E3b.** Glamour style follows TUI theme — Theme.glamourStyle() picks 'light' when bg luminance is bright, 'dark' otherwise; renderMarkdown takes style as param; cache key now includes (style, width).
- [x] **E4.** Keyboard hint discoverability — footer + help overlay.
- [x] **E5.** Connection resilience — sseClosedMsg → reconnect tick.
- [x] **E6.** Empty-state polish — sidebar n-to-create + body crib.
- [x] **E7.** Multi-pane focus — Tab cycles, focus indicated by `BorderForeground(Primary)` on the active pane.

## Phase F — Stretch (only if Phase A–E complete)

- [x] **F1.** OpenCode adapter v0.1 — new `adapters/opencode/` module exposes GACT v0.1 endpoints, proxies to an OpenCode upstream. v0.1 implements `/v1/health`, `/v1/capabilities`, `/v1/workspaces`, `/v1/sessions`, `/v1/sessions/{id}` with shape translation (OpenCode ms timestamps → time.Time, slug/projectID/directory preserved as `x_opencode_*` metadata). Unimplemented endpoints return 501. Tests use httptest to mock OpenCode upstream — no real OpenCode needed. README documents remaining endpoints + their OpenCode mappings as a follow-up roadmap.
- [x] **F2.** Configuration file — JSON at `$XDG_CONFIG_HOME/gact/config.json` (or `~/.config/gact/`); resolution precedence file < env < flag < fallback. Decided JSON over TOML to keep TUI dep-free.
- [x] **F3.** Export/import subcommands — `gact export <sid> [-o file]`, `gact import <file|->`. Flag reordering so users can write `gact export SID -o file`. Honors GACT_BACKEND env. Round-trip verified manually against the emulator.
- [x] **F4.** Voice transcribe wire-up — emulator implements POST /v1/sessions/{id}/voice/transcribe (canned transcript by body length, with `?text=` query override for tests). TUI client.VoiceTranscribe + Ctrl+Y key inserts the recognised text at the textarea cursor. Real mic capture is platform-specific shell-out — out of scope for the TUI core; documented as user-supplied wrapper script.
- [x] **F5.** Markdown rendering in messages via glamour — implemented for assistant text (iteration 11).

## Phase G — Open follow-ups

- [x] **G1.** OpenCode adapter messages list — `GET /v1/sessions/{id}/messages` translates OpenCode's `GET /session/{id}/message`. Forwards limit + before query params. Translates parts: text, reasoning→thinking, tool→tool_call, file→image. Unknown types pass through as `x_opencode_<type>` per SPEC §8.3 forward-compat. Cost/tokens/finish propagated.
- [x] **G2.** OpenCode adapter SSE — proxy `/event` with shape translation. session.idle → session.status_changed, session.error → message.error, message.updated → message.created, message.part.updated/.delta passed through with shape conversion, permission.asked/.replied → permission.requested/.resolved. Unknown OpenCode event types pass through as `x.opencode.<type>` per SPEC §8.4. Per-session filter via /v1/sessions/{id}/events drops crosstalk. Heartbeat every 15s. Full handler at handlers_events.go; 7 translation tests.
- [x] **G3.** OpenCode adapter POST message — `POST /v1/sessions/{id}/messages` translates GACT parts → OpenCode parts (text + tool_call) and forwards to OpenCode's `POST /session/{id}/prompt_async`. Returns synthetic 202 with placeholder message_id (real ID will arrive via SSE — wired in G2).
- [x] **G4.** Crush adapter scaffold — new `adapters/crush/` module exposes GACT v0.1 endpoints, proxies a Crush HTTP upstream. v0.1 implements `/v1/health`, `/v1/capabilities`, `/v1/workspaces`, `/v1/workspaces/{id}`, `/v1/sessions?workspace_id=`, `/v1/sessions/{id}` — flattens Crush's nested `/v1/workspaces/{wsID}/sessions` URL into GACT's flat shape via query param + `--default-workspace` flag. Crush's Unix-second timestamps parsed; yolo/debug surfaced as `metadata.x_crush_*`; prompt/completion tokens map to GACT input/output. Mocked-upstream tests; no real Crush needed. Messages/SSE/POST/permissions/LSP/MCP + Unix socket transport documented as follow-ups.
- [x] **G5.** Voice mic capture — `--voice-cmd` (env: `GACT_VOICE_CMD`, config: `voice_command`) shells out to a user-supplied recorder on Ctrl+Y. Reference wrapper at `scripts/voice-record.sh` covers arecord/sox/ffmpeg with a 6 s default duration. Contract: cmd writes audio/wav to stdout and exits 0; non-zero with stderr surfaces to the user as an error stage. 30 s runtime cap + 16 MiB audio cap protect the TUI from a runaway recorder. Unit tests cover empty cmd (placeholder) / success / non-zero exit / empty audio.
- [x] **G6.** Cost meter test — `TestCostAccumulatesAcrossTurns` runs 3 user turns through the default scenario and asserts session.CostUSD = 0.081 (3 × 2 × $0.0135) and tokens.input/output match (9000 / 3600). Catches regressions in completeMessage cost charging.
- [x] **G7.** Sidebar viewport — j/k already auto-scroll past the visible window; added g/G for first/last and PgUp/PgDn (also Ctrl+u/Ctrl+d) for paged jumps. `sidebarPageSize()` mirrors the renderSidebar arithmetic so the page step always equals what the user actually sees. Help overlay updated; new tests cover g/G, PgUp/PgDn, clamps at the ends, and that g at index 0 emits no Cmd (no spurious SSE reload).
- [x] **G8.** Search UI — slash palette switches to message-search mode when the filter starts with `?`. First Enter submits the query, results replace the matches list with msg id + snippet, second Enter jumps the conversation viewport to the hit. Backspace invalidates loaded results so the user re-fires after editing. Search errors are swallowed (no full-screen error stage). Help overlay documents `/?…`. New `client.SearchMessages` + 6 unit tests cover the mode switch, submit, jump, invalidation, empty-query no-op, and error swallowing.
- [x] **G9.** Reload-on-config-change — Ctrl+L re-reads `$XDG_CONFIG_HOME/gact/config.json` and hot-applies theme + voice command without restart. Backend changes are flagged in the toast ("backend changed — restart to apply") rather than applied live, since rebinding the URL would force-reconnect SSE/refetch caps/drop the loaded session — too disruptive for an in-flight conversation. Result is shown as a transient hint above the input pane (auto-clears on next non-Ctrl+L key). 5 unit tests cover fire path, error surfacing, nil-hook no-op, hint clearing, and Ctrl+L→Ctrl+L overwrite. fsnotify-style auto-watch deferred — manual reload covers the 80% case (operator tweaking colors).
- [x] **G10.** Telemetry sampling — `latencyTracker` keeps a 1024-sample ring buffer per route pattern; timing middleware wraps the mux and records `time.Since(start)` keyed by `r.Pattern` (Go 1.22+ sets this during routing). SSE/`/events` patterns are skipped (their durations measure connection lifetime, not RPC latency). `/v1/metrics` now includes `latencies: { "GET /v1/foo": { count, p50_ms, p95_ms, max_ms } }`. TUI metrics modal renders the top-6 routes by p95 so operators see the slowest endpoints first. 5 unit tests cover percentile correctness, SSE skip, empty-pattern skip, ring-buffer overwrite, and the e2e shape via /v1/metrics.

## Phase H — Crush adapter feature parity (mirrors G1–G3 for the Crush upstream)

- [x] **H1.** Crush adapter messages list — `GET /v1/sessions/{id}/messages?workspace_id=` proxies Crush's `GET /v1/workspaces/{wsID}/sessions/{sid}/messages`. Crush's wrapped `{type, data}` parts translate as: text/reasoning/tool_call/tool_result pass through with shape conversion, `finish` becomes `Message.StopReason` (not a part), `image_url`/`binary` map to image/document with the URL or base64 source preserved, unknown types fall through as `x_crush_<type>` with `metadata.x_crush_raw` per SPEC §8.3. Tool-call `input` strings are JSON-decoded best-effort; malformed input is preserved verbatim under `metadata.x_crush_raw_input` so nothing is silently dropped. 9 unit tests + 1 e2e test against a httptest mock cover every branch.
- [x] **H2.** Crush adapter SSE — `/v1/sessions/{id}/events?workspace_id=` and `/v1/events?workspace_id=` proxy Crush's workspace-scoped SSE. Crush wraps every event as `{type, payload:{type, payload}}` (outer = payload type, inner = lifecycle); we translate to GACT shape: session.created/updated/status_changed/deleted (status_changed when the resource carries a non-empty status field), message.created/updated/deleted, permission.requested/resolved (with allow/deny derived from granted/denied). Unknown payload types pass through as `x.crush.<type>` per SPEC §8.4. Per-session filter drops crosstalk by checking each event's resource session_id (or `id` for session-lifecycle events). Reuses fresh `http.Client{Timeout: 0}` since SSE is long-lived; heartbeat every 15 s. 11 unit tests + 2 e2e tests against an httptest fakeCrushSSE; race-clean (used real httptest server with body reader rather than NewRecorder, which isn't safe for concurrent read+write).
- [x] **H3.** Crush adapter POST message — `POST /v1/sessions/{id}/messages?workspace_id=` translates GACT parts to Crush's flat `{session_id, prompt, attachments}` AgentMessage and forwards to `POST /v1/workspaces/{wsID}/agent`. Crush has no parts concept on input (only output), so we flatten: text parts join with newlines; thinking parts are wrapped in `<thinking>` so the agent sees them but knows they're informational; image/document parts with binary base64 sources lift into attachments preserving MIME and filename; URL-only image sources are dropped (no fetch — would change prompt determinism); unknown part types JSON-fence into the prompt so nothing is silently lost. Returns 202 with synthetic `msg_pending_<ts>` ID — the real Crush ID arrives via the SSE message.created event from H2. 7 tests cover text/thinking/image/URL-image-drop/unknown-part-fence/e2e/upstream-error/missing-workspace.

## Phase I — Engineering hygiene

- [x] **I1.** GitHub Actions CI — `.github/workflows/ci.yml` runs three matrix-jobs on every push to main + every PR: (a) `go test -race -count=1 ./...` in each of the 4 modules (emulator/tui/adapters/opencode/adapters/crush) so failures stay isolated; (b) `go vet ./...` per module; (c) a build job that compiles every binary (emulator-server, gact, gact-opencode-adapter, gact-crush-adapter). `concurrency: cancel-in-progress` saves CI minutes on rapid-fire commits. setup-go cache keyed on go.mod (always present; the no-external-dep modules don't ship a go.sum). **CI immediately found real bugs**: vet caught 5x `using resp before checking for errors` in SSE tests + 1x `append with no values` in main_test.go (fixed in the same commit), and slow-runner load surfaced a race in three scenario tests where the drain predicate read `st.GetSession(sid).Status` after each event — the script could publish idle, mutate the store, and the test would mistake the in-flight running event for an idle transition. Reproduced with `GOMAXPROCS=1`. Fix: read `e.Payload["status"]` instead of the ever-changing store; factored into `collectStatusEvents` helper so future tests don't reinvent the same race. Three CI iterations: workflow added → CI red (timeout fix wrong) → bumped deadlines (CI red, real race) → payload-read fix (CI green).
- [x] **I2.** Adapter conformance suite — `contract/conformance/` is a self-contained Go module (stdlib-only) that any GACT backend can adopt via `conformance.Run(t, url, Options{})`. Walks Health / Capabilities / Workspaces / Sessions_List / Sessions_Create / Messages_Post / SSE using raw `net/http` (not an SDK — the point is wire validation). Each section runs under `t.Run` so failures stay isolated; 501 on an unskipped section is a failure (tolerating it would defeat the purpose). Skip flags are opt-out per section for backends that only implement a subset. Self-tests: (a) runs against a fresh emulator binary — builds it on-the-fly if missing so CI needs no prerequisite step, skips if the emulator source isn't findable; (b) a hand-rolled health-only server proves the skip-flag plumbing. Module wired into `go.work` and `.github/workflows/ci.yml`.
- [x] **I3.** Wire conformance into adapter test suites — both OpenCode and Crush adapters now ship a `TestConformance_AgainstMockedUpstream` that boots the adapter against a "complete" mocked upstream (every endpoint conformance touches) and runs the full `conformance.Run`. OpenCode passes 6/6 sections; Crush passes 6/6 sections. Both set `SkipCreateSession` (neither adapter exposes POST /v1/sessions — upstream owns session creation) and pin a fixture SessionID. Caught one real bug while wiring: the OpenCode adapter treats upstream 404 as `{}` and then tries to unmarshal that as a list — would've silently returned "no sessions" in production if Crush-style path-shape bug occurred. Each mock handler registers both trailing-slash and bare-path variants so path-shape regressions in the adapter don't 404-silently. SSE mock emits one real event + keeps the stream open; cleanup closes in-flight SSE clients so `httptest.Server.Close()` doesn't hang. Adapter go.mod files grow a `require`/`replace` pair for `contract/conformance` (stdlib-only module, no transitive deps).

## Phase J — User-facing polish (multi-workspace, resilience)

- [x] **J1.** Workspace switcher — Ctrl+W opens a modal listing every workspace already loaded into `a.workspaces` (no extra round-trip — `connectCmd` populates it at startup). Selection defaults to the current workspace so Enter on the same row is a no-op toast. Switching tears down the SSE stream, clears sessions/messages/context/permissions, and dispatches a fresh `listSessionsCmd` keyed to the new workspace; the result lands as a `workspaceSwitchedMsg` that the Update handler distinguishes from regular `sessionsRefreshedMsg` (so we land on session #0 instead of preserving the old selection). Stale-response guard: if the user switches again before the in-flight response lands, the old `wsID` mismatch makes the handler drop the stale list. Caught + fixed a real rendering bug while doing this: the existing `truncate()` slices on byte indices, which cuts inside ANSI escape sequences when called on already-styled labels (modal showed "…" garbage). Fix: truncate the plain label first, style after. Help overlay updated, paste-blocklist updated. Tests cover open/close/nav/clamp/no-op-current/switch/stale-msg/empty-workspaces (7 tests). Screenshot at `screenshots/17-workspace-switcher.png` proves the modal renders correctly with two workspaces seeded.
- [x] **J2.** SSE exponential backoff — replaced the fixed 750 ms reconnect delay with a 250 ms → 500 ms → 1 s → 2 s → 4 s → 8 s → 16 s schedule, capped at 30 s. `nextReconnectDelay()` is a pure function of `a.sseBackoffAttempts` so tests walk the schedule directly; adds ±25% jitter via `math/rand` so multiple TUI instances reconnecting to the same restarted backend don't thunder in lockstep (floor-clamped to baseReconnectDelay so a low-jitter draw can't go below 250 ms). Reset-on-event: every `sseEventMsg` arrival clears attempts to 0, so a flaky backend that comes back quickly snaps back to the baseline rather than staying at 30 s for the rest of the session. Also defends against negative attempts via clamp (defensive against bookkeeping bugs). 3 unit tests: schedule bounds for every attempt (sampling 50x/level to catch jitter-range drift), negative-attempts safety, reset on event.
- [x] **J3.** Auto-retry connect on transient backend failure — `errMsg` from a connect-stage source ("capabilities", "workspaces", "sessions") now schedules a `retryConnectMsg` via `tea.Tick` on the same exponential schedule the SSE reconnect uses (250 ms → 30 s + jitter, sharing `nextReconnectDelay`'s implementation via `connectRetryAttempts`). Non-connect failures (post-message, etc.) don't retry — those come from user actions and shouldn't loop in the background. `connectedMsg` resets the counter so a flaky backend that comes back snaps to the baseline. From `StageError`, Ctrl+R retries instantly (skipping the backoff and resetting attempts); Ctrl+C still quits; every other key is swallowed so users don't accidentally trigger something against the unconnected backend. Error view advertises both keys + shows the pending auto-retry attempt number. `isConnectStage()` is an explicit allowlist — adding a new connect-stage value requires touching it (intentional friction). 7 tests cover: connect-stage schedules retry, non-connect doesn't, retry-msg only fires in StageError, retry-msg flips to StageConnecting + dispatches connectCmd, Ctrl+R immediate retry, attempts reset on connectedMsg, other keys swallowed in StageError.
- [x] **J4.** SSE Last-Event-ID resume — every incoming `sseEventMsg` now bumps `a.lastSeenSeqID` to `max(current, event.SeqID())` (max-guard so an out-of-order replay can't drag us backwards); `startSSECmd` passes this to `EventStreamScope.LastEventID` so the emulator's ring replays events published during a disconnect. Reset to 0 on `selectSession` — the next session has its own ring and resuming with a stale ID could skip real events or no-op. No backoff-reset conflict: the SSE backoff resets on event arrival (J2), the resume counter tracks the stream position — different concerns, both live on the same event-handler branch. 4 tests: tracks highest (not most-recent) id, out-of-order doesn't regress, two reconnects send the right header via a spy httptest server, selectSession resets the counter. Implementation subtlety caught while writing the test: the initial version held the mock connection open with `<-r.Context().Done()` which serialized the second request behind the first via HTTP/1.1 keep-alive; fixed by having the mock write headers then return immediately so each request gets its own connection without the test needing to drive cancellation.
- [x] **J5.** Preserve in-flight message on post failure — PostMessage failures now emit a `postFailedMsg{text, err}` instead of the generic `errMsg{stage: "post"}` that was triggering StageError. The Update handler restores the text into the textarea and sets a transient hint ("message not sent — press Enter to retry · <error>") so the user sees what happened and can just press Enter again once the backend is back. No more lost drafts on a transient `dial tcp: i/o timeout`. 3 tests: restore-text-and-hint on handler path, doesn't-promote-to-StageError, postMessageCmd actually emits postFailedMsg on a 503 from a real httptest server.
- [x] **J6.** Auto-rename session from first user message — `msgPostedAck` now carries the posted text; `autoRenameTitle()` decides whether this qualifies as a first-message rename (session title empty OR `"new session "` prefixed, AND loaded messages contain at most one user message), and dispatches `patchSessionTitleCmd` if so. `derivedTitle()` takes the first line, collapses whitespace, truncates at 60 chars with ellipsis. Result message mirrors the new title into `a.sessions[i]` so the sidebar updates without a refetch. Silent on PATCH failure — the rename is a nicety, not load-bearing, and an angry toast here would be worse than leaving the "new session HH:MM:SS" placeholder. 9 tests: derivedTitle single/multi-line/whitespace/empty/long-truncation, autoRenameTitle default/empty-title/user-set/second-message/unknown-session/empty-text, patch round-trip through httptest, silent swallow on 500.

## Phase K — Protocol transport + operator quality-of-life

- [x] **K1.** Crush adapter Unix socket transport — `--upstream` now accepts `unix:///path/to/sock` alongside TCP URLs. `ResolveUpstream` builds an `http.Client` whose `Transport.DialContext` dials the socket directly; the base URL internally becomes `http://unix` as a placeholder since the Transport intercepts the dial before the URL's host matters. `ResolveUpstreamTransport` is a separate entry for the long-lived SSE path so it can't accidentally pick up the 10 s RPC timeout (SSE needs `Timeout: 0`). Server now carries both the normalised `upstream` (used for URL concatenation) and the original `rawUpstream` (used when the SSE handler re-resolves a fresh Transport per stream). 7 tests: TCP passthrough, trailing-slash strip, Unix scheme custom Transport, empty-upstream safe default, full adapter end-to-end against a real `net.Listen("unix", …)` server returning Crush-shaped JSON, bare-Transport probe against a minimal Unix socket HTTP server, and TCP fallback round-trip via httptest. Skipped on Windows. README + CLI help updated.
- [x] **K2.** Manual session rename from sidebar — `e` on the selected session opens an inline single-line editor pre-filled with the current title. Enter commits (optimistically updates `a.sessions` then dispatches `patchSessionTitleCmd`, reusing J6's PATCH path); Esc cancels; whitespace-only input commits nothing and shows a "rename cancelled" toast so an accidental Enter-after-backspace doesn't clobber a title with "". Hand-rolled editor (not bubbles/textarea) — single-line, arrow keys/Home/End/backspace/delete, rune-indexed so multi-byte characters don't cut mid-sequence. Overlay reuses the workspace/settings modal chrome for visual consistency. Help overlay + paste-blocklist updated. 7 tests cover open-with-prefill, Esc cancel without PATCH, Enter with optimistic update + PATCH, whitespace-only Enter shows toast, backspace/typing, cursor movement (including clamp at column 0), mid-string insertion. Screenshot at `screenshots/18-rename-modal.png`.
- [x] **K3.** Emulator multi-workspace seeding flag — `emulator-server --seed-workspaces=alpha:/repos/alpha,beta:/repos/beta` adds extra workspaces alongside `ws_default` at boot. `parseSeedWorkspaces` accepts `name:/path` entries, tolerates whitespace and empty entries (between commas), and refuses to boot on malformed input — silently-skipped entries would be worse than a noisy boot failure. Entries get IDs from the store so tests aren't sensitive to ID hashing. 12 parser subtests cover empty/single/multi/whitespace/empty-entry-between-commas/no-colon/colon-at-start/colon-at-end/empty-name/empty-path/partial-list-invalid. 2 E2E tests boot the binary and assert extra workspaces appear on /v1/workspaces alongside the default (names seen `default`/`alpha`/`beta` with correct `root_path`), and a second E2E asserts a bad flag value (`no-colon-here`) exits non-zero with the flag name in stderr. Makes the J1 screenshot workflow not need an external `curl` to POST /v1/workspaces before booting the TUI.
- [x] **K4.** Visual session status indicators — leading glyph per sidebar row: animated 10-frame Braille spinner for running (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 125 ms), static `⚠` for waiting_permission, muted `·` for idle, neutral `○` for unknown statuses (forward-compat). Header "●" badge swapped for the same spinner glyph when the selected session is running, a static `⚠` when waiting for permission. `anySessionRunning()` gates a self-rescheduling `tea.Tick` so idle TUIs don't burn frames; the loop re-arms on idle→running transitions observed via `sseEventMsg` (prev state vs new state comparison guarantees exactly one extra Tick is appended rather than two). Caught + fixed a pre-existing bug while wiring: `session.status_changed` events updated `a.currentStatus` but NOT `a.sessions[i].Status`, so the sidebar row used to show "idle" for running sessions. Now the handler keys on payload.session_id so events for sibling sessions (e.g. subagent turns) mirror into the right row. 5 tests: tick advances frame + re-arms while running, tick drains when all idle, `anySessionRunning` reads both header and sidebar paths, `sessionStatusDot` matches each status including unknown, idle→running SSE transition flips state (so a follow-up tick would reschedule). 3 view goldens regenerated. Two fresh screenshots: `19-status-dot-running.png` (spinner in sidebar + header) and `20-status-dot-permission.png` (⚠ on waiting session, · on idle sibling).
- [x] **K5.** Session delete confirmation — `x` now requires a second press within the same session focus to actually commit the DELETE. First `x` sets `a.pendingDeleteSessionID` to the current session and shows a transient hint ("press x again to confirm delete (any other key cancels)"); a second `x` commits and clears the arm. Any non-`x` key at the top of `handleKey` wipes the arm (including navigation), and `selectSession` explicitly clears it so switching between sessions can't accidentally commit the old one's arm. `x` on a different session re-arms for that one instead of committing the stale arm — defensive even though `selectSession` should have already cleaned up. 5 tests cover first-x-arms, second-x-commits-via-real-DELETE-via-httptest-spy, other-key-cancels-through-top-level-handleKey, selectSession-clears-arm, x-on-different-session-rearms-not-commits. No UI render changes — the hint is already the transient banner above the input pane that J5/G9 introduced.
- [x] **K6.** Input history — per-session history ring (cap 100, consecutive-dupe-suppressed) pushed on every Enter-send. `↑` on empty input (or while already navigating) walks back; `↓` walks forward and restores the pre-history draft past the end. With content already in the input AND not already navigating, `↑/↓` fall through to the textarea so multi-line cursor nav still works — disambiguates the common "user typing" case from the "recall" case without an extra keybinding. `historyDraft` captures what was typed before entering history mode so the user can back out without losing work. Any non-nav keypress exits history mode so the next `↑/↓` returns to textarea cursor nav. Per-session storage (`map[sid][]string`) rather than shared across sessions — switching sessions gives you that session's own recall. Help overlay updated. 11 tests cover push edge cases (empty, no-session, dedupe, cap-trim), Prev walks backwards with clamp, Next restores draft and clears state, Next-when-not-navigating no-op, ↑-on-empty enters mode, ↑-with-content passes through, typing exits mode, Enter pushes, per-session isolation.
- [x] **K7.** Emulator `--seed-sessions` flag — `emulator-server --seed-sessions=ws_default=3,ws_alpha=1` creates N placeholder sessions ("seeded session 1", "seeded session 2", …) in each listed workspace at boot. `parseSeedSessions` mirrors `parseSeedWorkspaces`'s shape: whitespace-tolerant, empty-entry-between-commas OK, refuses to boot on malformed input (non-numeric count, zero count, empty ws_id, missing `=`, bad partial list). 15 parser subtests + 3 E2E tests (happy path with 3 seeded + title assertion, unknown workspace id fails boot with the id in stderr, non-numeric count fails boot with the flag name in stderr). Demos of multi-session sidebar behaviour now set up in one flag rather than requiring POST /v1/sessions × N after boot.
- [x] **K8.** Session archive — `A` (capital) on the selected session dispatches `archiveSessionCmd` which PATCHes `archived=true`. On success the Update handler removes the session from `a.sessions`, shows a "session archived" toast, and if the archived session was the selected one it adjusts the selection: prefer the previous sibling (visually less disorienting than jumping down), fall back to index 0 if we were already at position 0, clear selection + tear down SSE if that was the last session. Archiving a session ABOVE the selected one decrements the selection index so the same session stays focused. Soft-fail on PATCH error (J5/K5 pattern): "archive failed: …" toast, no StageError, sidebar unchanged so the user can retry. Stale "archived" event for an unknown session is a no-op. One-way in this iteration — un-archive UX and the "show archived" filter view are a follow-up. Help overlay updated. 6 tests: A dispatches PATCH (spy via httptest captures body has archived=true), success-removes-and-picks-previous, above-selected-decrements-index, last-session-clears-selection, failure-shows-hint-not-StageError, unknown-session-ignored.
- [x] **K9.** Archived view toggle — `h` in the sidebar flips `a.showArchived` and dispatches `reloadSessionsForView` with the matching `archived=` filter. The result falls into the existing `sessionsRefreshedMsg` branch so selection preservation keeps working. In the archived view, `A` sends `archived=false` (un-archive) rather than `archived=true`; the session again drops from the current list. `archiveSessionCmd` gained a `value bool` parameter; `sessionArchivedMsg` carries `archived bool` so the Update handler picks the right verb for the toast ("session archived" vs "session un-archived"; "archive failed" vs "un-archive failed"). Help overlay updated. 5 new tests: `h` dispatches two fetches with/without the archived filter (via spy httptest), `h` without workspace flips flag but skips the fetch, `A` in archived view sends `archived=false` to the PATCH, un-archive hint copy, default-view cases still pass. One test-file discovery surfaced: `KeyPressMsg{Code:'A', Mod: ModShift}` without `Text:"A"` isn't rendered by `k.String()` as `"A"` — needs all three fields matching the existing K8 test pattern.
- [x] **K10.** Copy last assistant message to clipboard — `y` in body focus writes the concatenated text of the newest assistant message to the system clipboard via `github.com/atotto/clipboard` (promoted from indirect to direct). `lastAssistantText()` walks messages in reverse, joins multiple text parts with blank-line separators, fences thinking parts in `<thinking>…</thinking>` so downstream consumers can strip them, and skips tool_call parts (they rarely carry copy-worthy free text). Assistant messages with ONLY tool-calls yield `ok=false` so the user gets a "nothing to copy" toast rather than an empty clipboard. `clipboardWrite` is a package-level var so tests can swap the backend and capture writes; production path calls `atotto.WriteAll`. Soft-fail on clipboard errors (e.g. no xclip installed) — transient "copy failed: <err>" hint, no StageError. Pick of "last assistant" (rather than a message cursor) is pragmatic first-cut; per-message yanks would need a body-level cursor, which is a follow-up. 10 tests cover empty slice, no-assistant-in-slice, most-recent-only selection, multi-part join, thinking fence, tool_call skip, tool-call-only yields false, handler path copies + hint, nothing-to-copy toast, and clipboard-failure toast.
- [x] **K11.** Sidebar session title filter — `/` in sidebar focus opens an inline filter editor; typing appends to `a.sessionFilter` (case-insensitive substring match on title); Enter commits (filter persists, exits edit mode); Esc reverts to the pre-`/` snapshot and exits. Nav (↑↓/jk, g/G, PgUp/PgDn) skips filtered-out sessions via `stepSelectionVisible(delta)` — selections walk through the visible subset in O(sessions) per step, so a filter hiding most entries still navigates naturally. Sidebar renderer takes `visibleSessionIndexes()` for both the scroll math and the selection-is-visible arithmetic; "↑ N more" / "N more ↓" indicators now count visible sessions. When the filter matches nothing, a muted "(no matches)" row appears and `ensureSelectedVisible` deliberately leaves selection alone so clearing the filter restores the user's position. Filter indicator is rendered at the top of the SESSIONS section: bold italic warning-coloured, with a cursor-`_` while editing. 10 tests cover slash-enters-mode, typing-narrows-list, backspace (including empty-safe), Enter-commits, Esc-restores-snapshot, nav-skips-hidden, g-jumps-to-first-visible, ensureSelectedVisible finds-match + empty-match-preserves-position, case-insensitive match.
- [x] **K12.** Emulator `--seed-messages` flag — `emulator-server --seed-messages=ses_a=3` seeds 3 user+assistant placeholder pairs in session `ses_a` (counted as "turns", so N=3 creates 6 messages). Same parser shape as K3/K7 — whitespace tolerance, empty-entry-between-commas OK, refuses to boot on malformed input (non-numeric count, zero/negative, bad partial list). Unknown session ID fails boot with the ID in stderr rather than silently dropping seeds. 15 parser subtests + 2 E2E (rejects-unknown-session, bad-syntax-fails-boot). Honest-coverage note in the test file: the happy-path E2E (chain --seed-sessions → --seed-messages in one boot) isn't exercised at the process level because seeded sessions get hash-based IDs; exposing explicit IDs is a separate follow-up. Interior logic is a straight fold with no branching, so parser + reject + bad-syntax together cover every branch.
- [x] **K13.** Retry last user message — `R` (shift+r) in body focus walks `a.messages` backwards for the most recent user message, concatenates its text parts, and dispatches `postMessageCmd` to resend. No-op + "no user message to retry" hint when no user message exists (or the most recent carries only non-text parts like an image). No-op when no current session. Transient "retrying…" hint confirms the action. Complements J5 which preserved the draft on transient failure — this is the complement for the case where the draft was already sent, accepted, and the agent's response went sideways. Reuses `postMessageCmd` so the response flows through the same pipe (SSE echoes back, cost updates, history append). `lastUserText` helper is parallel to `lastAssistantText` from K10 — same walk-reverse shape, same blank-line join for multi-part, but no thinking-fence path (user messages never carry thinking). 8 tests: empty slice, no-user, most-recent only, multi-part join, image-only yields false, handler dispatches POST via httptest spy on body, no-user shows hint, no-session no-op.
- [x] **K14.** Context files add from TUI — `o` in sidebar focus opens an inline "add to context" prompt (same modal chrome + editor primitives as K2 rename: rune-indexed cursor, arrow/home/end/backspace/delete, Enter to commit, Esc to cancel). Commit POSTs `{path, mode:"read"}` to `/v1/sessions/{id}/context/files`. Result lands as `contextFileAddedMsg`; success mirrors the returned file into `a.contextFiles` so the sidebar reflects it without a refetch. Stale-response guard: only mirrors when `a.currentSessionID() == m.sessionID` (session switch between post and response = drop). Whitespace-only input cancels (empty path would 400 anyway, better to skip the round-trip). Soft-fail on POST error — "add failed: …" toast, no StageError. Removal left to the existing `/drop` slash command (documented in the modal's hint line). Help overlay + paste-blocklist updated. 9 tests: o-key-opens, o-no-session no-op, Enter-POSTs (spy captures path round-trip), empty-path cancels, Esc cancels, typing + backspace cursor math, success mirrors into sidebar, failure shows hint without mirroring, stale response for a switched session is dropped. Screenshot at `screenshots/21-context-add.png`.
- [x] **K15.** Token budget footer polish — footer already showed raw token counts `(15000 in / 600 out)`; replaced with human-readable `humanTokens()` formatting (`1.5K`, `15K`, `150K`, `1.5M` with decimals only below 10× a unit, matching Kubernetes resource-quota conventions). Added threshold colouring: tokens render muted below 100K, warning-yellow at 100K–150K, danger-red at 150K+ — gives users a visual cue before they hit typical frontier-model context-window limits (Sonnet/GPT-4 Turbo are 200K). 16 tests cover the full formatting range including rounding edges (9999 → "10.0K", 10000 → "10K" with the decimal dropped past 10×).
- [x] **K16.** SSE reconnecting indicator — while `a.sseBackoffAttempts > 0` the footer shows `(reconnecting…)` next to the focus label in warning-yellow italic. Piggybacks on J2's existing reset-on-event behaviour — the indicator disappears the instant the stream is healthy, no separate clear path. 2 tests verify hidden-when-healthy and visible-during-backoff via the raw footer render.
- [x] **K17.** Deterministic IDs for seeded sessions — seeded sessions now use `ses_seed_<wsID>_<n>` as their ID instead of the store's default hash-based scheme. Same CreateSession code path; the store accepts caller-supplied IDs. Unlocks chained seeding: `--seed-sessions ws_default=2 --seed-messages ses_seed_ws_default_1=3` in one boot now works because the session IDs are predictable from the flag values. Existing tests keep passing because they only asserted presence, not ID shape.

## Phase L — UX feedback from review (floating overlays, expand/collapse, richer content)

Reviewer feedback captured in `feedback_tui_ux_direction.md`. Items:

- [x] **L1.** Richer default scenario — default script grew three new trigger-based branches: "long"/"explain"/"writeup" → `runLongScript` (≈60-line assistant writeup about rendering strategy, self-referentially discussing the exact compact-vs-dump question L3 targets), "log"/"dump"/"traceback"/"logs" → `runBigToolScript` (shell tool call returning ≈80 lines of synthetic server log, including a panic + retry storm to make skimming easy), "many tools"/"multi tool" → `runMultiToolScript` (three tool calls in one turn: read_file → grep → edit_file). All three terminate cleanly with a final assistant text + idle status. Empty-state crib lists the new prompts so discoverability lands at the same time. 3 smoke tests assert each branch produces the expected events + content shape (e.g. big tool output > 2KB, contains "panic recovered"; multi-tool emits exactly 3 tool.call.completed). Screenshot at `screenshots/22-long-reply.png` shows the current "just dump it all inline" rendering — clean baseline for L3 to improve against.
- [x] **L2.** Floating modal overlays — `overlay()`'s `padOrInsert` was discarding the base row entirely (`prefix + insert`), which is why every modal looked like a black bar across the screen with the window on top. Rewrote as `spliceRow` using `github.com/charmbracelet/x/ansi` (already a transitive dep) to cut base content at display-cell granularity, preserving content LEFT and RIGHT of the modal with a reset-SGR between segments so background colours can't leak past the modal's edges. Base row gets padded with spaces if shorter than `startX`, and a modal that overflows past the base's right edge gracefully drops the right chunk. Introduced `modalWidth()` as a shared constant (72 cells, clamped by `a.width-8`) and migrated every modal view (palette, help, settings, metrics, rename, workspace switcher, context-add) to use it — settings no longer shifts width between "Model" and "Agent" tabs. 6 tests cover: base preserved around centered modal, vertical centering doesn't touch rows outside the modal Y range, short base padded to startX, startX=0 (no left segment), modal past end of base (no right segment), ANSI styling preserved across splice (right-chunk retains expected display width after an SGR reset). Screenshots at `23-floating-settings.png` and `24-floating-workspace.png` show the conversation visible around both modals with identical widths. Unblocks L3 (expand/collapse uses the same floating chrome).
- [x] **L3.** Expand/collapse for bulky parts — tool_result parts that exceed `toolResultPreviewLines` (8) render with a preview of the first 8 lines + `[N more lines — Ctrl+E to expand]` footer in muted italic. `Ctrl+E` from anywhere (non-modal context) opens a floating detail view that reuses L2's chrome. The detail view wraps the content at the modal's inner width, paginates with `↑/↓ · j/k · PgUp/PgDn · g/G`, shows `line X–Y of Z` progress in the title, and closes on `Esc` or `Ctrl+E`. "Most recent bulky" heuristic (`findLatestBulkyPart`) mirrors K10/K13's target-the-newest pattern — a proper part cursor is a follow-up. `flattenToolResult` concatenates the tool_result's text sub-parts. 13 tests cover collapse math (short-passes-through, long-clips-to-N, trailing-newline doesn't inflate), lineCount edge cases, ctrl+E end-to-end (opens with newest bulky, nothing-to-expand toast, Esc closes with scroll reset, up-at-zero clamps, PgDn advances by page size), render emits "N more lines" hint and "Ctrl+E" reference. Screenshots: `27-bulky-collapsed.png` shows the preview, `28-bulky-expanded.png` shows the floating detail opened over the conversation (L2 chrome showing the sidebar + partial convo visible around it), `29-bulky-scrolled.png` shows PgDn paginating through the 130-wrapped-lines output to reveal the panic+retry storm section.
- [x] **L4.** Claude-Code-style conversation demarcation — tool_call parts now render as `ToolName(arg_summary)` headers (`Bash(cd /tmp && ls)`, `ReadFile(main.go)`, `Grep(println)`, `EditFile(main.go)`). `capitalizeToolName()` CamelCases snake_case names. `toolCallSummary()` pulls the primary arg inline for well-known tools (bash/shell → `command`, read/cat → `path`, grep → `pattern`, web_search → `query`); unknown tools fall through to the existing JSON-oneline. Summary truncates with `…)` when the header would exceed the pane width. tool_result parts now lead with `⎿` and continuation lines indent 3 cells so output reads as a block under its call. Errors get a red `(error)` tag on the first line. Thinking parts got the same `⎿ thinking` treatment for visual consistency. Screenshot at `screenshots/25-tool-demarcation.png` shows three consecutive tool calls in the multi-tool scenario rendered as `ReadFile(main.go)` / `Grep(println)` / `EditFile(main.go)` headers. 7 tests cover CamelCase conversion, summary extraction per tool-type (incl. missing-key fallback), basic tool_call shape, width-triggered truncation, tool_result leading glyph + continuation indent, error-tag rendering, thinking glyph. E2E happy path + streaming-golden updated to match new shape. Hiding the still-emitted `● TOOL` role header between tool calls is a follow-up polish pass.
- [x] **L5.** Full slash command surface — `/mcp`, `/tools`, `/skills`, `/agents` now open dedicated modals. `/mcp` and `/tools` hit their respective catalog endpoints and render a kind-agnostic `catalogItem` list (title + description + optional status tag — MCP shows `[connected]`/`[disconnected]`). `/skills` shows a forward-compatible stub since the contract doesn't yet include a skills endpoint; `/agents` redirects into the existing Settings > Agent tab which already has a richer picker. Emulator's static command list grew to include all four entries. Modal state lives on App as `catalogBrowserOpen`/`catalogBrowser`; `catalogCommandForID` maps IDs → kinds so palette-Enter routing is a single line. `loadCatalogBrowserCmd` dispatches the fetch per kind. 2 tests cover ID→kind routing and open→loaded→close state. Screenshots 51-53 show MCP / Tools / Skills views.
- [x] **L6.** Deeper settings modal — expanded from 2 tabs (Model, Agent) to 4 (Model, Agent, Theme, TUI). `settingsTabCount = 4` is a single source of truth so Tab/Shift+Tab wrap-around can't drift. Theme tab: dark/light picker; Enter swaps `a.Theme` via `ThemeForMode` live — same plumbing K9 uses — with a toast noting persistence requires `--theme` flag or config. TUI tab: read-only surface of current runtime config (backend URL, voice cmd, theme, AltScreen state) so users can confirm state without grepping the config file. Ctrl+S pre-seeds `themeSel` to the active theme so re-opens don't regress. Autocompaction + other per-session contract settings deferred to follow-up — they need backend plumbing the emulator doesn't expose yet. 8 tests cover tab cycle + reverse-cycle + wrap, theme ↑/↓ clamps, Enter live-swap, TUI tab Enter closes, themeSel pre-seed on light, themeName + boolPretty. Screenshots `30-settings-theme.png` + `31-settings-tui.png`.
- [x] **L7.** Discoverability — reworked the help overlay from a flat list into five pane-grouped sections: Global, Sidebar, Conversation body, Input, Permission pending. Sidebar manipulation keys (n/x/e/A/h/o/`/`) are now contiguous under one heading so reviewers who ask "can I rename sessions?" see the answer at a glance rather than scanning a 30-row flat list. Added inline notes that were missing before: "press x again to confirm" on delete, "auto-loads messages" on ↑/↓, "un-archive in archived view" on A, "per-session history" on empty-input ↑. Screenshot `26-help-overlay.png` captures the new layout. Help golden regenerated.

## Phase M — Bugs + feature asks from second-round user testing

All items captured in `.claude/projects/-home-jcernuda-tui/memory/feedback_tui_input_and_layout.md` and filed as GitHub issues #1–#7. All closed this iteration.

- [x] **M1.** Footer disappeared on tall conversations (bug). Root cause: renderBody wasn't clipping the message pane to its allotted height; extra rows bled into the footer row. Fixed by clamping every pane to its budget (`clampLines`) and belt-and-braces clamping the final joined view to `a.height`. Test `TestFooter_StaysInFrameOnLongConversation` ensures last row still has the Ctrl+N hint with a 40-message conversation; `TestRenderBody_ReturnsExactHeight` bounds total lines across 4 viewport sizes. Screenshot 32.
- [x] **M2.** Shift+Enter / `\`+Enter inserts a newline (bug). Rebound textarea's `InsertNewline` keymap to `{shift+enter, alt+enter, ctrl+j}` — the default was `{enter, ctrl+m}` which fought our "Enter sends" rule. Also honours trailing-backslash + Enter for Claude-Code muscle memory (`\<Enter>` always works, doesn't need Kitty protocol). Tests: `TestShiftEnter_InsertsNewline`, `TestBackslashEnter_InsertsNewline`.
- [x] **M3.** Paste no longer creates multiple prompts (bug). Added `inPaste` flag set by `PasteStartMsg`/`PasteEndMsg`; while set the Enter interceptor stands down so embedded newlines flow to the textarea instead of flushing. Protects terminals that split paste into KeyPressMsg streams between Start/End events. Test: `TestEnter_InPaste_DoesNotSend`.
- [x] **M4.** Compressed paste display (#1). Pastes ≥ 3 lines render as `[pasted content #N: L lines]` in the input; real body stashed on `App.pastes`. Ctrl+P expands the most recent in-place; Enter auto-expands any surviving placeholder before dispatching. Tests: `TestPaste_MultiLineCompresses`, `TestPaste_ShortPassesThrough`, `TestPaste_CtrlPExpandsLatest`.
- [x] **M5.** Floating compose modal (#2). Ctrl+G (or Ctrl+Shift+P on Kitty-protocol terminals) opens a big textarea seeded with the current draft. Plain Enter inserts newline inside the modal. Ctrl+S commits back; Esc cancels preserving pre-modal draft. Compressed pastes inline on open. Tests: `TestCompose_OpenCommitCancel`, `TestCompose_ExpandsPastesOnOpen`. Screenshots 44-46.
- [x] **M6.** @ file-reference fuzzy picker (#3). `@` at start-of-word opens a workspace-files picker; selection inserts `@path` into the buffer AND attaches the file to the session context (mode=read) via `AddContextFile`. Emulator's static file list grew from 3 to 17 entries so the picker has real material to match. Tests: `TestFilePicker_OpensOnAtAndInserts`, `TestFilePicker_AtMidWordPassesThrough`. Screenshots 48-50.
- [x] **M7.** Scenario discoverability (#4). New "Scenarios" tab in the help overlay lists every trigger keyword with its effect; always reachable via `?` even after the empty-state crib disappears. Screenshot 47.
- [x] **M8.** Slash commands actually execute. Root cause in emulator's `handleSessionCommand`: it only recorded the invocation. Now `/clear` wipes messages (+ `session.cleared` event → TUI reload), `/cancel` halts the run (shared plumbing with cancel endpoint), `/help` / `/diff` / `/undo` emit assistant notes. TUI optimistically clears on `/clear` for instant feedback. Test `TestCommands` verifies `/clear` wipes + `/help` emits an assistant note.
- [x] **M9.** Tabbed help overlay (#7). Split the help list into 5 (now 6 with Scenarios) tabs so it fits at 80x24. ←/→/h/l/Tab navigate. Tests: `TestHelpOverlay_TabCycles`, `TestHelpOverlay_FitsInSmallViewport`. Screenshots 36-40, 47.
- [x] **M10.** Configurable collapse threshold (#6). `Theme.CollapseThreshold` controls the tool_result preview budget; Settings > TUI exposes a ◀/▶ stepper; default lowered from 8 to 5 per user feedback. Test: `TestCollapseThreshold_ArrowKeysAdjust`. Screenshots 41-43.

## Phase O — Themes + ecosystem polish

## Phase U — tiny wins

- [x] **U1.** `gact list --format json` emits indented JSON of the Session slice. `--format tsv` (default) keeps the existing tab output. Unknown format → exit 2.
- [x] **U2.** Window title appends `(running)` or `(waiting)` for non-idle sessions so tab bars surface attention targets without bringing the TUI to the foreground.

## Phase SS — diff CLI

- [x] **SS1.** `gact diff list <sid>` lists every file_diff part in the session (path + pending/applied/rejected); `gact diff apply|reject <sid> [paths...]` invokes the existing apply/reject endpoints. Empty paths means "all pending". CLI test runs the full propose→list→apply→list cycle.

## Phase RR — permissions CLI

- [x] **RR1.** `gact perms {list,allow,deny,allow-session,allow-workspace}` — full permission CLI mirroring the TUI a/d/s/w keys. CLI test triggers a permission scenario, locates the pending id, allows, and verifies resolved status.

## Phase QQ — pretty stream

- [x] **QQ1.** `gact stream [SID] [--workspace WS_ID]` pretty-prints SSE as a one-line timeline (`HH:MM:SS  type  summary`). Per-event-type summary helpers keep `tail` for json + `stream` for humans. Real-emulator CLI test asserts the row format.

## Phase PP — bug-report bundle

- [x] **PP1.** `gact dump-bundle [-o DIR]` writes version.txt + diag.txt + metrics.json + sessions/<sid>.json into one directory. Best-effort (backend offline still produces local-only files). CLI test verifies each artefact lands.

## Phase OO — catalog CLI

- [x] **OO1.** `gact catalog tools|agents|mcp|commands [--format tsv|json]` — single CLI surface spanning all read-side catalog endpoints. Tested for all four kinds + JSON format + unknown-kind exit-2.

## Phase NN — context CLI

- [x] **NN1.** `gact context {list,add,rm} <sid> [path] [--mode]` — verb-then-flags shape (git/kubectl style). Round-trip CLI test exercises list → add ×2 → list → rm → list. Completion scripts list `context`.

## Phase MM — install + scripts dir

- [x] **MM1.** `make install` (with `PREFIX` / `BINDIR` overrides) copies both binaries to `$BINDIR`. `make uninstall` removes them. Tested via `PREFIX=/tmp/...` round-trip.
- [x] **MM2.** `scripts/completion.sh` shell-aware print of `gact completion` install snippet. Bash / zsh / fish supported.

## Phase LL — summary + completion

- [x] **LL1.** `gact summarize <sid>` triggers POST `/v1/sessions/{id}/summarize`, refetches, prints the updated session.summary. Completion scripts updated to list every subcommand. CLI test.

## Phase KK — one-shot scripting

- [x] **KK1.** `gact quick <q|-> [--keep]` — one-shot create + ask + delete. Default workspace via /v1/workspaces[0]. CLI test asserts session count unchanged after run, proving cleanup.

## Phase JJ — observability

- [x] **JJ1.** `gact metrics [--format text|json]` summarises uptime / session counts / token totals / cost. JSON format for scrapers, text for humans. CLI test for both.

## Phase II — archive + completion

- [x] **II1.** `gact archive <sid>` / `gact unarchive <sid>` — flip session.archived. Single runArchive(args, archived bool) handles both. CLI test exercises new → archive (gone) → unarchive (restored).
- [x] **II2.** `gact completion bash|zsh|fish` — static scripts; `gact completion bash > /etc/bash_completion.d/gact` works. CLI test verifies all three shells emit a non-empty script.

## Phase HH — session management CLI

- [x] **HH1.** `gact delete <sid>` removes a session. CLI test asserts the session disappears from `gact list` after.
- [x] **HH2.** `gact rename <sid> <title>` PATCHes the title. CLI test confirms the new title surfaces in `gact list`.

## Phase GG — session creation CLI

- [x] **GG1.** `gact new [--workspace WS_ID] [--title T]` prints the new session id; defaults workspace to first listed and title to current UTC time. CLI test round-trips through `gact list`.

## Phase FF — q&a CLI

- [x] **FF1.** `gact ask <sid> <q|->` — send + wait + print latest assistant reply text. Snapshots pre-send count so it picks the new reply even when subagents fan out. Stdin via `-`. CLI test.

## Phase EE — repo ergonomics

- [x] **EE1.** Top-level `Makefile` with build / test / test-race / vet / fmt / run-emulator / run-tui / ping / list / screenshots / clean / help targets. PORT/THEME/TIMING overridable via env. README quickstart links the targets.

## Phase DD — docs + log

- [x] **DD1.** README "CLI subcommands" section — every Phase T-CC subcommand documented with one-line description + pipe-composition example.
- [x] **DD2.** `gact log <sid> [--limit N]` prints role-headered conversation: text bodies, `→ tool(args)` for tool_call, `⎿ output` for tool_result, `(thinking)` prefix. Plain ASCII (greppable). CLI test asserts USER + ASSISTANT headers and user text appear after a run.

## Phase CC — operator-tools fill-in

- [x] **CC1.** `gact cancel <sid>` POSTs the cancel endpoint. Idempotent. CLI test.
- [x] **CC2.** `gact run <sid> <text|->` combined send+wait. Stdin sentinel via `-`. Honours --timeout / --interval. CLI test.

## Phase BB — scripting follow-ups

- [x] **BB1.** `gact wait <sid> [--timeout] [--interval]` polls status until idle. Exit 2 on timeout. Full CLI test exercises send → wait → verify idle against a real emulator.

## Phase AA — scripting

- [x] **AA1.** `gact send <sid> <text|->` posts a user message; prints the returned `msg_id`. Stdin pipe via `-`. reorderFlagsFirst taught to preserve lone `-` as positional. Full CLI test.

## Phase Z — cursor-aware everything

- [x] **Z1.** `Ctrl+E` respects the Y1 cursor. `findBulkyPartIn(msg)` scans a single message; falls back to `findLatestBulkyPart` when the cursor is off or the selected message has no bulky content.

## Phase Y — body-focus cursor

- [x] **Y1.** Body-focus message cursor (`n` next, `N` prev; idx=-1 off by default). Left-gutter `▌` in Secondary when set; takes precedence over the V3 search marker. Session switch resets.
- [x] **Y2.** d / y / R route through the cursor when set (drop/copy/retry THAT message); fall back to "latest" when the cursor is off. Delete clamps cursor to new last-index. Cursor-on-assistant + R emits a hint rather than sending the wrong text.

## Phase X — CLI + backend surface

- [x] **X1.** `gact tail [SID] [--workspace WS_ID]` streams SSE events as JSON lines (`{"type", "seq", "payload"}`). Kill via Ctrl+C or upstream closing the stream.
- [x] **X2.** `gact ping [-q]` probes `/v1/health`; exits 0 healthy, 1 otherwise. Full CLI tests cover live + unreachable.

## Phase W — session utilities

- [x] **W1.** `/duplicate` creates a fresh session with title+` (copy)` + cloned model + cloned agent. Dispatches sessionCreatedMsg so the new session lands in the sidebar and becomes active. Test + emulator catalog + help entry.

## Phase V — operator tools

- [x] **V1.** `gact export --all -o DIR [--workspace WS_ID]` bulk-exports sessions to one JSON file per session. Tolerates per-session failures; summary to stderr; exit 1 if any failed. Full CLI test against a real emulator binary.
- [x] **V2.** `sseHealthDot()` in the header — green/amber/red glyph keyed to the SSE stage. Users glance-verify the stream without scanning the footer.
- [x] **V3.** `searchHitMessageID` + left-gutter `▶` marker applied when the user hits Enter on a `?search` result. Marker clears on session switch. Per-character highlight within the match string deferred — gutter attention alone was enough without threading the query through glamour.

## Phase T — terminal integration

- [x] **T1.** `tea.View.WindowTitle` set to `GACT — <session title>` (fallback: bare `GACT`). bubbletea's renderer diffs against the previous frame so the escape sequence only fires when the title actually changes. Test covers both branches.
- [x] **T2.** `gact list [--backend URL] [--workspace WS_ID]` prints tab-separated rows (id, status, title, updated_at RFC3339). Pipelines like `gact list | awk '$2=="waiting_permission" {print $1}'` work out of the box.
- [x] **T3.** Emulator `--walk-files` flag. When set AND a workspace's RootPath exists on disk, the handler walks the real tree (up to 2000 entries; skips dotfiles + node_modules + vendor + target). Test covers the happy path and confirms static-demo entries are suppressed in walk mode.

## Phase S — render polish

- [x] **S1.** Body-focus `t` toggles per-message timestamps. Faint-italic row under the role header when on; skipped on tool-result messages whose header is already suppressed. Not persisted (live debugging aid). Test covers both flip states.
- [x] **S2.** Ctrl+E now expands long assistant text too. findLatestBulkyPart extended to consider PartTypeText; title reflects "tool_result · N lines" vs "assistant text · N lines" so the detail view header tells the user which kind they opened. Inline compression of text parts deferred — plain text scrolls fine in the body; this feature is about the paginated detail view entry point.

## Phase R — discoverability + diag

- [x] **R1.** `gact diag` prints version + contract + runtime + platform + config path + every config field + custom theme file status + GACT_* env vars. Non-interactive; exits after printing. Users can paste the output into bug reports without opening the TUI.
- [x] **R2.** Sidebar ends with a faint-italic "N active · M archived" row (flips ordering in the archived view so the first number always matches what's shown). Screenshot 54 confirms.
- [x] **R3.** `gact version` now reads runtime/debug.ReadBuildInfo() and prints the git revision (+ `(dirty)` when vcs.modified is set), commit time, and Go toolchain. Works automatically on any `go install` build.
- [x] **R4.** `gact emit-config` prints a sample config.json to stdout with every field + its default (JSON doesn't allow comments so field names serve as docs). Redirect to `~/.config/gact/config.json` for a starting point.

## Phase Q — polish round four

- [x] **Q1.** README refreshed — theme gallery (Dracula + solarized-light + picker + tokyo-night), custom-theme schema, Phase-M/N/O keymap additions, updated TUI implementation summary.
- [x] **Q2.** `Ctrl+Alt+T` (Kitty-protocol terminals) + `/theme-next` / `/theme-prev` slash commands cycle palettes in-place. CollapseThreshold + cost thresholds preserved across the swap; persists via SaveConfig. Tests cover wrap-around + threshold-survive. No Kitty-free one-key equivalent — `/theme-next` is the portable path.
- [x] **Q3.** Palette surfaces the active state for `/theme /clear /cancel /agent /rename` via `paletteCurrentValue(id)`. Secondary-italic suffix after the title keeps the primary identifier prominent. Test + screenshot 64.
- [x] **Q4.** `/theme-export` serialises the active palette to `~/.config/gact/theme.json`. Round-trip safe with LoadCustomTheme (exported `name` field matches the active ThemeMode). Test `TestExportThemeJSON_Roundtrip` exports Dracula, reloads, asserts Bg RGBA preserved.

## Phase P — polish round three

- [x] **P1.** Per-theme glamour StyleConfig — `glamourStyleFromTheme(Theme)` derives an `ansi.StyleConfig` from the theme's palette (Document/Heading → Fg+Primary, Code → Warning on BgSubtle, Link → Secondary, etc.). Cache keyed by `ThemeModeName + width` so swaps invalidate naturally. Screenshots 60/61 show the result on Solarized-Light and Dracula.
- [x] **P2.** Custom theme import — `~/.config/gact/theme.json` (single file) loaded at startup; palette appended to AllThemeModes as `ModeCustom`; ThemeModeFor checks custom first so user-vs-builtin collisions prefer the user's file. Tests cover load + missing-file + round-trip. Screenshots 62/63.
- [x] **P3.** Cost-meter thresholds configurable — `Theme.CostWarnTokens` / `Theme.CostDangerTokens` (defaults 100K/150K via applyStyles) + config.json fields. Footer colour branch reads from the theme so local-model users can lower thresholds. Stepper rows in Settings > TUI deferred (the array-of-steppers pattern needs its own component; current TUI tab only handles one row).
- [x] **P4.** Collapse hint upweights the Ctrl+E pointer (Secondary + bold) so it matches the footer affordance grammar. Muted-italic wrapper still, but the key itself pops.

- [x] **O1.** Ship 5 new palettes + fix light (#8). Added Dracula, Solarized Dark, Solarized Light, Nord, Tokyo Night. Replaced the horrifying white light theme with a Gruvbox-inspired warm-cream variant. Settings > Theme cycles all 7 palettes with live preview on ↑/↓ and persists the choice via `config.json` (name ⇌ ThemeMode via `ThemeModeName` / `ParseThemeMode`). `ThemeModeFor(theme)` reverse-lookup lets SaveConfig serialise the active palette without tracking mode on the Theme struct. Screenshots 54-59 show each theme applied. Tests updated (`TestSettings_ThemeTabUpDownCycle` walks all 7, `TestThemeName` uses palette-identity matching).

## Phase N — Follow-up polish after second-round feedback shipped

Concrete, small-surface improvements that round out the M-phase features. Each one is tight enough to ship in a single iteration; pick from the top.

- [x] **N1.** Per-session input draft preservation. `swapInputDraftFor(sid)` stashes the outgoing session's buffer and restores the incoming one; successful sends drop the saved draft to prevent resurfacing. `lastLoadedSessionID` field tracks the buffer-owning session so the swap works even though callers update `a.selected` before calling `selectSession`. 2 tests cover A→B→A→B preservation and send-clears-draft.
- [x] **N2.** Two-step /clear confirmation. A true undo path would need a backend restore API that doesn't exist in the contract; the practical defense is to force a second press. First `/clear` arms `pendingClearSessionID` + a "press again to confirm" toast; second press (only if still armed for the same session) actually wipes; anything else cancels. Session switch clears the armed state same as K5's delete pattern. Test: TestClear_RequiresDoubleConfirmation.
- [x] **N3.** Message-level delete — `d` on body focus drops the most recent message (K10/K13 "target latest" pattern, optimistic local removal + background DELETE /v1/messages/{id}). Client grew `DeleteMessage`; `deleteMessageCmd` wraps it as a fire-and-forget tea.Cmd. A per-row cursor would be nicer but costs real complexity; "latest" covers the "I messed up the last turn" case that prompts this feature. Test: TestDeleteLastMessage_DropsLocally.
- [x] **N4.** `/sessions` slash command — focuses the sidebar and pre-arms the K11 title filter so the user can immediately type to narrow the session list. Cheaper than a second dedicated modal and reuses the existing filter code path. Test `TestSessionsSlashCmd_FocusesSidebarFilter` covers the palette-Enter wiring.
- [x] **N5.** Persist Settings > TUI collapse threshold via `config.json`. `Config.CollapseThreshold *int` serialized alongside backend_url/theme/voice_command; `config.Save(cfg, path)` helper writes with 0o755 parent-dir creation + 2-space indent for human diffability. `App.SaveConfig` hook fires on every ◀/▶ stepper click; `App.Theme.CollapseThreshold` seeds from the persisted value on startup. Tests: `TestSaveLoadRoundtrip` + `TestCollapseThreshold_CallsSaveConfig`.
- [x] **N6.** Conformance suite coverage bump. Added three new sections — `Commands_List`, `Tools_List`, `Metrics` — each with a matching `Skip*` flag. Emulator now exercises all of them via `TestE2E_Conformance`; Crush + OpenCode adapters skip them because neither adapter proxies those endpoints yet (tracked as follow-ups in their READMEs). Backends that declare command/tool/metrics capability but return 501 now fail loudly rather than silently passing.
