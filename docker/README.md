# CLIO in Docker

Container images for the CLIO stack. This is an **addition** to the existing
install-script / desktop-installer distribution (the `clio-desktop-v*` release
installers built by `.github/workflows/apps.yml`; see `desktop/README.md`), not
a replacement — use whichever fits your environment.

Three images, all built from this repo:

| Image | What runs inside | Port | How you use it |
|-------|------------------|------|----------------|
| `clio-api` | `clio-agent-gact` (GACT REST + SSE server) | `7777` | Headless backend for any GACT client |
| `clio-web` | `clio-agent-gact` (loopback) + **nginx serving the web UI** with `/v1` proxied | `80` | Browser UI, one container, no CORS setup |
| `clio-tui` | `clio-agent-gact` (loopback) + the **Bubbletea TUI** | — | `docker run -it` for a terminal client |

All three are based on `python:3.12-slim`. clio-agent pulls in a large
scientific Python stack (numpy / pyarrow / matplotlib / h5py via DSPy), so the
images land around **~1.0 GB** — that floor is set by clio-agent's own
dependencies, not the packaging here.

---

## Quick start

> Replace `clio-api` / `clio-web` / `clio-tui` with
> `ghcr.io/iowarp/clio-api` (etc.) to pull the published images instead of
> building locally.

### 1. `clio-api` — headless REST API

```sh
# build (from the REPO ROOT — the build context is the repo, not docker/)
docker build -f docker/Dockerfile.clio-api -t clio-api .

# run
docker run -d -p 17800:7777 --name clio-api clio-api

# probe
curl http://127.0.0.1:17800/v1/capabilities      # -> 200 JSON, contract_version 0.2
curl -X POST http://127.0.0.1:17800/v1/sessions   # -> creates a session

# stop
docker stop clio-api && docker rm clio-api
```

Point the TUI or the pure-web bundle at `http://localhost:17800`.

### 2. `clio-web` — agent + browser UI in one container

```sh
docker build -f docker/Dockerfile.clio-web -t clio-web .

# Map host 17800 -> container 80. The web app's pure-web splash auto-probes
# http://localhost:17800, so mapping THIS port makes it connect with no clicks.
docker run -d -p 17800:80 --name clio-web clio-web

# open the UI
#   http://localhost:17800
```

Inside the container, clio listens only on `127.0.0.1:7777`; nginx serves the
static bundle on `:80` and reverse-proxies `/v1/*` to clio. The browser only
ever talks to nginx, so the API is **same-origin** — no CORS, and the SSE event
stream (`/v1/sessions/{id}/events`) flows through with buffering disabled.

If you map a different host port (e.g. `-p 8080:80`), the splash auto-probe to
`:17800` won't match the page origin and you'll land on the manual **Connect**
form — just enter `http://localhost:8080` there; nginx proxies it correctly.

```sh
docker stop clio-web && docker rm clio-web
```

### 3. `clio-tui` — agent + terminal UI in one interactive container

```sh
docker build -f docker/Dockerfile.clio-tui -t clio-tui .

# MUST be interactive — the TUI needs a TTY:
docker run -it --rm clio-tui

# pass flags / subcommands straight through to gact:
docker run -it --rm clio-tui --theme light
docker run --rm clio-tui --help          # fast path: does not boot clio
```

The entrypoint starts clio on loopback, waits for `/v1/capabilities`, then
exec's `gact` with `GACT_BACKEND` already pointed at it. Exiting the TUI stops
the container and tears clio down.

---

## docker compose

A compose file with `api` and `web` profiles lives in this directory. Run it
from `docker/`:

```sh
cd docker

docker compose --profile api up -d     # REST API on http://localhost:17800
docker compose --profile web up -d     # web UI   on http://localhost:17800

docker compose --profile web logs -f
docker compose --profile web down
```

`clio-tui` is interactive and is intentionally not a compose service — run it
with `docker run -it --rm clio-tui`.

Override the host port or clio ref with env vars (or an `--env-file`):

```sh
CLIO_WEB_PORT=8080 CLIO_REF=develop docker compose --profile web up -d
```

---

## Wiring an LLM provider

Containers have no Globus/ALCF session, so by default clio comes up in
**capability-only mode**: `/v1/capabilities` and session CRUD work, but chat
turns return `503 agent:unavailable`. That is expected.

To enable real chat, give clio a provider. Three ways:

### A. Environment variables (simplest — works for openai / anthropic / openrouter)

```sh
docker run -d -p 17800:7777 \
  -e CLIO_LM_PROVIDER=openai \
  -e CLIO_LM_MODEL=gpt-4o-mini \
  -e CLIO_LM_API_BASE=https://api.openai.com/v1 \
  -e CLIO_LM_API_KEY=sk-... \
  --name clio-api clio-api
```

| Provider | `CLIO_LM_PROVIDER` | `CLIO_LM_API_BASE` | Key |
|----------|--------------------|--------------------|-----|
| OpenAI | `openai` | `https://api.openai.com/v1` | `sk-...` |
| Anthropic | `anthropic` | `https://api.anthropic.com` | `sk-ant-...` |
| OpenRouter | `openrouter` | `https://openrouter.ai/api/v1` | `sk-or-...` |

With compose, set the same vars via the shell or an `--env-file ./clio.env`.

### B. Configure at runtime over the API

```sh
curl -X PUT http://127.0.0.1:17800/v1/providers/lm \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai","model":"gpt-4o-mini","api_key":"sk-..."}'
```

`PUT /v1/providers/lm` builds the agent at runtime — no restart needed.

### C. Argonne / Globus (advanced)

The `argonne` provider needs a live Globus token. There is no interactive auth
inside a container, so mount the host's Globus token state read-only:

```sh
docker run -d -p 17800:7777 \
  -e CLIO_LM_PROVIDER=argonne \
  -e CLIO_LM_MODEL=<alcf-model> \
  -v "$HOME/.globus:/home/clio/.globus:ro" \
  --name clio-api clio-api
```

(Exact mount path depends on where clio-agent reads Globus state on your host —
check the clio-agent docs for the current location.)

---

## Keeping containers up to date

Docker has no in-container auto-update — a running container keeps the image it
was started from. To pull a newer image and restart onto it, use **Watchtower**
or a scheduled `docker compose pull && docker compose up -d`, and optionally have
the entrypoint log a warning at startup when the running image is behind the
latest published tag. See [`AUTOUPDATE.md`](./AUTOUPDATE.md) for both approaches
and how they tie to the shared `git describe` version stamp (the same one the web
and desktop surfaces show).

---

## Security notes

- **Bind scope.** `clio-api` binds `0.0.0.0:7777` so the published port is
  reachable; in `clio-web` and `clio-tui`, clio binds **loopback only** and is
  never exposed — the browser reaches it through the nginx `/v1` proxy and the
  TUI over localhost inside the container.
- **Auth.** By default clio uses `trust_socket` auth (any local caller is
  trusted). When you publish `clio-api` beyond localhost, set a bearer:
  ```sh
  docker run -d -p 17800:7777 -e CLIO_AUTH_TOKEN=$(openssl rand -hex 24) clio-api
  ```
  Clients then send `Authorization: Bearer <token>`. The `clio-web` nginx
  config forwards `Authorization` through to clio, and the web Connect form has
  a token field.
- **Non-root.** `clio-api` and `clio-tui` run as the unprivileged `clio`
  (uid 10001). `clio-web`'s nginx master starts as root only to bind `:80`;
  the clio process is dropped to the `clio` user.
- **Secrets.** Pass API keys via `-e` / `--env-file` / a secrets manager —
  never bake them into an image. The Dockerfiles take no key build-args.
- **Provider data egress.** With a provider configured, chat content is sent to
  that provider's API. In capability-only mode nothing leaves the container.

---

## Build internals (for maintainers)

- **`CLIO_REF` build-arg** (default `develop`) selects the clio-agent git ref:
  `--build-arg CLIO_REF=<branch|tag|sha>`.
- clio-agent is installed via `pip install "clio-agent @ git+...@${CLIO_REF}"`
  in a **builder stage**; `git` lives only in that stage and the resulting
  `/opt/venv` is copied into the slim runtime — no build tools in final images.
  > Note: clio-agent's *own* Dockerfile launches `clio_agent.ui.api:app`, which
  > is the non-GACT server. These images deliberately use the GACT entry point
  > `clio-agent-gact` (`clio_agent.gact.app:main`) instead.
- **`clio-web`** builds the `@clio/workspace` bundle in a Node stage
  (`pnpm install --filter "@clio/workspace..."` + `pnpm --filter @clio/workspace build`,
  pnpm pinned to `9.15.9` to match `.github/workflows/apps.yml`).
- **`clio-tui`** builds the deprecated `gact` binary in a `golang:1.25` stage.
  The image copies the independent contract modules and builds the TUI explicitly
  with `GOWORK=off`; the retired emulator is not part of the image or workspace.
- The repo-root **`.dockerignore`** keeps the build context lean (excludes
  `research/`, `node_modules`, `.venv`, `target/`, `dist/`, screenshots,
  `*.png`/`*.gif`, `.git`). Without it the context is multiple GB.

### CI

`.github/workflows/docker.yml` builds all three images on PRs that touch
`docker/**`, and on `clio-desktop-v*` tags it builds and pushes to
`ghcr.io/iowarp/clio-{api,web,tui}`.
