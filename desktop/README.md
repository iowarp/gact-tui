# @clio/desktop

Tauri 2 shell that wraps `@clio/web` into native installers.

## Build prerequisites

Rust toolchain (rustup 1.77+) and platform-native toolchain (MSVC on Windows,
Xcode CLI on macOS, build-essential + WebKit on Linux). See the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for the
canonical list.

On Ubuntu/WSL the debug build needs the same native packages used by CI:

```sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libsoup-3.0-dev \
  librsvg2-dev \
  libayatana-appindicator3-dev \
  libdbus-1-dev \
  patchelf
```

If the build fails with missing `gdk-3.0.pc` or `pango.pc`, the WebKit/GTK
development packages above are not installed or `PKG_CONFIG_PATH` does not
include their `.pc` files.

## Commands

Run filtered commands from the repository root, or run the package-local
scripts from `desktop`.

```sh
pnpm install
pnpm --filter @clio/desktop tauri:dev          # dev shell + vite HMR
pnpm --filter @clio/desktop tauri:build:debug  # debug binary, no-bundle (fastest)
pnpm --filter @clio/desktop tauri:build        # production binary + installers
pnpm --filter @clio/desktop test               # Node smoke tests
pnpm --filter @clio/desktop test:webview       # gated real WebView proof
```

```sh
cd desktop
pnpm tauri:build:debug
pnpm test
```

`tauri:build:debug` is what the harness CI exercises — it produces a binary
without bundling installers (which need platform-specific signing certs that
the bootstrap branch doesn't have yet).

## Native WebView proof

The deterministic Playwright screenshots prove the shared web frontend. Native
desktop release proof also needs the real Tauri WebView, Rust HTTP/SSE bridge,
native menu/window chrome, and sidecar supervisor path.

Build the debug desktop app first:

```sh
cd desktop
pnpm tauri:build:debug
```

Then run the gated WebView test against a live CLIO/GACT backend on `:17800`:

```sh
cargo install tauri-driver
TAURI_E2E=1 pnpm test:webview
```

When another real CLIO is already bound to `:17800`, use chat-only mode to
capture the native shell without sending the permission-triggering prompt:

```sh
TAURI_E2E=1 TAURI_E2E_CHAT_ONLY=1 pnpm test:webview
```

Useful overrides:

```sh
CLIO_DESKTOP_APP=/path/to/clio-desktop{.exe}
TAURI_DRIVER=/path/to/tauri-driver{.exe}
TAURI_NATIVE_DRIVER=/path/to/msedgedriver.exe
CLIO_DESKTOP_SCREENSHOT_DIR=/path/to/screenshots
```

The test writes:

- `desktop-webview-chat.png`: native shell loaded into the chat surface.
- `desktop-webview-permission.png`: permission request delivered through the
  real Tauri bridge and rendered in the WebView.

Issue #186 tracks the broader manual release proof still needed for desktop:
splash/connect/chat, session switching, streaming/freshness, file-open
affordances, and platform-specific styling across the native shell.

The workspace workflow builds Windows and Linux debug applications. Native
WebView acceptance remains a real-service gate: fixtures and retired local
servers are not substitutes for an authenticated CLIO run.
