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

The Go TUI remains under [`tui/`](tui/) for compatibility but is deprecated and
is not the primary product. The old web applications and reference emulator have
been removed.

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

The remaining contract and adapter Go modules have a separate gate. The
deprecated TUI may still be built explicitly:

```sh
make test-go
make build-tui
```

No default build or test target starts an emulator.

## Product branding

[`brand.config.json`](brand.config.json) selects the tracked neutral profile.
An embedding product selects its own profile through a gitignored
`brand.config.local.json`; CLIO's assets and landing language, for example, are
owned by `clio-agent/branding/clio`. See [`branding/README.md`](branding/README.md).

## Protocol direction

The new workspace consumes scoped GACT 0.3 events and A2UI 0.9.1. A2UI is a
persistent product surface: an agent may author it through a trusted server tool,
but users receive rendered diagrams, code, plots, tables, evidence, and actions—not
serialized component JSON.
