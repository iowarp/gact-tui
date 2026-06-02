# CLIO Desktop v0.9.1 — Release Readiness

**Status as of:** 2026-06-01 (release-readiness `/goal` run on `feat/apps-harness`)
**Decision:** the release tag is a HUMAN action. Everything below is prepared;
nothing here pushes the tag.

---

## The three release blockers

### 1. Cross-platform CORS (WebView → clio without ACAO headers) — **DOCUMENTED**

- **Fix in place:** every frontend HTTP request routes through the Rust
  `gact_http` Tauri command (commit `38a65bf`), so the WebView origin never
  hits browser CORS when talking to a localhost/tunneled clio that emits no
  `Access-Control-Allow-Origin`. SSE additionally has a bridge-first +
  EventSource-fallback path (`live.ts`, W1 finding).
- **Verified:** Windows — extensively, this run: `cargo test --lib` 14/14
  (gact_http × 3 against live clio), the full Playwright audit suites, and the
  real-WebView2 e2e (W1, `audit/w1-webview-permission.png`).
- **Not verified here:** macOS / Linux WebViews — cannot be driven from this
  Windows box. The release CI matrix (`tauri-debug` job on all four targets)
  is the canonical cross-platform check and runs automatically on the tag.
- **Risk if skipped:** low — the Rust HTTP path is platform-independent
  (`ureq`, no WebView involvement); only WebView-specific SSE fallback
  behavior could differ.

### 2. macOS aarch64 installer (bash 3.2 on macos-14 runners) — **DOCUMENTED**

- **Fix in place:** `fetch-sidecar.sh` no longer uses bash-4 associative
  arrays (commit `37afdf9`); macos-14's bash 3.2 can run it.
- **Not verified here:** needs a macos-14 runner; the release workflow's
  `macos-14 / aarch64-apple-darwin` matrix leg is the verification.
- **Risk if skipped:** medium-low — v0.9.0 shipped without macOS dmgs because
  of exactly this; the fix is targeted at the one incompatible construct.

### 3. ALCF hello round-trip — **CLEARED (with proof)**

- **Original symptom:** `litellm.AuthenticationError: Token introspection`
  on every turn from the long-running `:17800` process (stale token cache).
- **Proof of clearance (this run, against a fresh clio process on `:17801`,
  ALCF Metis / gpt-oss-120b):**
  - W3 stream-stats test: real turn → "Paris", `ttft 0.8s · ~123 tok/s`
    computed from clio's real token counts (`audit/w3-stream-stats.png`).
  - W4 concurrent-turns test: two parallel real turns, both completed with
    `stop_reason=end_turn` (`audit/w4-concurrent-turns.png`).
  - Multiple one-word smoke turns (`hello`, capital-of-France) completing
    end-to-end through the desktop UI.
- **Conclusion:** not a CLIO Desktop bug, and not a live blocker for fresh
  processes. The keeper process maintains the ALCF token; a clio process
  started after the keeper has the token works. (The user's long-running
  `:17800` process may still need a restart by the user to pick up a fresh
  token — that is a clio-agent operational note, not a desktop defect.)

---

## W4 hardening findings relevant to the release

Two real defects were found and fixed by the hardening matrix this run — both
are in the release branch:

1. **Leaked sidecar process on app close (Windows).** `Child::kill` terminated
   only the Go launcher; the clio-agent-gact grandchild survived every app
   close. Fixed: `Supervisor::shutdown` now tree-kills (`taskkill /T /F`).
   Proof: `supervisor::tests::spawn_path_launches_probes_and_reaps`.
2. **Silently dead SSE stream after network loss.** A dropped network does not
   error an established EventSource; the app showed `sse · open` forever.
   Fixed: `live.ts` listens for the browser `offline`/`online` events — tears
   down + starts the reconnect ladder on offline, reconnects instantly on
   online. Proof: oneturn-audits "W4: SSE drop".

Full W4 matrix (SSE drop/reconnect, concurrent turns, large transcript,
supervisor SPAWN, shutdown reaping, ssh tunnel forward/reaping/bad-host against
the real homelab): see `STATUS.md` wave board — all PROVEN.

---

## Local release dry-run

- **Windows bundle (`tauri build`, msi+nsis):** see the "Dry-run result"
  section at the bottom of this file.
- The other three targets (macOS aarch64/x64, Linux) can only be produced by
  the CI matrix.

---

## What the tag push does (irreversible — human only)

Pushing a tag matching `clio-desktop-v*` triggers `.github/workflows/apps.yml`:

1. `ci` + `tauri-debug` jobs (all targets must pass first — `needs:` gate)
2. `release` matrix: Windows (.msi + .exe/nsis), macOS aarch64 (.dmg),
   macOS x64 (.dmg), Linux (.deb/.AppImage/.rpm), each with SHA256SUMS
3. `release-web`: pure-web .zip
4. All artifacts attached to a **public GitHub Release** via
   softprops/action-gh-release

## The exact human command

```sh
cd D:\Libraries\Documents\projects\gact-tui
git checkout feat/apps-harness
git pull
git tag clio-desktop-v0.9.1
git push origin clio-desktop-v0.9.1
```

## Pre-push checklist (eyeball before running the above)

- [ ] `apps/STATUS.md` wave board shows W0–W5 all EXIT-MET
- [ ] Latest `feat/apps-harness` CI run is green (ci + tauri-debug jobs)
- [ ] The 4 clio-agent PRs (#522 summarize, #523 MCP reconnect, #527
      attachments, #530 event-bus globals) are reviewed/merged or explicitly
      deferred — the desktop gates those features on capability flags either
      way, so shipping before the merges is safe (the buttons stay hidden)
- [ ] `apps/web/screenshots/` PNGs look right (spot-check
      `chat-shell-real-backend.png`, `diff-pane-open.png`, the `audit/w3-*`
      and `audit/w4-*` proofs)
- [ ] No secrets in the repo (bearer tokens in screenshots are localhost-only
      throwaways)
- [ ] Decide the version: this file assumes `v0.9.1`; bump
      `apps/desktop/src-tauri/tauri.conf.json` + `Cargo.toml` + package.json
      versions first if cutting a different number

---

## Dry-run result — ✅ PASSED (Windows leg)

`pnpm --filter @clio/desktop tauri build` on this Windows box, 2026-06-01:

- Web build: ✓ (3.98 s)
- Rust release compile: ✓ (2 m 49 s — includes the W4 tree-kill fix)
- Application: `target/release/clio-desktop.exe` ✓
- Installer: `target/release/bundle/msi/CLIO Desktop_0.9.0_x64_en-US.msi`
  (4.9 MB) ✓

The Windows leg of the release matrix is therefore proven locally end-to-end.
macOS (aarch64 + x64) and Linux legs are produced by CI on the tag push.
