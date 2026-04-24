# LOOP — gact-tui ↔ clio-agent integration

> **Living document.** Edit freely as the work reveals what's missing. The /loop skill reads this verbatim each iteration, so clarifications here propagate to the next turn without having to restate them in prose.

## Mission

Close CLIO ↔ GACT feature parity one capability at a time, across **all four surfaces** (spec, CLIO Python, Go adapter, TUI). End state: everything CLIO can do is driveable from gact-tui through GACT v0.1. **The contract evolves to match CLIO, not the other way around** — CLIO is the gold standard.

Two repos are in play simultaneously. Both need the same branch discipline: feature-branched off an integration branch.

## Branches (important — don't commit to the wrong one)

| Repo | Working branch | Off of | Role |
|---|---|---|---|
| `/home/jcernuda/tui/` (gact-tui) | **`clio`** | `main` | all TUI + adapter + GACT contract work |
| `/home/jcernuda/tui/clio-agent/` (clio-agent, gitignored here) | **`tui-integration`** | `develop` | all CLIO Python/FastAPI work for the TUI integration |

`develop` (on clio-agent) is the stable integration trunk. `tui-integration` is where this loop lands commits. Once a phase completes + is reviewed, we merge `tui-integration` → `develop`. Do **not** commit directly to `develop` or `main` on either repo.

## The four surfaces

Not every iteration touches all four. Walk them in the order below — if step 1 sufficiently defines the feature, skip ahead.

1. **`/home/jcernuda/tui/contract/SPEC.md`** — extend GACT v0.1 when CLIO has a primitive the contract can't express. Example: per-tool SSE events, token streaming, cancellation.
2. **`/home/jcernuda/tui/clio-agent/`** (`tui-integration` branch) — CLIO Python + FastAPI. Add endpoints, emit event shapes, expose introspection. The Python ↔ Go gap is the whole *point* of REST — don't paper over it in the adapter.
3. **`/home/jcernuda/tui/adapters/clio/`** — Go adapter. Supervise `clio-agent-api`, translate REST + SSE, own session registry, surface `--auto-meridian`.
4. **`/home/jcernuda/tui/tui/`** — Bubbletea TUI. Render whatever new primitive landed upstream. Visual verification mandatory (see "Verification" below).

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

- Setup done (see last gact-tui commit `9f9704f` and clio-agent commit on `tui-integration`).
- `adapters/clio/` has 8 placeholder files that build + a stub binary.
- PLAN phase `CLIO-BBBBBBBBBB` has 20 items.
- **Pick-up entry: `CLIO-BBBBBBBBBB1`** — REST client in `adapters/clio/client.go`.

## Known running questions (update as answered)

- [ ] `--auto-meridian` — should Meridian run as a child of the adapter, or a sibling supervised by `gact agent deploy`? Leaning child (simpler UX, one process tree to reason about). Decide in CLIO-BBBBBBBBBB19.
- [ ] Session persistence — adapter-owned today (CLIO has no `/sessions` endpoint). Upstream ask CLIO-BBBBBBBBBB16 flips this. Until then, decide how the TUI surfaces the difference (probably doesn't — adapter looks like any other GACT backend).
- [ ] Token streaming fidelity — if Meridian forwards Anthropic's native token stream but CLIO's FastAPI layer flattens it to synthesised chunks, we lose fidelity. Check where the bottleneck is during CLIO-BBBBBBBBBB7 and decide if the token-streaming upstream ask (CLIO-BBBBBBBBBB14) needs to change shape.
- [ ] Expert badge colour per specialisation — pick the palette in CLIO-BBBBBBBBBB9.
