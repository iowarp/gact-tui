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
- The key passphrase, if provided, is written to the **OS keychain**
  via the `keyring` crate. The `keyring` features are restricted to
  `windows-native`, `apple-native`, `linux-native` — no in-memory or
  in-process fallback; if the keychain is unavailable the spawn fails
  with `KeychainWriteFailed` and the user is shown an error card.
- Service identifier: `ai.iowarp.clio.desktop.ssh`. Account:
  `user@host`. Uninstall the app does **not** wipe these; clear them
  with the OS-native credentials tool.

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
