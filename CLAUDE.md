# Repository guidance

The primary product is the top-level React/Tauri workspace:

- `web/` — React application and scientific A2UI renderer.
- `desktop/` — Tauri host and native transport.
- `packages/core/` — shared schemas, normalized state, and transport contracts.
- `branding/` — product-neutral build-time brand selection.

`tui/` is deprecated compatibility code. The reference emulator and both old web
trees were removed; do not recreate, build, or request them as development
dependencies.

Use real CLIO sessions for semantic acceptance. Flat-NDP and the working SPOTTER
campaign are the canonical dense scientific references; incomplete probes,
smokes, and artifact-proof experiments are not UX fixtures.

User-facing rules:

- Never encode status only as a dot, color, pulse, or unexplained icon.
- Workspace names are primary; full paths are supplemental details.
- Product name, landing copy, logo, and domain terminology come from the selected
  embedding-agent brand.
- Do not expose transport versions, cursors, process topology, or “sidecar” as
  primary product copy.
- A2UI renders trusted diagrams, code, plots, tables, evidence, and actions. JSON
  payloads and producer tool identifiers are technical detail, not the result.
- Stream updates at display-frame cadence and honor reduced motion.

Primary gates:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The deprecated Go code has explicit `make test-go` and `make build-tui` targets.
No normal target starts an emulator.
