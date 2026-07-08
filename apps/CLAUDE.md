# apps/ — Claude session rules

This file is loaded into every Claude Code session that touches `apps/`. **Read it
fully before doing anything.** It mirrors the anti-procrastination rules in the
root `CLAUDE.md` but scopes them to the harness.

## Conversation rendering — source of truth

Any change to the conversation transcript (web/desktop/TUI) must match the agreed
render. Read both before touching transcript code:
- `apps/web/RENDERING_SPEC.md` — the rules (flat log, ● per turn, collapse tool
  output only, depth = indentation, name-once colored headers).
- `apps/web/CANONICAL-CONVERSATION.md` — the **entire** approved EarthScope run
  rendered out, grounded in the real wire. This is the exact target.

Known stream gaps (per-step thought + tool attribution not in the ordered parts)
are fixed backend-side, **NOT** papered over in the client.

## ABSOLUTE RULES (anti-procrastination)

1. **No deferring.** If a design question comes up, decide it per `docs/archive/apps-design/08-decisions.md`.
   Record the choice on the relevant GitHub issue and move on. Do not write
   "TBD" or "open question" in the tree — track open blockers as GitHub issues.

2. **No over-research.** Research is done — see `apps/research/`. The design system
   is in `apps/design/`. Decisions are in `docs/archive/apps-design/08-decisions.md`. Build now.

3. **Difficult-first.** When the harness can be made more robust without scope creep,
   make it more robust. Examples: prefer typed reducers over `any`, prefer Playwright
   over manual checks, prefer locked Tauri capabilities over open ones.

4. **Visual verification is mandatory.** If you change anything in `apps/web/`, you
   MUST end the session having run `pnpm --filter @clio/web test:visual` and reviewed
   the captures it renders. Those captures are **regenerable output** — they land under
   `apps/web/screenshots/` (git-ignored) and CI uploads them as a workflow artifact;
   **do not commit them.** The only committed screenshot home is `docs/screenshots/`
   (media policy in the root `CLAUDE.md`, enforced by
   `scripts/check_media_policy.py` — iowarp/gact-tui#235). Don't describe the
   change — show it via the rendered capture.

5. **Tests must pass.** Never commit failing tests. Never `it.skip` to make a build
   green. If a test won't pass, file the blocker as a GitHub issue and pick a
   different task.

6. **Commit and push before stopping.** Every session ends with `git push`. Even
   partial progress is committed (with `wip:` prefix if not feature-complete). If
   `git status` shows anything modified at the end of a session, you have not
   stopped correctly.

7. **No early-stopping.** "I finished a task" is not a reason to stop. Move to the next
   piece of open work and keep going until you hit a real blocker (network
   down, native toolchain broken, Tauri WebView2 missing). Even then, file it as a
   GitHub issue and try the next task.

8. **No scope creep upward.** Do not modify `tui/`, `emulator/`, `adapters/`,
   `contract/`, or `apps/design/`. If a refactor "would be cleaner first" — note it
   in `docs/archive/apps-PLAN.md`, do not do it.

9. **Real implementations only.** Stub endpoints that return placeholder data are
   fine when wrapped in a fixture flag (`?fixture=…`); endpoints that pretend to
   talk to a live backend but actually return canned data are not.

10. **Commit message style.** Conventional commits (`feat:`, `fix:`, `refactor:`,
    `test:`, `docs:`, `chore:`). One change per commit when possible.

## Workspace shape

```
apps/
├── core/       @clio/core      — shared TypeScript GACT client (no DOM)
├── web/        @clio/web       — SolidJS + Vite browser app
├── desktop/    @clio/desktop   — Tauri 2 shell
├── design/     READ-ONLY       — CLIO Design System tokens + fonts
├── research/   READ-ONLY       — reference research
├── CLAUDE.md   (this file)
├── HARNESS.md  — visual loop, tests, CI, commit conventions, screenshot policy
└── README.md   — folder rationale and doc read-order

(The historical `PLAN.md` / `CHANGELOG.md` / `RELEASE-READINESS.md` planning docs
were archived to `docs/archive/apps-*.md`.)
```

## Required commands (all must exit 0 before stopping)

```sh
cd apps
pnpm install
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm --filter @clio/web build
pnpm --filter @clio/desktop tauri:build:debug
pnpm --filter @clio/web test:visual    # against the gact emulator running on :7777
```

## Visual proof requirements

`pnpm --filter @clio/web test:visual` must pass for any UI-touching commit. It
renders the surface captures (connect screen, streaming chat, permission cards,
density modes, slash palette, remote-backend wizard, multi-backend picker, …)
under `apps/web/screenshots/` and asserts each surface's critical testids. Those
captures are **regenerable output**: the directory is git-ignored and CI uploads
the renders as a workflow artifact for review — **do not commit them.** The test
passing is the proof; a green run means every required surface rendered.

Committed screenshots (the small curated set the docs embed) live only under
`docs/screenshots/` — the sole tracked screenshot home, enforced by
`scripts/check_media_policy.py` (iowarp/gact-tui#235). Never add a tracked image
under `apps/web/screenshots/`; the media guard fails the build if you do.

## Personal note from the original harness session

The user is asleep. They will be disappointed in the morning if the session ends
with "I planned more" or "I researched more". They will be happy if it ends with
"Wired SSE delta reduction, screenshots show streaming render, here are the
open questions for human review."

Build the thing. Just build it.
