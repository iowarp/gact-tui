# Skill: Cut a release (GACT + CLIO, with external branding)

Prepare and verify a release of the gact-tui stack (TUI + web + desktop) and, when
needed, the CLIO-branded build that pulls branding from the **clio-agent** repo.

> **The release tag is a HUMAN action.** Everything here PREPARES and VERIFIES; do not
> push a tag or publish. See `apps/RELEASE-READINESS.md` and
> `docs/TUI_ONE_ZERO_RELEASE_CHECKLIST.md` — the CI matrix builds cross-platform on the
> tag. 0.9 = lab demo, 1.0 = public (memory `project_09_release_plan`).

## 0. Brand-neutral vs CLIO-branded
gact-tui ships **brand-neutral**; CLIO branding is injected at build and **lives in the
clio-agent repo** (memory `project_gact_genericization`). Do not commit CLIO assets into
gact-tui.

## 1. Verify (all must be green before preparing a tag)

**Go workspace** (TUI + emulator + adapters) — the canonical gate:
```sh
cd /d/Libraries/Documents/projects/gact-tui
bash scripts/release-verify.sh      # gofmt, per-module vet/build/test, builds tui/gact binary
```

**Web + desktop:**
```sh
cd apps
pnpm -r lint && pnpm -r typecheck && pnpm -r test
pnpm --filter @clio/web build
pnpm --filter @clio/web test:visual          # Playwright, against emulator on :7777
pnpm --filter @clio/desktop tauri:build:debug
```

**clio backend** (separate repo):
```sh
cd /d/Libraries/Documents/projects/clio-agent
.venv/Scripts/python.exe -m pytest -q       # incl. tests/test_lm_stream.py + policy/permission tests
```

## 2. Branding (mechanism changed this iteration — config file, not env var)

The old `GACT_BRAND_SRC` env var is **gone** (see `apps/branding/NOTICE-brand-mechanism-changed.md`
— PR #725 must be redone against this). The new model:

- Brand selection is a **generated config file**: `apps/brand.config.local.json`
  `{ "profile": "clio", "brandingRoot": "D:\\...\\clio-agent\\branding" }`.
- `pnpm --dir apps/web build:clio` runs `apps/web/scripts/with-brand.mjs`, which writes
  that config and **prefers the external `clio-agent/branding/` dir** when
  `clio-agent/branding/clio/brand.json` exists (else falls back to in-repo `apps/branding`).
- `build:gact` → neutral GACT brand from `apps/branding/gact`.
- The single brand doc is `clio-agent/branding/clio/brand.json`; the build reads
  first-class fields incl. **`backend`, `backendRepository`, `starterPrompts`**.
- The Go **TUI does not read `brand.json`** — pass `GACT_BRAND_NAME` + `GACT_ADAPTER_*`
  from the launcher.
- Full authoring/wiring guide: `apps/branding/INTEGRATION.md`.

Verify the CLIO build actually resolves external branding:
```sh
cd /d/Libraries/Documents/projects/gact-tui/apps/web
pnpm build:clio
cat ../brand.config.local.json   # profile:clio, brandingRoot -> clio-agent/branding (absolute)
```

## 3. Prepare the release
1. Bump versions (web `package.json`, desktop Tauri conf, Go module tags as applicable).
2. Update the release tracking issue / PR description with the current state; durable status lives in issues and PRs (root STATUS.md is archived under docs/archive/).
3. Refresh required screenshots (`apps/web/screenshots/` — see `apps/CLAUDE.md` list) and
   TUI screenshots (`tui-screenshot` skill).
4. Regenerate `apps/RELEASE-READINESS.md` if blockers changed.
5. Commit each change conventionally (`feat:`/`fix:`/`chore:`/`docs:`), **self excluded**
   per global CLAUDE.md. Branch first if on `main`/`develop` default per project rules.

## 4. Release GACT (if the neutral core is what ships)
- Ensure no CLIO assets leaked into the commit (`git status`; branding stays neutral).
- Tag = human. The CI `tauri-debug` matrix (win/mac-x64/mac-arm/linux) is the canonical
  cross-platform verification and runs on the tag.

## 5. Update the external (clio-agent owns branding + the release matrix)
- clio-agent injects branding at build and **owns the release matrix** (memory
  `project_gact_genericization`). After a gact-tui brand-mechanism change, the
  clio-agent side must re-adopt it (the PR #725 note) against `INTEGRATION.md`.
- Bump the gact-tui module reference clio-agent pins (versioned modules, NOT a git
  submodule).
- Confirm clio-agent's brand.json fields (`backend`, `backendRepository`,
  `starterPrompts`) point at the intended managed backend + repo.

## Boundaries
- Never push a tag / publish / release artifacts without explicit human go-ahead.
- Do not commit CLIO branding into gact-tui, or the ndp-demo downloaded data into either repo.
- Do not include yourself in commits (global CLAUDE.md).
