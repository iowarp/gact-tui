# `apps/` — additional GACT frontends (web + desktop)

This folder holds the **design**, **plans**, and (eventually) the **code** for two new clients of the GACT v0.2 contract:

- **`apps/web/`** — a browser-based GACT client (planned).
- **`apps/desktop/`** — a Tauri-based cross-platform desktop app that wraps the web client and produces native installers for Windows (`.msi`), macOS (`aarch64.dmg` + `x64.dmg`), and Linux (`.AppImage`, `.deb`, `.rpm`) (planned).

Both speak the same wire contract as `tui/` (REST + SSE under `/v1/...`, specified in `contract/SPEC.md`) and target the same family of backends, with `clio-agent` as the primary deployment shape. The two clients share a common TypeScript core (`apps/core/`) that implements the contract, so feature parity is enforced by sharing code rather than by reimplementing.

The current contents are **design documents only** — no code yet.

## Folder-name rationale

I considered `interfaces/`, `clients/`, `frontends/`, and `gui/`. Picked **`apps/`** for three reasons:

1. **It forecasts code, not just docs.** The folder will eventually hold `apps/web/`, `apps/desktop/`, and `apps/core/` as real Vite/Tauri projects.
2. **`tui/` is conceptually a sibling of `web/` and `desktop/`.** All three are user-facing applications that consume the same contract. Naming them as peers under `apps/` makes that visible. (`tui/` stays where it is; renaming would churn the Go workspace for no gain.)
3. **`clients/` would collide with `adapters/`** in the reader's head — `adapters/` is the backend side of the GACT split, "clients" muddies that line.

## Read order

| # | File | Purpose |
|---|---|---|
| 0 | [README.md](README.md) | This file. |
| 1 | [01-goal.md](01-goal.md) | What we're building, why, success criteria. |
| 2 | [02-current-state.md](02-current-state.md) | What already exists in `clio-agent` and `gact-tui` that we can build on, distilled from `research/`. |
| 3 | [03-architecture.md](03-architecture.md) | Proposed tech stack, module structure, build/release pipeline. |
| 4 | [04-roadmap.md](04-roadmap.md) | Phased plan with concrete milestones. |
| 5 | [05-open-questions.md](05-open-questions.md) | Decisions the user needs to make before Phase 1. |
| 6 | [06-design-language.md](06-design-language.md) | How the CLIO Design System maps to the agent IDE — inherits / extends / drops. |
| 7 | [07-tui-vs-web-semantics.md](07-tui-vs-web-semantics.md) | What ports from the TUI, what's TUI-native, what's web/desktop-native. |
| 8 | [08-decisions.md](08-decisions.md) | Locked decisions from the 2026-05-27 interview. Supersedes `05-open-questions.md` where they conflict. **Read this for the current state of the plan.** |
| — | [design/](design/) | The CLIO Design System (tokens, fonts, brand assets) copied in from `D:\Libraries\Downloads\CLIO Design System` on 2026-05-27. Drop-in foundation. |
| — | [research/clio-agent-surface.md](research/clio-agent-surface.md) | Deep technical reconnaissance of the clio-agent API surface (~3800 words). |
| — | [research/gact-tui-architecture.md](research/gact-tui-architecture.md) | Deep technical reconnaissance of the gact-tui contract + TUI architecture (~3300 words). |
| — | [research/clio-agent-delta-2026-05.md](research/clio-agent-delta-2026-05.md) | What changed in clio-agent's `develop` branch since the original recon (`cece40e..e00cfd0`) — expert packs, ask-user/retry protocol, context frames, persistence updates. |

If you only have ten minutes, read **08-decisions.md** then **04-roadmap.md** then **06-design-language.md** + **07-tui-vs-web-semantics.md**.

## Status

- 2026-05-27 — folder created, research and design docs written.
- 2026-05-27 (later) — clio-agent `develop` pull added context frames, ask-user/retry protocol, expert packs, permission policy persistence. Findings in `research/clio-agent-delta-2026-05.md`, integrated into 02/03/04/05.
- 2026-05-27 (later) — CLIO Design System received and copied into `apps/design/`. `06-design-language.md` ties it into the IDE.
- 2026-05-27 (later) — `07-tui-vs-web-semantics.md` added to capture the substrate-appropriate idiom rules.
- Awaiting decisions in `05-open-questions.md` before scaffolding `apps/core/`.
