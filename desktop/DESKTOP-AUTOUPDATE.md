# Desktop auto-update (Tauri 2)

The CLIO/GACT desktop shell ships with the [`tauri-plugin-updater`][plugin]
auto-updater. On launch it asks a signed `latest.json` marker on the project's
GitHub releases whether a newer build exists; if one does it surfaces a toast,
and on the user's confirmation it downloads + signature-verifies + installs the
new bundle and relaunches into it.

This document covers the parts that are NOT in the repo: the signing keypair and
the release CI that builds, signs, and publishes `latest.json`. The client
plumbing (plugin registration, config, capability, and the launch check) is
already wired — see "What's wired in the repo" below.

> The `pubkey` field in every `tauri.conf.json` variant is currently the
> literal placeholder `PLACEHOLDER_REPLACE_VIA_TAURI_SIGNER_GENERATE`. Auto-
> update will refuse every update until it is replaced with a real public key.
> **No private key is, or should ever be, committed to this repo.**

## 1. Generate the signing keypair (one time, by a maintainer)

Tauri signs every update artifact with a minisign keypair. Generate it locally:

```sh
# From apps/desktop (any dir works; the CLI is the tauri CLI).
pnpm --filter @clio/desktop tauri signer generate -w ~/.tauri/clio-updater.key
```

This prints (and writes) two things:

- a **private key** (the `*.key` file) and the **password** you set — these are
  SECRETS. They never enter the repo. They go into CI as encrypted secrets.
- a **public key** (a single base64 line) — this is NOT secret. It goes into the
  `plugins.updater.pubkey` field of every `tauri.conf.json` variant.

### Install the public key

Replace the placeholder in all three config variants (they are kept consistent):

- `src-tauri/tauri.conf.json`        (CLIO brand — the base config)
- `src-tauri/tauri.gact.conf.json`   (neutral GACT brand overlay)
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

`.github/workflows/desktop-release.yml` (sketch):

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
          - { platform: macos-latest,   args: '--target universal-apple-darwin' }
          - { platform: ubuntu-22.04,   args: '' }
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
          projectPath: apps/desktop
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
    "darwin-aarch64": { "signature": "<minisign sig>", "url": "https://github.com/iowarp/gact-tui/releases/download/v0.8.0/CLIO.app.tar.gz" },
    "linux-x86_64":   { "signature": "<minisign sig>", "url": "https://github.com/iowarp/gact-tui/releases/download/v0.8.0/clio_0.8.0_amd64.AppImage" },
    "windows-x86_64": { "signature": "<minisign sig>", "url": "https://github.com/iowarp/gact-tui/releases/download/v0.8.0/CLIO_0.8.0_x64-setup.nsis.zip" }
  }
}
```

The updater downloads the artifact for the running platform, verifies its
`signature` against the configured `pubkey`, and installs it. A mismatch (wrong
key, tampered artifact) is rejected — this is why the placeholder key blocks all
updates until replaced.

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
- **Frontend** — `apps/web/src/tauri_update.ts` wraps
  `@tauri-apps/plugin-updater`'s `check()` / `downloadAndInstall()` and
  `@tauri-apps/plugin-process`'s `relaunch()`. Everything is gated behind
  `inTauri()`, so the pure-web build never imports the plugins and stays
  browser-safe.
- **Launch hook** — `apps/web/src/App.tsx` (`UpdateNotifier`) calls
  `checkForDesktopUpdate()` once on launch when running inside Tauri. If an
  update is available it raises a persistent toast with an **Install** action
  that runs `downloadAndInstall()` then `relaunchApp()`. This is separate from
  the web SPA "a new build was deployed — refresh" flow (`updateCheck.ts`),
  which swaps a hashed JS bundle rather than a native binary.

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
