# First-run lifecycle

What happens between "double-click the icon" and "chat shell visible".

## Timeline (≤ 8 seconds on a warm machine)

| Phase                              | Owner                | Typical |
|------------------------------------|----------------------|---------|
| 0. Tauri shell warms up             | Rust + WebView2      | 100 ms |
| 1. Allocate free localhost port     | Rust supervisor      | < 1 ms |
| 2. Generate 32-byte bearer token    | `rand::thread_rng`   | < 1 ms |
| 3. Spawn `clio-agent-<triple>` launcher | `std::process::Command` | 10 ms |
| 4. Launcher resolves `clio-agent-gact`  | Go binary            | 5 ms |
| 5. `clio-agent-gact` (Python) imports + FastAPI startup | uvicorn       | 1.5 – 5 s |
| 6. Supervisor polls `/v1/capabilities` until 200 | `ureq`        | varies |
| 7. Splash transitions to chat shell | SolidJS              | < 50 ms |

The user sees the splash with "Booting the bundled clio-agent…" for
the duration of phase 5 — long enough for the spinner to make sense,
short enough that nobody clicks away. If the splash sits past 30 s
the supervisor reports the failure as an actionable error card.

## What the user sees

1. **Splash** — animated wordmark + three-dot spinner + hint text.
   While the sidecar is starting the body class is `splash starting`;
   if anything fails the body class flips to `splash error` and a
   recoverable card appears with the upstream install command.
2. **Chat shell** — sidebar (sessions), transcript pane, composer.
   First-time users see the empty-sidebar affordance; existing
   sessions hydrate from the sidecar's `/v1/sessions`.

## What lives where on disk

| Item                                    | Where                                                                                  |
|-----------------------------------------|----------------------------------------------------------------------------------------|
| Tauri shell executable                  | OS-conventional install prefix (Win: `%LOCALAPPDATA%\Programs\CLIO Desktop\`; macOS: `/Applications/CLIO Desktop.app`; Linux: distro-managed) |
| Launcher binary (per triple)            | Bundled next to the executable, named `clio-agent-<triple>{.exe}`                       |
| `clio-agent-gact` server (Python)       | `~/.local/share/clio/clio-agent/.venv/` on Linux + macOS; `%LOCALAPPDATA%\clio\clio-agent\.venv\` on Windows |
| Frontend registry (multiple backends)   | Browser `localStorage` key `clio.backends.v1`                                          |
| SSH passphrases                         | OS keychain — Windows Credential Manager / macOS Keychain / Linux secret-service-or-kwallet, service `ai.iowarp.clio.desktop.ssh`, account `user@host` |
| Sidecar logs                            | stdout/stderr of the Tauri parent process; visible if launched from a terminal         |

The frontend itself stores **no** bearer tokens for the bundled
sidecar — they live in RAM only, are freshly generated each launch,
and never touch disk. Remote backends added via the connect form do
persist their bearer tokens in `localStorage` (web) and will move to
the OS keychain in v1.0.

## Sidecar lifecycle invariants

The Rust supervisor owns the sidecar child. Two guarantees hold:

1. **No orphans.** The Tauri shell registers a `WindowEvent::Destroyed`
   hook that sends `kill` to the child, waits up to 3 seconds for the
   process tree to exit, then force-kills. SSH tunnels are reaped the
   same way.
2. **Deterministic restart.** Re-launching the app picks a fresh port
   + fresh token. The previous sidecar's child died with the old
   process, so there is never a "two sidecars on one port" race.

## When the sidecar isn't where the launcher expects

The launcher's resolution order:

1. `$CLIO_AGENT_GACT_BIN` if set + executable
2. `clio-agent-gact` on `$PATH`
3. Per-OS install-prefix conventions (see "Where things live" above)

If none of those resolve, the Splash error card surfaces a copy-
paste install command:

```sh
# Linux / macOS
CLIO_REF=develop curl -fsSL https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh | bash

# Windows
$env:CLIO_REF = 'develop'
irm https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1 | iex
```

Re-launching the app after the install completes restarts the supervisor cleanly.

## Multiple instances

You can run several copies of CLIO Desktop at once — each picks its
own free port + fresh token. There is no shared state between
instances; the registry lives per-browser-storage scope (per-OS-user
per-machine for desktop, per-tab for pure-web).
