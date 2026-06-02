# @clio/desktop

Tauri 2 shell that wraps `@clio/web` into native installers.

## Build prerequisites

Rust toolchain (rustup 1.77+) and platform-native toolchain (MSVC on Windows,
Xcode CLI on macOS, build-essential + WebKit on Linux). See the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for the
canonical list.

## Commands

```sh
pnpm install
pnpm --filter @clio/desktop tauri:dev          # dev shell + vite HMR
pnpm --filter @clio/desktop tauri:build:debug  # debug binary, no-bundle (fastest)
pnpm --filter @clio/desktop tauri:build        # production binary + installers
pnpm --filter @clio/desktop test               # Node smoke tests
```

`tauri:build:debug` is what the harness CI exercises — it produces a binary
without bundling installers (which need platform-specific signing certs that
the bootstrap branch doesn't have yet).
