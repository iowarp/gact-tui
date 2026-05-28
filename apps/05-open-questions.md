# 05 — Open Questions

Decisions the user needs to make before Phase 1 kicks off. Each has a recommendation and a "what changes if you pick differently" note. None of these are TBDs — they're forks in the road that I need the user's call on.

## Q1: Frontend framework — Solid, Svelte, or React?

**Recommendation: SolidJS.** Rationale in `03-architecture.md` §Tech stack: signals match the SSE-delta model, smaller bundle than React, friendlier to incremental token streaming.

**If Svelte instead:** Effectively equivalent on technical merit. Pick if the user already has Svelte 5 experience or strong taste preference. Rest of the plan stands; substitute `<Show>` for `{#if}` etc.

**If React instead:** Forces extra work to keep streaming performant — `react-virtuoso` for the transcript, `useTransition` for non-blocking updates, careful `memo` discipline. Ecosystem is huge. Pick if web hiring / contributor onboarding matters more than raw streaming ergonomics.

**Decision needed before:** Phase 1.1 (workspace scaffold).

---

## Q2: Where does the web app get served from?

**Recommendation: Serve `apps/web/dist/` as a static mount from `clio-agent-gact` itself.** One container, one URL. No CORS issues. The Docker compose change in Phase 0.1 includes a `STATIC_WEB_DIR` env var pointing at the bundled web build.

**Alternatives:**
- **Separate container** (`apps/web/` in its own nginx) — cleaner separation, but requires CORS config on `clio-agent-gact` and a second port. Worth it only if the web app starts serving multiple clio-agent backends from one URL (multi-backend dashboard).
- **CDN / GitHub Pages** — useful for distributing the web app to users who run their own backend. Means we ship a static build with no backend URL hard-coded; users enter the URL on connect.

**Decision needed before:** Phase 0.1 (Docker entrypoint changes). The recommendation lets us avoid CORS plumbing entirely.

---

## Q3: Bundled clio-agent in the desktop app — yes/no/optional?

The Tauri app has three viable shapes:

1. **Connect-only.** Desktop app asks for a clio-agent URL, period. User runs Docker themselves. (Simplest.)
2. **Bundled-only.** Desktop app ships clio-agent inside, supervises it as a sidecar. No URL prompt. (Fastest install for end users.)
3. **Both modes.** First-run wizard offers "Connect to existing" or "Run locally" — the latter starts a sidecar.

**Recommendation: Option 1 for v1, Option 3 as a stretch.** Bundling clio-agent is a packaging nightmare across three OSes — uv, Python 3.12, optional CUDA, native ARC dependencies. The Tauri Rust binary is ~10MB; a bundled clio-agent is ~500MB+. Connect-only ships in a week; bundled adds a month for marginal user-visible value (since Docker exists).

**If Option 2 instead:** Need a CI step that builds clio-agent into a portable archive per OS (PyInstaller, or Nuitka, or a slimmed Docker image extracted to disk). Tauri sidecar pattern handles spawning. Decide if "user does not need Docker" is the killer feature or a nice-to-have.

**Decision needed before:** Phase 4.1 (Tauri scaffold).

---

## Q4: Auth model beyond bearer tokens?

Phase 0.3 implements `bearer` from the contract's reserved schemes. Concretely: a static long-lived token issued by CLI. That's enough for a single developer.

**Status (2026-05-27):** No progress in the May 2026 develop delta. `AuthInfo.schemes = ["trust_socket"]` is still the only scheme implemented. The team has added permission-policy persistence and context-file persistence in the same window but has not touched auth. This remains the single biggest blocker for any deployment beyond localhost.

Stretches:
- **Token TTL + rotation.** Tokens expire; the CLI re-issues; the desktop app refreshes from keychain automatically. ~2 days work.
- **OAuth.** GitHub or Google OAuth into clio-agent. Adds a real auth server. ~2 weeks work.
- **Mutual TLS.** Client certs in the OS keychain. Strong, but operationally awful for non-experts.

**Recommendation: Bearer for v1. Token TTL + rotation as Phase 5 polish.** OAuth and mTLS are out of scope unless the deployment story is "team-shared remote clio-agent."

**Decision needed before:** Phase 0.3.

---

## Q5: How "remote" can the backend be?

Two scenarios:

1. **Localhost only.** Clio-agent runs on the same machine as the browser. Bearer auth is belt-and-suspenders; `trust_socket` would actually do.
2. **LAN / VPN.** A user runs clio-agent on a beefy workstation and accesses it from a laptop. Bearer auth required. HTTPS required (TLS termination at nginx in front of clio-agent, since clio-agent itself is HTTP-only).
3. **Public internet.** Need real TLS certs, real auth, rate-limiting. Effectively a SaaS deployment. **Out of scope for v1.**

**Recommendation: Design for Scenario 2.** Scenario 1 is a subset; Scenario 3 needs different architecture and we won't get it for free.

**Decision needed before:** Phase 0.3 (auth design needs to know if it's local-only or LAN-traversable).

---

## Q6: Naming?

The TUI is `gact-tui` ("Generic Agentic-Coder TUI"). For consistency:

- **`gact-web`** and **`gact-desktop`** — terminology-consistent.
- **`clio-web`** and **`clio-desktop`** — Clio-centric, easier to market.
- **`gact`** as the unified product name (web build and desktop build are just shapes of the same app), with **`gact-tui`** retained as the terminal flavor.

**Recommendation: `gact-web` and `gact-desktop` as filenames + repo conventions; "Gact" as the user-visible product name** (single name across TUI/web/desktop, like "VS Code" is one product across web/desktop/insiders). The TUI's existing brand stays.

**If "clio-web"/"clio-desktop" instead:** Locks the product to clio-agent. Fine if the multi-backend story isn't a near-term concern, awkward when someone runs the web app against opencode.

**Decision needed before:** Phase 1.1 (folder names, package names, GitHub repo names).

---

## Q7: Where does the web/desktop code live? Same repo, separate repo, monorepo?

Two paths:

- **Same repo (`gact-tui/apps/`).** Keeps the TUI + adapters + emulator + new apps in one place. Single CI, single `git tag`, easier cross-cutting refactors. Downside: the repo is now ~2x bigger.
- **Separate repo (`gact-web` or `gact`).** Clean release independence (web releases without bumping the TUI version). Downside: code that should be shared (TypeScript types generated from the contract) lives in two places, needs a publish step.

**Recommendation: Same repo for v1.** Move to a separate repo if the web app's release cadence outpaces the TUI's by 3x or more. Generated types live in `apps/core/wire/` and are versioned with the contract.

**Decision needed before:** Phase 1.1.

---

## Q8: License?

The TUI repo's `LICENSE` is currently MIT (verified at `gact-tui/LICENSE` — read it to confirm). The clio-agent repo also has a LICENSE. Web/desktop apps should match — but is that the user's choice or already constrained by the existing repo licenses?

**Recommendation: Match `gact-tui/LICENSE`** if same-repo. If separate-repo, default to MIT unless the user has reason to pick AGPL/GPL/proprietary.

**Decision needed before:** Phase 1.1 (license headers + `package.json:license`).

---

## Q9 (added 2026-05-27): Expert pack picker UX — where does it live?

The May 2026 delta added `POST /v1/sessions/{sid}/messages` `agent:{id}` per-turn override, plus expert packs as a new `AgentDef.source`. The web client needs a way to pick a non-default agent for a single turn. Three viable placements:

1. **Inline picker next to Send button.** A small dropdown showing the current agent (default: session default), tap to switch for the next turn only. Reverts to session default after. Mirrors how Slack lets you tag a specific channel per message.
2. **Composer-prefix syntax.** `@analysis: <prompt>` triggers a one-turn override. Familiar from Slack and Discord. Discoverable via the slash palette.
3. **Sidebar agent panel.** A persistent right-rail showing the current agent and a "switch for this turn" action. Heavier UI weight; matches the way IDE language servers expose their state.

**Recommendation: Option 1 for the default, Option 2 as power-user discoverability.** Option 3 is too heavy for what is fundamentally a per-message decision.

**Decision needed before:** Phase 3.13.

---

## Q10 (added 2026-05-27): Ask-user modal vs in-transcript inline?

The May 2026 delta added a `question.requested` event distinct from `permission.requested`. The agent can pause and ask the user a question (information, not approval). Two placement options:

1. **Modal that blocks the composer**, same shape as the permission modal but visually less alarming (warning color, not error). The user must answer or skip before they can compose anything else.
2. **Inline-in-transcript question card**, where the question appears as a card in the assistant message and the user types their answer into a field embedded in the card. The composer stays available for other interactions.

**Recommendation: Option 2 (inline-in-transcript).** Questions aren't blocking the same way permissions are — the user can think, scroll back, write something else. Modal-blocking everything is the wrong vibe. Permissions are blocking because the agent is paused waiting for a moral judgment; questions are conversational. The TUI's substrate forces modal-only thinking; the web doesn't have to inherit it.

**Decision needed before:** Phase 2.6b.

---

## Q11 (added 2026-05-27): Who extends the CLIO Design System to the agent IDE?

The CLIO Design System README (now at `apps/design/CLIO-Design-System-README.md`) explicitly says: *"Only the marketing website was attached to this design system. The CLIO Agent IDE… has its own visual surfaces — if you need those, point the design system at iowarp/clio-agent."* `06-design-language.md` extends the system into the IDE for our purposes (transcript primitives, ask-user modal, expert-pack cards, context-frame inspector, etc.), but those extensions are currently only in this repo.

Two paths:

1. **Upstream the extensions.** Open a PR to whatever repo hosts the design system canonically, adding agent-IDE primitives. Pros: one source of truth, the TUI and the IDE evolve together. Cons: review cycle, coordination cost.
2. **Fork-in-place.** `apps/design/` is the IDE's design system; the marketing site's design system is the IDE's *source*, not its *contract*. Pros: ship fast. Cons: drift over time.

**Recommendation: Option 2 for v1, Option 1 once the IDE primitives stabilize.** Forking-in-place is the right call when the upstream isn't designed to absorb your extensions yet. Re-merge after a few months when we know what's stable.

**Decision needed before:** Phase 2 design review.

---

## Q12: The bigger product question — what *is* this for?

This isn't a Phase 1 blocker, but it shapes everything downstream:

- **A developer-internal tool.** One user, one machine, just nicer than the TUI for users who hate terminals. Scope is small; polish is enough.
- **A demo / marketing surface.** The web app exists primarily so people can try Clio without installing Python. Scope includes a "demo mode" that runs against a hosted clio-agent with rate-limited free tokens.
- **A real product.** Web + desktop is a deliverable competing with claude.ai, GitHub Copilot Chat, Cursor's web UI. Scope is huge — collaboration, hosted backends, user accounts, billing.

**Recommendation: Choose 1 or 2 for v1; explicitly defer 3 to v3+.** The architecture in `03-architecture.md` supports 1 and 2 directly; 3 requires a different backend story (multi-tenant clio-agent), different auth (real user accounts), and different ops (real hosting).

**Decision needed before:** Phase 2 planning. Doesn't block Phase 0 or Phase 1.

---

## Risks (not decisions — flags)

Things that could go wrong, in rough probability order:

1. **The bearer auth implementation in clio-agent ends up being a 2-week project, not a 2-day one.** The Pydantic-FastAPI side is easy; the CLI subcommand + token storage + admin endpoints for revoking + per-request middleware adds up. Mitigation: bound it in Phase 0 with a hard cutoff; if it's not done in 5 days, fall back to "localhost-only + reverse-proxy auth in nginx."
2. **`message.part.delta` deltas come too fast for the DOM to keep up at terminal-emulator scale.** The TUI has been informally measured at ~25 ms/token from `Realistic` timing; live LMs can do 5 ms/token. Solid's fine-grained reactivity handles this in theory; needs a real load test by Phase 2 exit. Mitigation: batch deltas in 16ms-aligned `requestAnimationFrame` if needed.
3. **The Tauri output matrix on macOS requires Apple Developer membership ($99/yr) for signed builds.** Unsigned `.dmg`s give scary warnings. Mitigation: factor this into the user's Q3 / Q5 decision; cost-share or commit to signing as a separate budget item.
4. **The contract evolves while we're building.** v0.2 just landed; v0.3 is plausible mid-project. Mitigation: regenerate `wire/types.ts` from `emulator/pkg/gact/`; the discriminated union + `<UnknownPart>` fallback makes additive changes survivable.
5. **Browser SSE behind some corporate proxies is hostile.** Long-running SSE connections get dropped. Mitigation: the contract already handles this via `Last-Event-ID` replay; tune the heartbeat interval (currently 15s server-side) if needed.
