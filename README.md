# Agent Workspace

A product-neutral React and Tauri workspace for agent services that implement
GACT. Product identity and scientific-domain terminology are supplied by the
embedding agent's brand profile; this repository's tracked default is `Agent
Workspace`.

The active product surfaces are at the top level:

- [`web/`](web/) — React 19 workspace, routes, normalized live state, streaming,
  scientific A2UI renderer, accessibility, and browser transport.
- [`desktop/`](desktop/) — Tauri host, native REST/SSE transport, supervisor,
  credentials, SSH/tunnels, updater, and lifecycle integration.
- [`packages/core/`](packages/core/) — DOM-free schemas, transports, repository,
  reducers, selectors, and retained wire clients.
- [`branding/`](branding/) — neutral profile and build-time brand selection.
- [`contract/gact/`](contract/gact/) — independent Go wire types used by remaining
  Go consumers.

The legacy Go TUI is **frozen and unsupported**. It remains under [`tui/`](tui/)
for a future upgrade, but is not a valid way to install, run or verify current
CLIO. Do not use its old binaries or Docker image, including from Claude Code or
other assistants. New releases do not publish TUI payloads. Use Web or Desktop;
CLIO downloads and installation guidance are at **[clio.iowarp.ai](https://clio.iowarp.ai/)**.

## Development

Requirements: Node 22 LTS and pnpm 9.15.9.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The default development address is `http://127.0.0.1:5173`. The connection page
remembers successful endpoints, attempts the last working endpoint on return,
and keeps access-token entry under Advanced settings.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`packages/core/tests/live-clio.test.ts` is an explicit live-environment suite and
is not represented as a skipped unit test. Run it only against an authorized real
service with `pnpm --filter @clio/core test:live`.

The remaining contract and adapter Go modules have a separate gate:

```sh
make test-go
```

No default build or test target starts an emulator.

Legacy TUI source and compatibility tests are retained for future development.
They do not qualify the TUI as a supported product interface.

## Product branding

[`brand.config.json`](brand.config.json) selects the tracked neutral profile.
An embedding product selects its own profile through a gitignored
`brand.config.local.json`; CLIO's assets and landing language, for example, are
owned by `clio-agent/branding/clio`. See [`branding/README.md`](branding/README.md).

## Protocol direction

The new workspace consumes scoped GACT 0.3 events and A2UI 0.9.1. A2UI is a
persistent product surface: an agent may author it through a trusted server tool,
but users receive rendered diagrams, code, plots, tables, evidence, and actions—not
serialized component JSON. CLIO implements A2UI v0.9.1: the official message,
capability, data-model and error schemas, the official Basic catalog plus
plugin-declared catalogs, and catalog functions and checks. Not
supported: A2UI 1.0, inline catalogs, A2A transport, pack-shipped renderer code.
