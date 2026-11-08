# Desktop auto-update (Tauri 2)

The CLIO/GACT desktop shell ships with the [`tauri-plugin-updater`][plugin]
auto-updater. On launch it asks a signed `latest.json` marker on the project's
GitHub releases whether a newer build exists; if one does it surfaces a toast,
and on the user's confirmation it downloads + signature-verifies + installs the
new bundle and relaunches into it.

### Stable and beta channels

**Settings → General → CLIO updates → Enable beta updates** controls both the
Agent version indicator and the signed Desktop updater. The switch warns that
betas may be unstable. Stable installations default to stable; existing beta
installations default to beta. A saved explicit choice takes precedence.

Stable checks retain the configured latest-release endpoint. Beta checks choose
the highest published stable or numbered beta release from the branded GitHub
repository, excluding drafts and releases without update manifests. The native
bridge changes only the release tag in the configured endpoint; the configured
public key, platform selection, and signature verification remain in force.
Ordinary checks require a newer version. Repair may reinstall only the running
app's exact signed version. Switching channels never installs or downgrades software.

CLIO Desktop beta 1 predates this setting and has a stable-only updater. Those
installations need one manual Desktop upgrade to gain channel-aware updates.

This document covers the parts that are NOT in the repo: the signing keypair and
the release CI that builds, signs, and publishes `latest.json`. The client
plumbing (plugin registration, config, capability, and the launch check) is
already wired — see "What's wired in the repo" below.

> The neutral `tauri.conf.json` and `tauri.gact.conf.json` carry the GACT
> minisign public key; an embedding brand overlay (CLIO's
> `branding/clio/tauri.clio.conf.json`) carries its own key and endpoint.
> **No private key is, or should ever be, committed to this repo.**

### Which feed updates which build

Each product owns its own feed, and a client follows only the endpoint its
brand overlay declares:

| Build                          | Published by                   | Updater endpoint                                       |
| ------------------------------ | ------------------------------ | ------------------------------------------------------ |
| GACT Desktop (neutral)         | gact-tui `desktop-release.yml` | gact-tui `releases/latest/download/latest.json`        |
| CLIO Desktop, lite and bundled | clio-agent `clio-bundles.yml`  | clio-agent `releases/latest/download/latest-lite.json` |

The gact-tui `apps.yml` release installers carry a stub runtime and no updater
key, so they build with `src-tauri/tauri.no-updater.conf.json`
(`createUpdaterArtifacts: false`) and never publish an update payload that
could replace a real bundle. On macOS the `.app.tar.gz` update payload must be
produced from the signed, notarized and stapled app; Tauri creates it after it
notarizes the app, so building with the Apple secrets set is sufficient.

## 1. Generate the signing keypair (one time, by a maintainer)

Tauri signs every update artifact with a minisign keypair. Generate it locally:

```sh
# From desktop/ (any dir works; the CLI is the Tauri CLI).
pnpm --filter @clio/desktop tauri signer generate -w ~/.tauri/clio-updater.key
```

This prints (and writes) two things:

- a **private key** (the `*.key` file) and the **password** you set — these are
  SECRETS. They never enter the repo. They go into CI as encrypted secrets.
- a **public key** (a single base64 line) — this is NOT secret. It goes into the
  `plugins.updater.pubkey` field of every `tauri.conf.json` variant.

### Install the public key

Replace the placeholder in all three config variants (they are kept consistent):

- `src-tauri/tauri.conf.json` (CLIO brand — the base config)
- `src-tauri/tauri.gact.conf.json` (neutral GACT brand overlay)
- `src-tauri/tauri.bundled.conf.json` (thin overlay; inherits the base `plugins`
  block, so nothing to change there unless you want a different key)

```jsonc
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/iowarp/gact-tui/releases/latest/download/latest.json"
    ],
    "pubkey": "<paste the base64 public key here>",
    "windows": { "installMode": "passive" }
  }
}
```

### Store the private key in CI

Add two repository secrets in GitHub (Settings → Secrets and variables →
Actions):

- `TAURI_SIGNING_PRIVATE_KEY` — the **contents** of the `*.key` file (not the
  path).
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you set at generate time.

`tauri build` reads those two env vars and signs each updater artifact, emitting
a `*.sig` next to every installer.

## 2. Release CI: build, sign, publish `latest.json`

Use the official [`tauri-apps/tauri-action`][action] on a release tag. It builds
each platform, signs the artifacts with the secrets above, and — because
`createUpdaterArtifacts: true` is set in `bundle` — produces and uploads
`latest.json` (the marker the client polls).

`.github/workflows/desktop-release.yml` is the maintained version of this
job. It builds macOS per architecture and adds the signing steps described in
[macOS signing and notarization](#macos-signing-and-notarization). The
original sketch, for orientation:

```yaml
name: desktop-release
on:
  push:
    tags: ['v*']

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - { platform: macos-latest, args: '--target aarch64-apple-darwin' }
          - { platform: macos-latest, args: '--target x86_64-apple-darwin' }
          - { platform: ubuntu-22.04, args: '' }
          - { platform: windows-latest, args: '' }
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install --frozen-lockfile
        working-directory: apps
      # Fetch the GACT sidecar the shell bundles (see scripts/fetch-sidecar.sh).
      - run: pnpm --filter @clio/desktop fetch-sidecar
        working-directory: apps
      - uses: tauri-apps/tauri-action@v0
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: desktop
          tagName: ${{ github.ref_name }}
          releaseName: 'CLIO Desktop ${{ github.ref_name }}'
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

`tauri-action` uploads each platform's installer, its `.sig`, and merges every
platform into a single `latest.json` attached to the release. The client's
endpoint — `releases/latest/download/latest.json` — always resolves to the
newest published release's marker.

A `latest.json` looks like:

```json
{
  "version": "0.8.0",
  "notes": "Release notes shown in the update prompt.",
  "pub_date": "2026-06-23T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<minisign sig>",
      "url": "https://github.com/iowarp/gact-tui/releases/download/v0.8.0/CLIO.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "<minisign sig>",
      "url": "https://github.com/iowarp/gact-tui/releases/download/v0.8.0/clio_0.8.0_amd64.AppImage"
    },
    "windows-x86_64": {
      "signature": "<minisign sig>",
      "url": "https://github.com/iowarp/gact-tui/releases/download/v0.8.0/CLIO_0.8.0_x64-setup.exe"
    }
  }
}
```

The updater downloads the artifact for the running platform, verifies its
`signature` against the configured `pubkey`, and installs it. A mismatch (wrong
key, tampered artifact) is rejected.

### macOS signing and notarization

Gatekeeper on macOS 14+ blocks a downloaded app unless it is signed with a
Developer ID and notarized. macOS builds are per architecture: the bundled
runtime and the launcher are single-arch, so a universal shell would start on
Intel without a working service.

What signs what:

- `scripts/macos-sign-runtime.sh` signs every Mach-O file in
  `src-tauri/gact-runtime` inside-out (libraries, then executables with
  `entitlements/runtime.entitlements`) with the hardened runtime and a secure
  timestamp. It first precompiles the bundled Python library with
  unchecked-hash `.pyc` files and can thin universal files to the target
  architecture. `scripts/run-tauri-branded.mjs` runs it automatically for any
  macOS `tauri build` whose config ships `gact-runtime/`, so every caller,
  including clio-agent's `clio-bundles.yml`, gets it. Set
  `CLIO_MACOS_SIGN_RUNTIME=0` to opt out.
- Tauri then signs the launcher and the app with `APPLE_SIGNING_IDENTITY`,
  `bundle.macOS.hardenedRuntime` and `entitlements/app.entitlements`, notarizes
  and staples the app, and signs the DMG.
- `scripts/macos-notarize.sh` notarizes and staples the DMG, which Tauri does
  not do.
- `scripts/macos-verify-app.sh` runs `codesign --verify --deep --strict`,
  checks every nested Mach-O for the hardened runtime and reports
  `spctl`; with `--require-notarized` it also requires Gatekeeper acceptance and
  `stapler validate`.
- `scripts/macos-signing-setup.sh` imports the certificate into a temporary
  keychain and exports the variables above; `cleanup` deletes it.

Runtime entitlements: `disable-library-validation` (Python loads wheels that
the runtime installs after first launch) and
`allow-unsigned-executable-memory` (cffi and ctypes callbacks). Only
iowarp-core's `clio_run`, which its parent starts with `DYLD_*` variables,
also gets `allow-dyld-environment-variables`
(`entitlements/runtime-dyld.entitlements`; the names come from
`MACOS_DYLD_EXECUTABLES`). `allow-jit` is deliberately absent; add it only
with a package that needs it. Do not enable the app sandbox.

Repository secrets (Settings → Secrets and variables → Actions):

| Secret                                        | Value                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`                           | base64 of the exported Developer ID Application certificate and private key (`.p12`): `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD`                  | the `.p12` export password                                                                                           |
| `APPLE_SIGNING_IDENTITY`                      | optional; for example `Developer ID Application: Name (TEAMID)`. Found from the certificate when unset               |
| `KEYCHAIN_PASSWORD`                           | optional; a random password is generated when unset                                                                  |
| `APPLE_API_KEY`                               | App Store Connect API key ID (preferred notarization method)                                                         |
| `APPLE_API_ISSUER`                            | the API key's issuer ID                                                                                              |
| `APPLE_API_PRIVATE_KEY`                       | contents of `AuthKey_<KEYID>.p8` (PEM text or base64)                                                                |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | alternative to the API key: Apple ID, an app-specific password and the team ID                                       |

Without the certificate the builds are ad-hoc signed with the hardened
runtime, so forks and pull requests still build. Without notarization
credentials a signed build is not notarized. Pull-request builds of
`apps.yml` (`tauri bundle · macos-latest · aarch64`) never notarize; they
upload an ad-hoc DMG for testing.

Verify a release by hand:

```sh
codesign --verify --deep --strict --verbose=2 "CLIO Desktop.app"
spctl -a -vvv -t exec "CLIO Desktop.app"   # source=Notarized Developer ID
xcrun stapler validate "CLIO Desktop.app"
xcrun stapler validate CLIO.Desktop_*_aarch64.dmg
```

If notarization fails, `xcrun notarytool log <submission-id>` lists every file
it rejected; `macos-notarize.sh` prints it automatically.

### First launch on macOS

- **Install location.** When the app runs from its disk image or from
  Gatekeeper's App Translocation mount (a quarantined app opened straight
  from Downloads), it offers **Move to Applications** and reopens from there.
  It moves into `/Applications`, or `~/Applications` for standard accounts.
  The manual fix is to drag the app into Applications, or for an
  unnotarized test build:
  `xattr -dr com.apple.quarantine "/Applications/CLIO Desktop.app"`.
- **Read-only bundle.** Nothing writes inside the signed app. The launcher sets
  `PYTHONDONTWRITEBYTECODE=1`; the runtime ships its bytecode precompiled and
  signed. Check with `find "CLIO Desktop.app" -newer <marker>` after a launch.
- **Shell environment.** Apps opened from Finder inherit launchd's minimal
  `PATH`. At startup the desktop reads the login shell's `PATH`
  (`$SHELL -i -l`, three-second limit, logged in the boot log) and falls back
  to Homebrew, `/usr/local`, `~/.local/bin` and `~/.cargo/bin`. Terminal
  sessions start the shell as a login shell (`-l`).
- **Menus and tray.** The menu bar has Window (Minimize, Zoom, Full Screen,
  Close, Bring All to Front) and Help menus. The menu-bar item uses the
  brand's `trayTemplate` image as a template icon and opens its menu on a
  left click.
- **First-run preparation.** Long first launches come from the embedding
  agent preparing its runtime packages; moving that work into the runtime
  build is tracked in iowarp/gact-tui#739 (C1).

## 3. How the client check works (already in the repo)

- **Plugins** — `src-tauri/src/lib.rs` registers
  `tauri_plugin_updater::Builder::new().build()` (the updater) and
  `tauri_plugin_process::init()` (so the frontend can relaunch into the new
  binary after install).
- **Config** — `plugins.updater` in each `tauri.conf.json` variant sets the
  release endpoint, the signing `pubkey`, and `windows.installMode: "passive"`
  (a quiet NSIS install). `bundle.createUpdaterArtifacts: true` makes the build
  emit the signed updater bundle + marker.
- **Capability** — `capabilities/default.json` grants `updater:default` (check +
  download/install) and `process:allow-restart` (relaunch).
- **Frontend bridge** — `web/src/tauri/desktop-updater.ts` dynamically imports
  `@tauri-apps/plugin-updater` for `check()` / `download()` / `install()` and
  `@tauri-apps/plugin-process` for `relaunch()`. Browser execution is rejected
  before either native plugin is loaded.
- **User workflow** — General settings, the bottom-bar version popover and the
  background notification share one coordinator and one **Update CLIO** action.
  Component rows show versions without independent install buttons. Settings
  subscribes to the same check result as the other entry points.

## 4. Verifying locally (without publishing)

1. Generate a keypair and put the public key in the config (as above).
2. Build a low-version installer, install it.
3. Bump `version` in `tauri.conf.json` + `Cargo.toml` + `package.json`, build
   again with the signing env vars set, and host the artifacts + a hand-written
   `latest.json` on a local static server.
4. Point `plugins.updater.endpoints` at the local marker, launch the installed
   (older) app, and confirm the update toast appears and installs.

[plugin]: https://v2.tauri.app/plugin/updater/
[action]: https://github.com/tauri-apps/tauri-action

## Managed backend updates and older installations

The signed app feed chooses one target for the entire installation. Before changing
either component, the coordinator saves that target durably and finishes downloading
and signature-verifying the app payload. Concurrent updates are rejected; native
runtime installers also have a process-wide ownership lease.

Bundled installations replace both app and runtime from that signed payload. They do
not independently pip-update the retained runtime before installing the app. The new
runtime pack's receipt replaces an older cached pack on startup. A bundled app with an
older runtime and no newer app release offers the same update action, reinstalling
the running app's exact signed release to repair the pair.

Lightweight installations with an owned writable/bootstrap runtime install the exact
same target before the app installer runs. The selected wheel owns its dependency
graph; Desktop does not override it with a separate hardcoded list. The runtime must
pass its exact installed/imported-version check and full service entry-point check.
An owned runtime ahead of the available app is a mismatch, never an automatic downgrade.

After restart, **Verifying update** checks the actual native app version and the
Desktop-owned service's authenticated capabilities against the retained target.
Reconnecting alone cannot report success. Partial updates retain their target and
show **Update did not finish**. A selected remote connection cannot complete or fail
this local verification. New bundled apps launch their own runtime rather than
silently adopting an unrelated service on a conventional port.

The action updates this computer's installation. Independently administered remote
services are not silently upgraded with it. In a plain browser, the single update
action identifies the serving installation and opens its exact release instructions;
the browser cannot execute the host's installer. Its UI and runtime ship in the same
backend release. There are no separate browser-UI update controls.

GitHub beta tags and Python versions differ: `v0.9.5-beta.7.1` installs and verifies
`clio-agent==0.9.5b7.post1`. Stable four-component releases retain their published
Python spelling. All update and repair paths retain native signature verification.

When a newer Desktop starts a retained older runtime, package setup checks the old
installer's help before requesting `--reuse-installed`. A legacy installer without
that flag keeps its already installed packages so CLIO can start and expose its
general update action. Failed capability probes and failed supported setup still
surface their actual errors. Package/startup errors are labelled as local startup
failures; an authentication failure keeps its separate sign-in message.

## Reproducible native dependencies

The desktop application commits `desktop/src-tauri/Cargo.lock`. Branded builds
and the signed release job use `--locked`, and the native test jobs use the same
graph. Change dependencies deliberately and regenerate the lock with
`cargo generate-lockfile --manifest-path desktop/src-tauri/Cargo.toml`.
The supported build toolchain is Rust 1.90 or later, matching the updater plugin.

The updater enables Rustls TLS and system proxy support explicitly. Its optional
`zip` feature reads legacy Tauri v1 Windows updater archives and is disabled: this
application publishes Tauri v2 artifacts (`createUpdaterArtifacts: true`), with
signed `.exe`/`.msi` installers on Windows, AppImage on Linux, and `.app.tar.gz`
on macOS. Signature verification remains required. This avoids resolving the
withdrawn legacy ZIP crate versions on a fresh checkout. See the
[updater feature reference](https://docs.rs/tauri-plugin-updater/latest/tauri_plugin_updater/)
and [Tauri artifact formats](https://tauri.app/plugin/updater/#building).
