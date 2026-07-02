# Skill: Deploy clio + web (local dev/demo stack)

Bring up the two halves of the live demo stack: the **clio-agent** backend (Python
FastAPI GACT server) and the **web** app (SolidJS/Vite). Both run locally; the web
talks to clio over REST+SSE.

## Repos
- clio backend: `D:\Libraries\Documents\projects\clio-agent` (editable `uv` install in `.venv`)
- web app: `D:\Libraries\Documents\projects\gact-tui\apps\web`

## 1. clio backend

Editable install — **source edits require a restart** to take effect (the running
process imported the old modules). The entrypoint is `clio-agent-gact.exe` in the venv.

```sh
cd /d/Libraries/Documents/projects/clio-agent
CLIO_LM_PROVIDER=claude_code \
CLIO_LM_MODEL=haiku \
CLIO_LM_API_BASE="claude-code://sdk" \
CLIO_CLAUDE_CODE_TRANSPORT=sdk \
CLIO_ALLOWED_ROOTS="D:/Libraries/Documents/projects" \
CLIO_STREAM_AUDIT_LOG="<evid>/audit.jsonl" \
CLIO_SSE_EVENT_LOG="<evid>/sse-events.jsonl" \
.venv/Scripts/clio-agent-gact.exe --host 127.0.0.1 --port 17801 \
  > "<evid>/clio.out.log" 2> "<evid>/clio.err.log"
```
Run it with `run_in_background: true`. Notes:
- `CLIO_ALLOWED_ROOTS` gates filesystem access — must contain any workspace root.
- `CLIO_STREAM_AUDIT_LOG` / `CLIO_SSE_EVENT_LOG` are **optional**; set them only when
  you want the stage-by-stage audit (see `live-web-session.md`, four-quadrant capture).
- The provider config is env-driven here; it also persists across restarts once set.

**Wait for ready** (agent build takes ~20–40s):
```sh
until curl -s --max-time 4 http://127.0.0.1:17801/v1/health 2>/dev/null \
  | grep -q '"overall_status": *"ready"'; do sleep 3; done
```
Health check surfaces `api / sessions / agent / memory / lm` — `lm: ready` = provider wired.

## 2. web app

```sh
cd /d/Libraries/Documents/projects/gact-tui/apps
pnpm install                     # once
pnpm --filter @clio/web build    # tsc typecheck + vite build
pnpm --filter @clio/web preview  # serves on http://localhost:4173  (run in background)
```
Branding is injected at build via `scripts/with-brand.mjs`, which writes
`apps/brand.config.local.json` `{profile, brandingRoot}` (config file, NOT an env var):
- `pnpm --dir apps/web build:clio` → CLIO brand from the **external** repo
  `clio-agent/branding/clio/brand.json` (preferred when it exists).
- `pnpm --dir apps/web build:gact` → neutral GACT brand from in-repo `apps/branding/gact`.
- CLIO assets live in clio-agent, NOT gact-tui. Full detail + authoring guide: see the
  `release` skill and `apps/branding/INTEGRATION.md`.

## 3. connect them
Open `http://localhost:4173/?backend=http://127.0.0.1:17801`. The `?backend=` query
points the web app at the local clio. If clio was restarted, reload the page to
re-establish the SSE connection.

## Gotchas
- After ANY clio source edit → restart clio (editable install loads at import time).
- If port 17801 is stuck: see `cleanup-after-run.md`.
- `pnpm` on Windows is `pnpm.cmd`; the `with-brand.mjs` helper handles that.
