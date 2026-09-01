# Docker auto-update

How to keep a running CLIO container current, and an optional startup
version-check the entrypoint can do. **This is documentation only — nothing here
changes the runtime behaviour of the images today.** It is the Docker counterpart
to the desktop signed-updater flow (`desktop/DESKTOP-AUTOUPDATE.md`) and ties to
the same release identity used by native packages (see "Version stamp" below).

## TL;DR

Docker has **no native in-container auto-update**. A running container keeps the
image it was started from until you replace it. The two standard ways to pull a
newer image and restart onto it are:

1. **[Watchtower][watchtower]** — a sidecar that watches the registry and
   automatically pulls + recreates a container when its tag points at a new image
   digest. Best for "set it and forget it" single-host deployments.
2. **Scheduled `pull` + `up`** — a cron/systemd timer that runs
   `docker compose pull && docker compose up -d`. Best when you want updates to
   land on *your* schedule (maintenance windows) rather than whenever a new image
   is published.

Either way, **pin a moving tag** (e.g. `:latest`, `:develop`, or a `:v0` major
line) so "pull again" actually resolves to a newer digest. A fully pinned digest
(`@sha256:…`) never updates — that is the point of pinning it, and you update it
by changing the reference.

---

## 1. Watchtower (auto-pull + restart on a new image)

Watchtower runs alongside your containers, periodically checks the registry for
the tags they were started with, and — when the remote digest differs — pulls the
new image, stops the old container, and starts a replacement with the same flags,
volumes, and env. No bespoke logic in our images is required.

Add it as a service next to the compose profiles in this directory:

```yaml
# docker/docker-compose.yml (sketch — add as its own service)
services:
  watchtower:
    image: containrrr/watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock   # how it controls Docker
    command:
      - --cleanup                  # remove the old image after a successful swap
      - --interval=3600            # check hourly (or use --schedule for cron)
      # - --label-enable           # only watch containers that opt in (see below)
```

Opt a single container in (recommended over watching everything):

```yaml
  clio-web:
    image: ghcr.io/iowarp/clio-web:latest
    labels:
      com.centurylinklabs.watchtower.enable: "true"
```

Notes and caveats:

- **Socket access is privileged.** Mounting `/var/run/docker.sock` gives
  Watchtower root-equivalent control of the host's Docker. Run it only where you
  trust the host, or use a socket-proxy to scope it down.
- **Private registries** need credentials — mount a `~/.docker/config.json` or
  use Watchtower's `REPO_USER`/`REPO_PASS` env vars.
- **Notifications** (`--notification-url=…`) can post to Slack/email/etc. when an
  update is applied, which pairs well with the version-check warning in §3.
- Watchtower restarts the container, so it is the right tool for the **stateless**
  `clio-api` / `clio-web` images. Anything holding session state should externalise
  it to a volume first (the images already write under `$HOME`).

[watchtower]: https://containrrr.dev/watchtower/

---

## 2. Scheduled `docker compose pull && up -d`

If you would rather control *when* updates land, skip Watchtower and drive the
compose file from a timer. This re-pulls every image whose tag moved and recreates
only the containers whose image digest actually changed.

```sh
# update.sh — run from docker/
set -euo pipefail
cd "$(dirname "$0")"
docker compose --profile web pull
docker compose --profile web up -d        # recreates only changed services
docker image prune -f                     # reclaim the superseded layers
```

Wire it to a schedule with cron:

```cron
# /etc/cron.d/clio-update — pull + restart nightly at 03:30
30 3 * * *  deploy  /opt/clio/docker/update.sh >> /var/log/clio-update.log 2>&1
```

or a systemd timer (`clio-update.service` + `clio-update.timer` with
`OnCalendar=*-*-* 03:30:00`). Same effect; pick whichever your host already uses.

This is the most portable option — it needs no extra container and no Docker
socket mount — at the cost of updating on a fixed cadence rather than promptly.

---

## 3. Optional: startup version-check in the entrypoint

Auto-pull tools answer "fetch the newer image." They do **not** tell an operator
who is *not* using them that their long-running container has drifted behind the
latest published build. A cheap, read-only nudge is for the **entrypoint to log a
warning at startup** when the running image is older than the latest published
tag. It pulls nothing and changes no behaviour — it just prints a line an operator
(or a log scraper) can act on.

This is **not wired into the entrypoints today** — `clio-web-entrypoint.sh` and
the `clio-api` inline entrypoint deliberately do no network calls at boot beyond
the local readiness probe. The snippet below is the recommended shape if you
choose to add it; keep it **non-fatal** (a failed check must never block startup,
e.g. in an air-gapped deploy).

### Step 1 — bake the running version into the image

Stamp the image with the shared version at build time so the container can read
its *own* version without a network call. Add an OCI label (and optionally a
`VERSION` env) driven by a build-arg in each Dockerfile:

```dockerfile
# In the runtime stage of each Dockerfile.clio-*
ARG CLIO_VERSION=dev
LABEL org.opencontainers.image.version="${CLIO_VERSION}"
ENV CLIO_VERSION="${CLIO_VERSION}"
```

and pass it from CI using the same stamp every other surface uses:

```sh
docker build -f docker/Dockerfile.clio-web \
  --build-arg CLIO_VERSION="$(git describe --tags --match 'v[0-9]*' --always --dirty)" \
  -t clio-web .
```

> The `clio-web` image already ships a machine-readable marker for the web
> bundle: the build emits `version.json` into the nginx root, so
> `curl -fsS http://127.0.0.1/version.json` returns `{"version":"…"}` for that
> image with no extra wiring. The entrypoint can read its baked `CLIO_VERSION`
> directly instead.

### Step 2 — discover the latest published version

Compare against either:

- **A registry tag listing.** For GHCR, query the published tags and take the
  newest semver. (Listing GHCR package versions needs a token with
  `read:packages`; for public images an anonymous pull-token works for the
  manifest API.)
- **A version endpoint.** If you front the deployment with the web image, its
  `GET /version.json` is already a no-auth "what's the latest I serve" marker —
  point the check at the canonical/blue-green URL.

### Step 3 — compare and warn (non-fatal)

```sh
# Optional startup drift check. Source/inline this near the end of the
# entrypoint, AFTER the local readiness probe. Never let it fail the boot.
check_for_newer_image() {
    # What we are running (baked at build time — see Step 1).
    running="${CLIO_VERSION:-dev}"
    [ "$running" = "dev" ] && return 0          # unstamped/local build — skip

    # What's published. Swap this for your registry API or version endpoint.
    latest="$(curl -fsS --max-time 5 \
        "https://your.host/version.json" 2>/dev/null \
        | sed -n 's/.*"version"[: ]*"\([^"]*\)".*/\1/p')" || latest=""
    [ -z "$latest" ] && return 0                # offline / air-gapped — skip quietly

    if [ "$running" != "$latest" ]; then
        echo "[clio] update available: running ${running}, latest ${latest}." \
             "Pull the new image (Watchtower or 'docker compose pull && up -d')." >&2
    fi
}
check_for_newer_image || true                   # belt-and-suspenders: never fatal
```

String inequality is intentionally conservative: any difference from the latest
tag prints the hint. If you want "behind" vs "ahead/dirty" precision, compare with
`sort -V` instead of `!=`. Keep `--max-time` small and the whole call best-effort
so a slow or unreachable registry adds no startup latency on the happy path.

---

## Version stamp (shared across all surfaces)

Every surface reports the **same** repo-wide stamp so "which build is this?" has
one answer everywhere:

```sh
git describe --tags --match 'v[0-9]*' --always --dirty
# e.g. v0.3.0-2098-g31c252e7  (or …-dirty from a modified tree)
```

- **TUI** prints it as the build version.
- **Web** is built as hashed static assets from the top-level `web/` package; it
  currently has no custom version-marker polling path.
- **Desktop** uses the Tauri package version for its signed updater feed
  (`desktop/DESKTOP-AUTOUPDATE.md`).
- **Docker** should bake it into `org.opencontainers.image.version` / `CLIO_VERSION`
  via the `--build-arg CLIO_VERSION="$(git describe …)"` shown in §3, so an image's
  self-reported version lines up with the badge the web/desktop UIs display.

Keeping the stamp identical means a Watchtower notification, a desktop update prompt,
and a `docker inspect … org.opencontainers.image.version` all name the same build.

---

## Security notes

- **No secrets in images or this repo.** The version-check is read-only and needs
  no credentials for public images. Any private-registry token for Watchtower or
  the tag listing is supplied at runtime (env/mounted `config.json`) — never baked
  into a layer. (See `docker/README.md` → Security notes.)
- **Watchtower's Docker socket is privileged** — see §1. Prefer `--label-enable`
  to limit blast radius, and consider a socket proxy.
- **Signing.** The image-distribution trust story is the registry's (content
  digests, optional cosign/Notation signatures) — distinct from the desktop
  updater's minisign signing in `DESKTOP-AUTOUPDATE.md`. If you adopt signed
  images, keep private keys in CI secrets only; this repo carries placeholders and
  docs only.
