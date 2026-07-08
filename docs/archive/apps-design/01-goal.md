# 01 — Goal

## In one sentence

Build a web app and a cross-platform desktop app that talk to a dockerized `clio-agent` over the existing GACT v0.2 contract, sharing one frontend codebase, and preserving the design philosophy and feature parity of `tui/`.

## Why this is the right shape

The temptation with "let's build a web UI for Clio" is to write a Clio-specific frontend that talks to Clio-specific endpoints. The work that's already shipped here makes that the wrong move:

1. **A contract already exists.** `contract/SPEC.md` (1070 lines) defines a versioned, capability-discovered, vendor-neutral wire protocol. `tui/` and five adapters already pass conformance against it. Writing a Clio-only web UI would silently fork that work.
2. **Clio already implements it.** `src/clio_agent/gact/app.py` is a 10,555-line FastAPI app exposing ~60 GACT routes on port 8100 (separate from the legacy `clio-agent-api` on 8000). The Pydantic types in `src/clio_agent/gact/types.py` mirror the Go types in `emulator/pkg/gact/`.
3. **The TUI is the design reference, not the implementation reference.** `gact-tui` has spent the last ~9400 lines of `tui/internal/ui/app.go` figuring out what a coherent GACT client *feels* like — capability-gated affordances, per-part cursor navigation, slash palette, `@` file picker, modal permission flow, ring-buffer SSE reconnect. That work transfers to a web client at the design level; what doesn't transfer is the Go/Bubbletea code itself.

So the project is **two new clients that join `tui/` as peers**, not "Clio gets a website."

## Concrete success criteria

A v0.1 of each app means:

### Web (`apps/web/`)

- Boots in a modern browser against `http://localhost:8100` (or any GACT endpoint).
- Renders `GET /v1/capabilities` → hides every UI affordance whose flag is `false`. Tolerates unknown capability flags without crashing.
- Implements the canonical assistant-turn lifecycle (`session.status_changed` → `message.created` → `message.part.added` → repeated `message.part.delta` → `message.completed` → `session.status_changed`) with incremental DOM updates per delta (no whole-message re-render).
- Implements `Last-Event-ID` reconnect against the contract's 256-event session ring buffer.
- Implements the full Part taxonomy renderer: `text`, `thinking`, `tool_call`/`tool_result` demarcation, `file_diff` with apply/reject buttons, `routing_decision` badge, `subagent_call`/`subagent_result` indentation.
- Implements modal synchronous permission flow (`permission.requested` → blocking modal → `POST /v1/permissions/{id}` with `{action}`).
- Slash command palette, `@` file picker, `/` filter on sidebar.
- Sessions sidebar with status badges, filter strip, two-step destructive confirms.
- Doctor view (integration health + capabilities scorecard).
- Three themes minimum (dark default, light, one accent — Solarized or Tokyo Night).

### Desktop (`apps/desktop/`)

- Wraps the web app in Tauri 2 — same code, native shell.
- Produces signed installers for the matrix the user specified: `.msi` (Windows), `.AppImage` + `.deb` + `.rpm` (Linux), `aarch64.dmg` + `x64.dmg` (macOS).
- Stores bearer tokens in OS keychain (not `localStorage`).
- Native notifications on `permission.requested` and `notification` events when window is unfocused.
- File-system drag-and-drop into context attachments.
- Two run modes:
  - **Connect mode** — user points the desktop app at an already-running clio-agent (Docker, remote, sidecar — doesn't matter).
  - **Bundled mode** (stretch) — desktop app supervises a clio-agent sidecar process locally.

### Backend (`clio-agent`)

The web/desktop apps are useless if you can't actually run a dockerized clio-agent the apps can reach. So a small subset of clio-agent work is in scope:

- Add a `Dockerfile.gact` (or rework the existing `Dockerfile`) so the GACT v0.2 server (`clio-agent-gact`) is the entrypoint, exposed on port 8100.
- Add a compose service for the GACT server.
- Mount `~/.config/clio-agent/` as a volume so sessions/workspaces survive container recreation.
- Wire the contract's reserved `bearer` auth scheme. Issue tokens via a CLI subcommand or a one-time env var on startup. Without this, a browser-facing deployment is wide-open.
- Add a multipart upload endpoint (`POST /v1/sessions/{sid}/context/files/upload`?) so the web client can attach files without a shared filesystem.

These are upstream changes to `clio-agent`, not to `gact-tui`. They're in scope because the goal is "web + desktop talking to dockerized Clio" — if Clio's container doesn't expose what it needs to expose, neither client matters.

## Non-goals

- **Replacing the TUI.** `tui/` stays. The web/desktop apps are alternatives, not replacements.
- **Clio-specific UI features that don't fit the contract.** If something is useful, push it into the contract (and into the emulator) first, then both the TUI and the web/desktop apps consume it through capability flags.
- **A mobile app.** The web app should be mobile-responsive (sidebar collapse on narrow viewports), but no React Native, no Flutter, no native iOS/Android shells in v1.
- **Multi-tenant cloud hosting.** This is single-user. The GACT contract is fine for "a developer running their own backend they can reach over the network," not "a SaaS with 10,000 tenants." Multi-tenant is a v3 problem if it's a problem at all.
- **A new wire protocol.** GACT v0.2 is the wire. New features land as additive minor versions of the spec, not as Clio-specific bypass APIs.

## What "preserve the philosophy" actually means

From `research/gact-tui-architecture.md` §8, the load-bearing UX commitments — the things that, if dropped, make the port stop feeling like gact — are:

1. Capability discovery on connect; UI mutates from `/v1/capabilities`.
2. SSE-first streaming; no polling fallback; `Last-Event-ID` reconnect.
3. Forward-compat for unknown Part and event types — render a placeholder, never drop.
4. Full Part taxonomy renderer (tool_call/tool_result demarcation, real unified diffs, thinking blocks, routing_decision badges, subagent indentation).
5. Modal synchronous permission flow.
6. Streaming uses incremental append, not whole-message re-render.
7. Information-dense chip-based header/footer.
8. Slash palette + `@` file picker + `/` filter as the three keyboard-driven discovery surfaces.
9. Themes are first-class (≥3 built-ins + JSON custom palette loader).
10. Detach/resume: the backend session is authoritative; closing the tab does not cancel the agent.
11. Per-part cursor and detail-view drilldown — independent blocks are independently addressable.
12. Confirmation overlays for destructive actions.
13. Doctor view from day one.
14. Real markdown rendering (themed, syntax-highlighted code blocks).
15. Capability-honest backend table on the home screen.
16. Conformance gate for new backends (no backend-specific UI code).
17. Backend memory is authoritative; client caches no more than the TUI does.

These are inherited verbatim into the success criteria above.
