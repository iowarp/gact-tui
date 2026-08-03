---
name: gact-build-and-env
description: Load when setting up or rebuilding the gact-tui dev environment, when a build/test/make command fails or behaves differently than documented, when choosing between PowerShell and Git Bash for a command, when touching CI workflows or Docker images, or when deciding what "green" locally actually covers. Keywords - go.work, Makefile, make build, go build fails from root, pnpm, uv, vhs, ttyd, toolchain versions, CI map, docker images, release workflow, tui/.go-cache, Windows-only breakage.
---

# gact-build-and-env — recreate and trust the build environment

Runbook for building every ecosystem in this repo (Go workspace, apps/ pnpm
workspace, Python adapter, Docker images), on THIS Windows machine first, with
Linux/CI notes. Every command marked **[verified]** was executed successfully
on this machine on 2026-07-06; anything not runnable here is labeled.

Repo root everywhere below: `D:\Libraries\Documents\projects\gact-tui`.

**Shell rule for this machine (read first):** the repo's Makefile and helper
scripts are written for a POSIX shell. From PowerShell, GNU Make picks
`cmd.exe` and its `$(shell git ...)` / `test -n` / `ENV=val cmd` constructs
silently break ([verified]: `make fmt` from PowerShell emits `'test' is not
recognized`). **Always run `make` from Git Bash** (the Bash tool, or
`& "C:\Program Files\Git\bin\bash.exe" -lc "make build"`). Plain `go`, `pnpm`,
`uv`, `vhs` commands work fine from PowerShell.

## When NOT to use this skill

- Running the built things (emulator, TUI, clio backends, web, desktop, ports,
  artifact cleanup) → **gact-run-and-operate**.
- What counts as evidence / what a green test does and does not prove →
  **gact-validation-and-qa** (and **gact-working-discipline** for the
  read-the-evidence doctrine).
- Config axes: TUI config.json, env vars, emulator flags → **gact-config-and-flags**.
- VHS tape authoring and golden/teatest discipline → **gact-bubbletea-reference**
  (plus the existing flat `tui-screenshot` / `tui-test` skills).
- Diagnosing product bugs → **gact-debugging-playbook**; measurement tooling →
  **gact-diagnostics-and-tooling**.
- Release/tagging policy and change gates → **gact-change-control**.

## 1. Toolchain truth table

Three different Go toolchain statements coexist in the repo. They work today
because newer Go toolchains accept an older `go` directive (backward compat),
but do not "fix" one to match another without reading all three.

| Axis | Pinned where | Pinned value | This machine (2026-07-06, [verified]) |
|---|---|---|---|
| Go (workspace) | `go.work` line 1 | `go 1.25.8` | go1.26.4 windows/amd64 |
| Go (CI) | `.github/workflows/ci.yml` (`setup-go`) | `1.26.x` — its comment "Match the toolchain pinned in go.work" is **stale/wrong** | — |
| Go (Docker) | `docker/Dockerfile.clio-tui` | `golang:1.25-bookworm` | — |
| GNU Make | not pinned | — | 4.4.1 (works from Git Bash only, see shell rule) |
| Node | `apps/package.json` `engines` | `>=20.10` (CI uses `20.x`) | v22.22.3 |
| pnpm | `apps/package.json` `packageManager` | `pnpm@9.15.9` (CI workflows install exactly this) | **11.8.0 — drifts from the pin**; whether corepack should enforce 9.15.9 locally is an open question, as of 2026-07-06 unresolved |
| uv / Python | `adapters/claude-agent-sdk-server/pyproject.toml` | `requires-python >=3.11` | uv 0.7.10 |
| vhs | not pinned in repo | — | v0.11.0 (`winget install charmbracelet.vhs`) |
| ttyd (Windows VHS) | `scripts/vhs-windows.ps1` param default | **1.7.2** (auto-downloaded `ttyd.win10.exe`) | pinned because the winget ttyd 1.7.7 hangs VHS — `screenshots/README.md` records the incident (ttyd 1.7.7 initializes xterm's DOM renderer while VHS waits for canvas layers) |
| Rust | CI only (`dtolnay/rust-toolchain@stable`) | stable | needed locally only for Tauri desktop builds |

pnpm lockfile asymmetry (bites at release time): apps CI installs with
`pnpm install --frozen-lockfile=false` (drift tolerated) but
`desktop-release.yml` uses strict `pnpm install --frozen-lockfile` — a drifted
`apps/pnpm-lock.yaml` can pass CI for weeks and then fail the release workflow.

## 2. First-build runbook per ecosystem

### 2a. Go workspace (emulator, TUI, adapters, conformance)

```bash
# Git Bash, from repo root — [verified 2026-07-06]
make build
```

Outputs land **in the module directories**, not in `bin/`:

- `emulator/emulator-server`
- `tui/gact` (version stamped via `-ldflags -X`; `git describe` release string)

Known doc drift (verified on this machine 2026-07-06): the root CLAUDE.md says
`make build` puts binaries "into bin/" and that `go build ./...` /
`go test ./...` work from the repo root. **Neither is true.** There is no
`bin/` output, and from the root:

```text
> go build ./...
pattern ./...: directory prefix . does not contain modules listed in go.work
```

The repo root is a `go.work` workspace, not a module, so `./...` does not span
the members — ci.yml's own comment says exactly this. What DOES work from the
root ([verified]):

```powershell
# Patterns rooted AT a module dir work (workspace mode):
go build ./emulator/... ./tui/...
# Explicit package lists may cross modules:
go test -p 1 ./tui/internal/config ./emulator/pkg/gact -count=1
```

`./contract/...` and `./adapters/...` patterns FAIL from the root (the module
roots are one level deeper: `contract/conformance`, `adapters/<name>`). The
reliable general form is per-module:

```bash
for m in emulator tui contract/conformance adapters/opencode adapters/crush adapters/goose adapters/claudecode; do
  (cd "$m" && go vet ./... && go build ./... && go test ./... -count=1)
done
```

`make fmt` is **broken** with go 1.26.4 ([verified] — `go fmt ./emulator/...`
from a workspace root is rejected: "directory prefix emulator does not contain
main module"). Use the CI-identical gate instead (Git Bash):

```bash
gofmt -l $(git ls-files '*.go')        # list offenders (CI fails if non-empty)
gofmt -w $(git ls-files '*.go')        # fix
```

House convention: pass `-p 1` (package build/test parallelism 1) to `go build`
/ `go test` on this machine — `scripts/release-verify.sh` defaults
`GACT_VERIFY_P=1` and every docs/ runbook uses it. The rationale is not
written down in-repo (inferred: avoids port/file contention between parallel
package tests on Windows); treat it as the default, drop it only deliberately.

TUI module quirk: `tui/go.mod`'s module path is
`github.com/JaimeCernuda/gact-tui/tui` while the repo remote is
`https://github.com/iowarp/gact-tui.git` — do not `go get` workspace modules by
the hosted path. `tui/go.mod` has `replace` directives to `../emulator` and
`../contract/conformance` (adapters have similar ones), so modules build
standalone without the workspace.

### 2b. apps/ pnpm workspace (@clio/core 0.0.1, @clio/web 0.9.0, @clio/desktop 0.7.1 as of 2026-07-06)

pnpm commands MUST run from `apps/` — the pnpm workspace root is `apps/`, not
the repo root (`apps/pnpm-workspace.yaml` lists `core`, `web`, `desktop`).

```powershell
cd D:\Libraries\Documents\projects\gact-tui\apps
pnpm install
pnpm -r build          # or: pnpm --filter @clio/web build
```

Not executed during this skill's verification (local pnpm 11.8.0 vs the 9.15.9
pin makes an unsupervised install a lockfile-drift risk); commands are taken
from `apps/package.json` scripts, `apps/CLAUDE.md`, and the green apps.yml CI.
The full pre-stop gauntlet required by `apps/CLAUDE.md`: `pnpm -r lint`,
`pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @clio/web build`,
`pnpm --filter @clio/desktop tauri:build:debug`,
`pnpm --filter @clio/web test:visual` (visual tests expect the emulator on
:7777 — see gact-run-and-operate).

Desktop caveat on Windows: `@clio/desktop`'s `fetch-sidecar` script runs
`bash scripts/fetch-sidecar.sh` (and `tauri:dev`/`tauri:build`/
`tauri:build:debug` all chain it), so it needs Git Bash on PATH. PowerShell
parallels exist: `apps/desktop/scripts/fetch-sidecar.ps1` and
`apps/desktop/scripts/build-clio-runtime.ps1` (the latter is what Windows CI
release jobs use).

### 2c. Python adapter (adapters/claude-agent-sdk-server)

```powershell
cd D:\Libraries\Documents\projects\gact-tui\adapters\claude-agent-sdk-server
uv sync
uv run pytest tests/test_bridge.py tests/test_endpoints.py   # hermetic subset
```

[verified 2026-07-06]: `uv sync` + hermetic subset → **49 passed in ~7s**.
Plain `uv run pytest` also runs `tests/test_smoke_*.py`, which require a real
`claude` CLI and self-skip without it — CI runs only the hermetic pair, so the
smoke surface is effectively untested in automation. `pyproject.toml`:
hatchling build, console script `gact-claude-agent-sdk-server`, dev group
pytest/pytest-asyncio/httpx/ruff/pyright (strict, py3.11 target).

### 2d. Smoke the result

```bash
# Git Bash — [verified 2026-07-06]
./emulator/emulator-server --port 7999 --timing fast &
curl -s http://localhost:7999/v1/capabilities   # → {"contract_version":"0.2",...}
kill %1
```

Windows note: `make build` writes the binaries WITHOUT `.exe` (they are still
PE files). Git Bash executes them fine; from PowerShell run them as
`./emulator/emulator-server` only if your PowerShell resolves extension-less
executables — otherwise build your own: `cd tui; go build -o gact.exe .`
(`tui/gact.exe` is gitignored).

## 3. Makefile truth table

`make help` prints the full target list ([verified]). Defaults:
`GO_TEST_FLAGS=-timeout=20m`, `PORT=7777`, `THEME=dark`, `TIMING=realistic`.
The critical fact: **the three verification targets each silently skip
different modules** (verified against the Makefile at commit `c66b885f`):

| Target | emulator | tui | contract/conformance | adapters/opencode | adapters/crush | adapters/goose | adapters/claudecode |
|---|---|---|---|---|---|---|---|
| `make test` | yes | yes | yes | yes | yes | yes | **SKIPPED** |
| `make test-race` | yes | yes | yes | yes | yes | **SKIPPED** | yes |
| `make vet` | yes | yes | yes | yes | yes | **SKIPPED** | **SKIPPED** |
| `make fmt` | broken with go 1.26.4 — see 2a | | | | | | |

Whether the skips are intentional or accretion is undocumented (open question
as of 2026-07-06). Consequence: **a green `make test` does not predict green
CI.** The only full local gates are:

```bash
# Git Bash — canonical release gate (gofmt + per-go.work-module vet/build/test, -count=1, -v,
# GACT_TEST_TIMEOUT=15m, GACT_VERIFY_P=1 by default; ends by building tui/gact):
bash scripts/release-verify.sh
```

or the CI loop equivalent (what ci.yml actually runs):

```bash
for m in $(grep -oE '\./[^ ]+' go.work); do (cd "$m" && go vet ./... && go build ./... && go test ./... -count=1); done
```

`release-verify.sh` deliberately leaves the real-Claude adapter smoke manual:
`(cd adapters/claudecode && GACT_REAL_CLAUDE_SMOKE=1 go test -p 1 ./... -count=1 -run 'TestSmoke_RealClaude')`.

Other targets, one line each: `build`/`build-emulator`/`build-tui` (section 2a);
`run-emulator`/`run-tui`/`ping`/`list` (see gact-run-and-operate);
`install` copies into `~/.local/bin`; `dev-install`/`verify-dev-install`/
`install-for-clio`/`verify-clio-install` symlink the checkout's `tui/gact` into
`~/.local/bin/gact` and `~/.local/share/clio/gact` and verify revision-vs-HEAD;
`screenshots` renders every `tui/*.tape` via vhs; `intro-logo-anim` regenerates
the intro ANSI art; `file-renderers-check`/`install-file-renderers[-python]`
wrap `scripts/file-renderers.sh`; `uninstall`, `clean`.

## 4. Windows trap list (this machine)

| Trap | Why it breaks | Sanctioned path on this machine |
|---|---|---|
| `make` from PowerShell | GNU Make picks cmd.exe; `$(shell ...)`, `test -n`, `ENV=val cmd` recipes all break | Run make from Git Bash (Bash tool) |
| `make dev-install`, `verify-dev-install` | `ln -sfn`, `readlink -f`, `stat -c`, `~/.local` paths — Unix-shaped | No Windows equivalent in-repo; build `tui/gact.exe` and put it on PATH yourself. CI's install-smoke job covers the Unix path |
| `make screenshots` | Tapes are bash-authored (`Set Shell "bash"`, `/tmp/gact` paths); plus the winget ttyd 1.7.7 hang | `.\scripts\vhs-windows.ps1 .\tui\<name>.tape -Backend http://127.0.0.1:<port>` — needs `winget install charmbracelet.vhs`; auto-downloads ttyd 1.7.2 into `.tools\vhs-windows\`; rewrites the tape (bash→cmd, `/tmp/gact`→`gact`, env-prefix `Type` lines→`set X&&` chains) into `.tools\vhs-windows\generated\` |
| `make intro-logo-anim` | needs chafa + imagemagick + python3, and no intro source GIF is tracked (must pass `INTRO_SRC=`) | Linux/WSL only, and only with a supplied GIF |
| `visual_loop/` PTY harness | `visual_loop/tui_audit_pty.py` does `import pty` / `fcntl` / `termios` | Unix-only; on Windows use VHS tapes via vhs-windows.ps1 instead |
| `scripts/file-renderers.sh` | bash + Linux package managers | Unix-only |
| `go test` parallelism | house convention `-p 1` (see 2a) | keep `-p 1` |
| Extension-less binaries | `make build` outputs `tui/gact`, `emulator/emulator-server` without `.exe` | run from Git Bash, or rebuild with `-o gact.exe` |

## 5. Repo hazards (things that eat a careless `git add .`)

- **`tui/.go-cache/`** — a ~2.4MB GOCACHE-layout directory (hex-bucket subdirs)
  that appeared 2026-07-05. It is untracked and **NOT gitignored**
  ([verified]: `git check-ignore tui/.go-cache` exits 1) and nothing in the
  repo references it. Never `git add` it. Its origin is unexplained (open
  question as of 2026-07-06 — likely a sandboxed run with GOCACHE redirected).
  Note the normal cache on this machine is `%LOCALAPPDATA%\go-build`
  ([verified] via `go env GOCACHE`).
- **`.clio/`** — untracked live agent-backend state at the repo root
  (`agent/`, `messages/`, `sessions.json`), also **not gitignored**. Never
  commit it.
- **`.tools/`** — gitignored local binary stash (`vhs-windows/`, `test-bin/`,
  `emulator-server.exe`, `gact.exe`). Safe, but regenerable — never rely on
  its contents being present.
- **Nine Go modules, seven tested.** `go.work` lists 7; two more `go.mod`s
  exist outside it: `loop-test/` (module `loop-test`, a reference template) and
  `apps/desktop/sidecar-launcher/` (module
  `github.com/iowarp/gact-tui/apps/desktop/sidecar-launcher`). Neither is
  covered by any Makefile target or by ci.yml's go.work loop; the
  sidecar-launcher is built only by `apps/desktop/scripts/fetch-sidecar.{sh,ps1}`
  inside apps/desktop workflows. If you edit them, test them yourself.
- **Module-path split** — `tui/go.mod` = `github.com/JaimeCernuda/gact-tui/*`,
  repo remote = `iowarp/gact-tui`, sidecar-launcher already uses the iowarp
  path. Whether a migration is planned is an open question; do not "fix" the
  paths as a drive-by.
- Untracked run artifacts (`apps/clio-*.log`, `visual_loop/tui_audit_*/`) are
  regenerable — never commit them (root CLAUDE.md rule).

## 6. Docker (3 images, repo-root context)

`docker/` holds `Dockerfile.clio-api`, `Dockerfile.clio-web`,
`Dockerfile.clio-tui`, a `docker-compose.yml`, entrypoints, and an nginx conf.
Facts that matter (from the Dockerfiles + `docker/README.md`; **not built
locally during verification**):

- **Build context is the REPO ROOT** for all three — the TUI image needs the
  whole `go.work` workspace, the web image needs `apps/`. Example from the
  Dockerfile header:
  `docker build -f docker/Dockerfile.clio-tui --build-arg CLIO_REF=develop -t clio-tui .`
- **`.dockerignore` at the repo root is load-bearing** — without it the context
  is multiple GB (research clones, node_modules, target/, media). Do not weaken
  it.
- **`CLIO_REF` build-arg** (default `develop`) selects the clio-agent git ref
  pip-installed in a builder stage; `/opt/venv` is copied into a slim runtime.
- Base images: clio-api = python:3.12-slim; clio-web = node:20-bookworm-slim
  builder (pnpm pinned 9.15.9) + python:3.12-slim; clio-tui =
  golang:1.25-bookworm builder + python:3.12-slim.
- These images use the GACT entry point `clio-agent-gact`, NOT clio-agent's own
  `clio_agent.ui.api:app` (deliberate — see `docker/README.md`).
- Published on `clio-desktop-v*` tags to `ghcr.io/iowarp/clio-{api,web,tui}`.

## 7. CI map (.github/workflows/, as of 2026-07-06)

| Workflow | Trigger | What it actually gates |
|---|---|---|
| `ci.yml` | push/PR to main+develop; **paths-ignore `**.png` `**.gif` `**.md` `screenshots/**` `docs/**`** (docs-only changes never run CI) | 3 jobs: **build-test** = gofmt gate over `git ls-files '*.go'` + per-module `vet/build/test -count=1` loop parsed live from go.work (full 7-module coverage — stricter than any make target); **install-smoke** = `make dev-install && make verify-dev-install && gact version` on ubuntu; **python-adapter** = dorny/paths-filter gated to `adapters/claude-agent-sdk-server/**` changes, python 3.12 + uv, hermetic `tests/test_bridge.py tests/test_endpoints.py` only |
| `apps.yml` | push/PR touching `apps/**` or itself; `clio-desktop-v*` tags; dispatch | **ci** (lint/typecheck/test/build + Playwright chromium visual, uploads `apps/web/screenshots/`), **tauri-debug** (ubuntu-22.04 + windows-latest debug build, no bundle), **native-webview-proof** (dispatch-only: tauri-driver + WebKitWebDriver + xvfb + emulator on :17800), **release** ({lite,bundled} x 4 triples = 8 jobs), **release-web** (pure-web zip), **finalize-notes** (release notes exactly once) |
| `docker.yml` | PRs touching `docker/**`/itself build-only; branch pushes touching docker/tui/emulator/contract/apps; pushes on `clio-desktop-v*` tags | builds 3 images (repo-root context, GHA layer cache); pushes to ghcr.io only on tags. Note: PR paths are narrower than push paths — a TUI-only PR won't docker-build until merged |
| `release.yml` | `v*` tags | cross-compiles `gact` for linux/{amd64,arm64}, darwin/{amd64,arm64}, windows/amd64, CGO_ENABLED=0, `-trimpath -ldflags "-s -w"`; asserts `gact version` revision == GITHUB_SHA prefix on linux/amd64 (revision comes from Go's embedded VCS buildinfo, NOT Makefile ldflags); attaches `gact-<os>-<arch>[.exe]` + `.sha256` to the Release (clio-agent's installer downloads these) |
| `desktop-release.yml` | `clio-desktop-v*` tags; dispatch | tauri-apps/tauri-action on macos/ubuntu-22.04/windows; signs updater artifacts with `TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]` secrets; publishes signed `latest.json` as a DRAFT release |

**Same-tag double-fire:** one `clio-desktop-v*` tag push triggers BOTH
apps.yml's release/release-web/finalize-notes AND desktop-release.yml. The
final release page is the composite of both, and this area has burned before —
the apps.yml comments record the 0.7.0 incidents: notes generated per matrix
job stacked 7x duplicate "What's Changed" blocks; all 4 bundled jobs failed on
a bare `--config tauri.bundled.conf.json` (the tauri CLI resolves `--config`
relative to `apps/desktop`, so it must be `src-tauri/tauri.bundled.conf.json`);
and Linux bundled AppImage was dropped (`--bundles deb,rpm` override) because
build_appimage.sh fails on the half-GB embedded runtime. Which workflow "owns"
the final release-page state is an open question — treat any release-tag push
as a supervised operation (see gact-change-control; tagging is a human action
per the existing `release` skill).

Lockfile asymmetry repeated because it is the classic trap: apps CI
`--frozen-lockfile=false` vs desktop-release strict `--frozen-lockfile`.

## Provenance and maintenance

All facts verified 2026-07-06 at commit `c66b885f` ("fix: sync wire layers to
the codified shapes"). One-line re-verification for anything that drifts:

```powershell
Get-Content go.work -TotalCount 1                                   # Go pin (go 1.25.8)
Select-String -Path .github/workflows/ci.yml -Pattern 'go-version'  # CI Go (1.26.x)
Select-String -Path docker/Dockerfile.clio-tui -Pattern '^FROM golang' # Docker Go
Select-String -Path apps/package.json -Pattern 'packageManager|node' # pnpm/node pins
go version; pnpm --version; node --version; uv --version; vhs --version  # local reality
git ls-files '*go.mod'                                               # module census (9)
git check-ignore -v tui/.go-cache; echo "exit=$LASTEXITCODE"         # 1 = still NOT ignored
Get-ChildItem .github/workflows | Select-Object Name                 # workflow census (5)
Select-String -Path Makefile -Pattern '^(test|test-race|vet|fmt):' -Context 0,7  # module coverage
Select-String -Path scripts/vhs-windows.ps1 -Pattern 'TtydVersion'   # ttyd pin (1.7.2)
```

```bash
# Git Bash: does make fmt still fail / does go build ./... still fail from root?
make fmt; go build ./...
# Full local gate still the same shape?
head -20 scripts/release-verify.sh
```

If any of these disagree with this file, update the file — a wrong runbook is
worse than none.
