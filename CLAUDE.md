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
- A file viewer has one download control: its primary action downloads the original
  bytes, and an adjacent Export to… menu offers the renderer's declared alternate
  formats. Choosing an export never changes the primary download. Renderers
  contribute conversions through the shared file-action registry instead of adding
  separate export buttons. Application opening stays separate. A generated surface
  without an original file offers explicit format choices rather than inventing an
  original download.
- File toolbars prioritize reading/source modes, copying and downloading. Secondary
  inspection views, refresh, information, fullscreen and workspace-copy actions
  appear once in More. Do not repeat visible controls in the menu. Menu-based views
  retain selected state, named panels and a clear way back to reading.

Primary gates:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The deprecated Go code has explicit `make test-go` and `make build-tui` targets.
No normal target starts an emulator.
