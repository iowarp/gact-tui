# Security posture

CLIO Desktop is a local-first agent client. Its threat model is
"the user double-clicks an installer with no opaque side effects, no
hidden network calls, no credentials leaving the machine." Below is
what we do to meet that bar, where the seams are, and what's
explicitly deferred to v1.0.

## Bundled sidecar (local-only by default)

- The Rust supervisor binds the bundled `clio-agent-gact` to
  `127.0.0.1` on an ephemeral port. Never `0.0.0.0`, never IPv6
  external, never a fixed port.
- The bearer token is 32 random bytes from `rand::thread_rng` (CSPRNG
  on every supported OS), hex-encoded. New token every launch; never
  persisted.
- The supervisor passes `--host 127.0.0.1 --port <ephemeral> --token
  <generated>` to the Go launcher as command-line args. The launcher
  forwards them to `clio-agent-gact` via `CLIO_AUTH_TOKEN` env (env is
  more private than argv on shared machines, and is what the upstream
  server expects per its config-source documentation).
- `/v1/capabilities` is probed with `Authorization: Bearer <token>`
  before the main window is opened. If the probe fails for 30s the
  splash flips to an error state instead of showing a chat shell.

## Attach-first path + cross-origin exposure (FINDING — 2026-05-31)

The section above describes the **bundled-sidecar** flow, where the
supervisor mints a token and a random web page can't know it. But the
path most users actually hit is **attach-first**: the supervisor probes
the conventional `clio start` port (`:17800`) and, if a healthy server
is already answering, **attaches to it with an empty bearer token**,
relying on clio's `trust_socket` auth scheme (localhost is trusted).
That changes the threat model, and two facts compound it:

1. **clio emits `Access-Control-Allow-Origin: *` on every endpoint.**
   Verified 2026-05-31 against develop HEAD (`a350a43`), including
   `/v1/capabilities`, the SSE `/v1/sessions/{id}/events` stream, and
   the `OPTIONS` preflight. So *any* web origin — not just the desktop
   WebView — is allowed to read clio's responses.
2. **The attach path carries no token**, so `trust_socket` is the only
   gate, and `trust_socket` trusts *any* localhost caller.

**Combined exposure:** while the user's clio is running on `:17800`,
any web page open in their *normal* browser can call
`http://127.0.0.1:17800/v1/...`, read the responses (ACAO `*`), and —
because there's no token and localhost is trusted — **create sessions,
read transcripts, and drive tool calls** (e.g. `shell_bash`). That is a
classic local-service cross-origin / CSRF exposure that can reach code
execution through the agent's tool surface. It is a property of the
clio + browser combination, not of any single desktop bug, which is why
it is filed here against the auth model rather than as a UI defect.

**Mitigations (none shipped yet — tracked for the release bar):**
- **(a)** Desktop should send a bearer token even on the attach path
  (requires clio to accept/issue one for an already-running instance),
  so `trust_socket`-alone is never the only gate.
- **(b)** clio should scope `Access-Control-Allow-Origin` to the known
  desktop origin instead of `*` (this is a clio-side change).
- **(c)** ✅ **Done.** Route **all** WebView↔clio traffic — including SSE —
  through Rust so the WebView never depends on clio's CORS. SSE now
  streams through the `gact_sse_open`/`gact_sse_close` bridge
  (`src/sse_bridge.rs`): Rust reads the stream and forwards each event
  over the keyed global `gact:sse` Tauri event (filtered by
  `client_id`), and the bearer token rides in the sseUrl query
  string (an `EventSource` can't send headers). The pure-web build still
  uses `EventSource`. Verified by a live integration test
  (`sse_bridge::tests::streams_real_clio_events_through_the_parser`) and
  the existing visual suite (EventSource path unchanged). This removes
  the desktop's dependence on clio CORS for live streaming; (a) and (b)
  remain open for the REST/attach-token side.

See `apps/05-open-questions.md` Q4 (auth model) — this finding is the
concrete cross-origin consequence of `trust_socket` being the only
implemented scheme.

## Frontend handle exposure

- The frontend never sees the bundled-sidecar URL or token until it
  calls the Rust `get_backend` Tauri command. There is no localhost
  URL embedded in the HTML, no token in the build.
- For remote backends (`http`, `ssh-tunnel`) the user-typed bearer
  tokens are stored in browser `localStorage` under
  `clio.backends.v1`. This is fine for v0.9 on a single-user machine;
  v1.0 will move desktop entries to an OS-keychain-backed
  `Persistence` implementation.

## Tauri allowlist + CSP

- The default CSP in `tauri.conf.json`:
  ```
  default-src 'self';
  connect-src 'self' http://localhost:* http://127.0.0.1:* https://* http://*;
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  img-src 'self' data: blob:;
  script-src 'self'
  ```
  `connect-src` allows any HTTPS host because legitimate remote
  backends live anywhere; you control which ones you've registered.
  Local HTTP is allowed for the bundled sidecar.
- The Tauri capability set is locked down to:
  ```
  core:default
  core:window:allow-set-title / -size / -minimize / -maximize
  notification:default
  ```
  No filesystem allowlist (no Tauri-side file read/write), no shell
  allowlist (the launcher binary is spawned by Rust, not by the JS
  shell plugin), no clipboard, no dialog.
- Tauri commands exposed to JS:
  - `harness_info()` — version + contract metadata only
  - `get_backend()` — local sidecar handle
  - `tunnel_open(req)` — desktop-only, spawns `ssh -L`

## SSH tunnel (desktop only)

- The TunnelManager probes `ssh -V` before any spawn. Missing-tool
  case returns `SshNotInstalled` so the AddRemote wizard can render a
  pointer to the OpenSSH install steps.
- The actual command is:
  ```
  ssh -N -T \
      -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=30 \
      -o ServerAliveCountMax=3 \
      -L <local_port>:127.0.0.1:<remote_port> \
      -i <key_path> \
      user@host
  ```
  No agent forwarding (`-A`), no X11 (`-X`), no `StrictHostKeyChecking
  no`. The user's `~/.ssh/known_hosts` is the authoritative source.
  The `-i <key_path>` flag is included only when a key path was
  provided in the wizard.
- Authentication is delegated entirely to `ssh` itself: an
  agent-provided identity (ssh-agent) or an unencrypted key file
  (`-i <key_path>`). The app supplies no passphrase and stores **no**
  SSH secrets anywhere — nothing is written to the OS keychain. An
  encrypted key with no agent loaded cannot be unlocked by the app;
  the tunnel simply fails to come up, exactly as it would at a
  terminal. Wiring an `SSH_ASKPASS` helper for that case is tracked
  as follow-up work.

## File access

- The frontend never reads files directly. File interactions go
  through tools the agent exposes (`fs_read_file`, `fs_propose_edit`,
  …) which respect `clio-agent`'s file-policy (allowed roots, max
  size, symlink mode). See
  [clio-agent's PERMISSIONS docs](https://github.com/iowarp/clio-agent/blob/develop/docs/PERMISSIONS.md).

## What's deferred to v1.0

- **Code signing** (Authenticode for Windows, Developer ID + Apple
  notarization for macOS, GPG / Sigstore for Linux). The v0.9
  installers carry their CI provenance via the Release Notes but no
  cryptographic stamp.
- **Auto-update** via Tauri's built-in updater. Right now you
  re-install from the Release page.
- **OS-keychain bearer-token storage on desktop.** Today bearer
  tokens for remote backends live in `localStorage`. The desktop
  build will move to an `OsKeychainPersistence` implementation of
  the `Persistence` trait — same shape, same call sites.

## Reporting

Security issues: please file a private security advisory at
<https://github.com/iowarp/gact-tui/security/advisories> rather than
opening a public issue. We will respond within 7 days.

If the disclosure is for `clio-agent` rather than the desktop / web
client, route it through
<https://github.com/iowarp/clio-agent/security/advisories>.
