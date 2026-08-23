# `apps/desktop/src-tauri/binaries/` — sidecar launcher artefacts

This directory holds the per-triple **launcher** binaries that Tauri
ships under `bundle.externalBin`. They are *not* the `clio-agent-gact`
server itself — they are a thin Go wrapper that resolves a
real-on-disk `clio-agent-gact` at runtime and execs it with the
bind args + bearer token the Tauri shell passes in.

## Layout

The Tauri externalBin pattern requires one file per target triple
named `<basename>-<triple>{.exe}` where `<basename>` matches the
`externalBin` entry in `tauri.conf.json`. Here that is:

| Triple                       | File                                          |
| ---------------------------- | --------------------------------------------- |
| `x86_64-pc-windows-msvc`     | `clio-agent-x86_64-pc-windows-msvc.exe`       |
| `aarch64-apple-darwin`       | `clio-agent-aarch64-apple-darwin`             |
| `x86_64-apple-darwin`        | `clio-agent-x86_64-apple-darwin`              |
| `x86_64-unknown-linux-gnu`   | `clio-agent-x86_64-unknown-linux-gnu`         |

The binaries are **generated**, not checked in. CI and local builds
regenerate them via:

```sh
# Linux / macOS / Git-Bash on Windows
apps/desktop/scripts/fetch-sidecar.sh           # host triple
apps/desktop/scripts/fetch-sidecar.sh --all     # every release triple

# Windows PowerShell
pwsh apps/desktop/scripts/fetch-sidecar.ps1
pwsh apps/desktop/scripts/fetch-sidecar.ps1 -All
```

The script also writes `../sidecar.lock` recording which on-disk
`clio-agent-gact` resolved on the build host.

## Source

The launcher source lives at `apps/desktop/sidecar-launcher/`. It is a
single-file Go program (`main.go`) outside the `go.work` workspace
on purpose — it must not pull in `tui/` or `emulator/` deps. Build
locally with:

```sh
cd apps/desktop/sidecar-launcher
GOWORK=off go build -o ../src-tauri/binaries/clio-agent-<triple>{.exe} .
```

## Why the indirection

`clio-agent-gact` is a Python entry point shipped by
[`iowarp/clio-agent`](https://github.com/iowarp/clio-agent) on the
`develop` branch. We can't bundle a Python interpreter + every native
dep (h5py, pyarrow, …) into a single binary cheaply, so the launcher
expects a real `clio-agent-gact` to be reachable on the user's
machine (matching the upstream `clio` installer's pattern), and execs
it. If it isn't found, the launcher exits with a clear error message
that the Tauri shell surfaces as a Splash-screen card pointing at the
install command.
