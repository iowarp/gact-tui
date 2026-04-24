# LOOP — gact-tui ↔ clio-agent integration

> **Living document.** Edit freely as the work reveals what's missing. The /loop skill reads this verbatim each iteration, so clarifications here propagate to the next turn without having to restate them in prose.

## Mission

Close CLIO ↔ GACT feature parity one capability at a time, across the **three surfaces** (spec → CLIO Python → TUI). End state: everything CLIO can do is driveable from gact-tui through **GACT v0.2** — the new CLIO-aligned contract. **The contract evolves to match CLIO, not the other way around** — CLIO is the gold standard.

Two repos are in play simultaneously. Both need the same branch discipline: feature-branched off an integration branch.

### v0.1 → v0.2 policy

- **v0.2 is a superset of v0.1** with CLIO-native primitives promoted to first-class (expert routing + selection, ARC memory surface, per-tool telemetry, routing rationale, provider integrations, etc.).
- **Anything v0.1 has but CLIO doesn't support yet** → file a GitHub issue on iowarp/clio-agent framed around CLIO's own mission, NOT around the TUI integration. Each issue stands on its own merits. Bookkeeping tracker at `clio-agent/docs/tui/GAPS.md` on `tui-integration` — but the canonical artefacts are the issues, not the list.
- **Other v0.1 adapters** (claudecode/opencode/crush/goose) declare v0.2 features as `unsupported` via `/v1/capabilities` until they catch up. TUI gates rendering on the advertised capabilities.

## Branches (important — don't commit to the wrong one)

| Repo | Working branch | Off of | Role |
|---|---|---|---|
| `/home/jcernuda/tui/` (gact-tui) | **`clio`** | `main` | all TUI + adapter + GACT contract work |
| `/home/jcernuda/tui/clio-agent/` (clio-agent, gitignored here) | **`tui-integration`** | `develop` | all CLIO Python/FastAPI work for the TUI integration |

`develop` (on clio-agent) is the stable integration trunk. `tui-integration` is where this loop lands commits. Once a phase completes + is reviewed, we merge `tui-integration` → `develop`. Do **not** commit directly to `develop` or `main` on either repo.

## The three surfaces

No Go adapter. CLIO is Python; the GACT-conformant REST surface lives **inside** clio-agent as `src/clio_agent/gact/` on `tui-integration`. The TUI points `GACT_BACKEND` directly at it. The REST boundary IS the bridge — we don't need a second process to translate.

Not every iteration touches all three. Walk them in the order below — if step 1 sufficiently defines the feature, skip ahead.

1. **`/home/jcernuda/tui/contract/SPEC.md`** — extend GACT v0.1 when CLIO has a primitive the contract can't express (per-tool SSE events, token streaming, cancellation, ARC introspection).
2. **`/home/jcernuda/tui/clio-agent/src/clio_agent/gact/`** (on `tui-integration`) — CLIO Python + FastAPI. Implement the GACT v0.1 surface by wrapping `ClioAgent`. This is the main code output of most iterations.
3. **`/home/jcernuda/tui/tui/`** — Bubbletea TUI. Render whatever new primitive lands. Visual verification mandatory (see Quality gates).

Deployment shape: `gact agent deploy clio my-clio` spawns the `clio-agent-gact` console script (CLIO's new entry point), probes `/v1/capabilities`, records a registry entry. `gact connect my-clio` points the TUI at it — same UX as `claudecode`, no middle-man process.

## Iteration source

Pick the first unchecked item under `Phase CLIO-BBBBBBBBBB` in `/home/jcernuda/tui/PLAN.md`. Walk them in order (1 → 20). Skip `[BLOCKED]` items, noting why in a one-liner.

At any time, **add items** to the plan if you discover a sub-task that's too large to fit inside the current one. Prefer a dedicated PLAN item over silently expanding scope.

## Per-iteration process (don't skip steps)

**(a) Read.** Understand the item. Cross-reference CLIO's authoritative docs at `/home/jcernuda/tui/clio-agent/docs/tui/` (on `tui-integration`). If a claim isn't covered there, read the source (`src/clio_agent/` Python, `adapters/claudecode/` Go pattern).

**(b) Decide if the spec needs extending.** Most smoke-path items don't; streaming + tool events + artifacts DO. When extending the spec, land the `SPEC.md` edit **first** with its own commit (`feat(spec): <summary> -- CLIO-BBBBBBBBBBn`), then implement against it.

**(c) Implement** on the right surface(s). Match each repo's conventions:
- **gact-tui**: conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), `go test ./...` passes, `gofmt` clean. Read `/home/jcernuda/tui/CLAUDE.md` for absolute rules.
- **clio-agent**: `<type>: <subject>` commits, `pytest tests/` passes, `ruff check src/` clean, baseline `uv run src/clio_agent/ui/cli.py` still works (RULE 2 in `clio-agent/.claude/CLAUDE.md`). Forbidden deps list in same file — respect it.

**(d) Test.** Every code change ships with tests:
- Adapter: unit tests + a smoke test gated on `clio-agent-api` being on PATH (skip when not).
- CLIO: pytest coverage on new endpoints + behaviours.
- TUI: teatest for render paths + per-component tests where the surface shifts.
- Conformance: when the GACT spec changes, update `contract/conformance/` and make sure all adapters still pass (or mark explicitly unsupported).

**(e) Verify visually** when UI changed. Per `/home/jcernuda/tui/CLAUDE.md` ABSOLUTE RULE 4: UI work ends with a fresh `screenshots/*.png` proving the change. Use the `tui-screenshot` skill. Don't describe — show.

**(f) Commit + push.** Small commits. Push both repos after each meaningful landing:
- gact-tui → `origin/clio`
- clio-agent → `origin/tui-integration`
Never force-push. Never skip hooks.

**(g) Move the checkbox** in `/home/jcernuda/tui/PLAN.md` from `[ ]` to `[x]` with a one-line summary of what actually landed (file paths, test names). Bump `/home/jcernuda/tui/STATUS.md`'s header to reflect current phase.

**(h) Pick the next item** and start again. Don't stop unless a stop condition fires.

## Blocker handling

If an item needs something upstream that doesn't exist yet (e.g., CLIO doesn't emit per-tool SSE events):

1. Open a tracking issue on `iowarp/clio-agent` titled `[tui-integration] <ask>`. Body: what's needed + why + proposed shape.
2. Mark the PLAN item `[BLOCKED: upstream #N]`.
3. Phase-4 items (13–17) are exactly the ones producing these asks. For those, when feasible, **land the upstream PR yourself** on `tui-integration`, not just the issue — we own both repos.
4. Continue with the next non-blocked item. Don't halt the whole loop on a single blocker unless nothing else is pickable.

## Quality gates (non-negotiable)

- Baseline must stay green on both repos after every commit. Run `go test ./...` (gact-tui) and `pytest tests/ && uv run src/clio_agent/ui/cli.py` (clio-agent, the CLI launch is the smoke test).
- `contract/conformance` must pass on every GACT adapter after a SPEC change, or the adapter must declare the capability unsupported via its capabilities endpoint.
- Never commit `t.Skip` or `@pytest.skip` to bypass a broken test. Fix it or mark the whole PLAN item `[BLOCKED]`.
- CLIO's `.claude/CLAUDE.md` RULE 3: DSPy is an internal implementation detail — don't let it leak into GACT-side types, errors, or docs.

## Stop conditions

- **All 20 CLIO-BBBBBBBBBB items `[x]` or explicitly `[BLOCKED]`.** Ship a summary screenshot of the full happy path (`gact agent deploy clio my-clio && gact connect` → conversation). Then stop.
- **Baseline red on either repo.** Stop, fix baseline, resume.
- **Upstream blocker with no fallback path.** File the issue, note it in STATUS.md, stop the loop and tell the user.
- **No other early stopping.** A completed iteration is a reason to pick the next one, not a reason to wait.

## Kickoff — current state

- Setup done. `docs/tui/` + `docs/tui/GAPS.md` live on CLIO's `tui-integration` branch. Issue #1 tracks integration end-to-end; #2–#11 track gap capabilities (native-merit, no TUI references).
- **No Go adapter.** The GACT surface lives inside clio-agent as a Python module.
- PLAN phase `CLIO-BBBBBBBBBB` has 30 items, rewritten around the order: spec → emulator + TUI (in-house iteration) → conformance → CLIO Python implementation → CLIO catch-up for each filed gap issue.
- **Done: CLIO-BBBBBBBBBB1 (v0.2 spec), CLIO-BBBBBBBBBB2 (gap issues filed).**
- **Pick-up entry: `CLIO-BBBBBBBBBB3`** — grow the emulator (`/home/jcernuda/tui/emulator/`) to speak v0.2. New capabilities flags, `AgentDef.tier`, `/v1/memory/stats`, `/v1/health` integrations, new events, routing_decision part, error_info envelope. The emulator is gact-tui's in-house reference backend — making it speak v0.2 first lets the TUI iterate fast before CLIO catches up.

## Known running questions (update as answered)

- [ ] `clio-agent-gact` vs extending `clio-agent-api` — decided: **new entry point**. Keeps the existing REPL-friendly API intact and names the GACT-v0.2 server clearly. Revisit if packaging duplication hurts.
- [ ] Session persistence — JSON file on disk for Phase 1–3, move to ARC `/conversations/` in CLIO-BBBBBBBBBB19.
- [ ] Token streaming fidelity — CLIO currently synthesises chunks in the FastAPI layer. Phase 2 lives with that; Phase 4 CLIO-BBBBBBBBBB17 replaces it with real LM-level streaming.
- [ ] Expert badge colour per specialisation — pick palette in CLIO-BBBBBBBBBB11.
- [ ] Meridian — recipe + `--auto-meridian` in CLIO-BBBBBBBBBB21.
- [ ] When filing gap issues on iowarp/clio-agent, the title + body are about the capability as it benefits CLIO's mission. Don't mention gact-tui. Example: "Permission gating on risky file-policy-sensitive operations" — not "Add permission events for the TUI integration".
