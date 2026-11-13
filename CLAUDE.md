# Repository guidance

The primary product is the top-level React/Tauri workspace:

- `web/` — React application and scientific A2UI renderer.
- `desktop/` — Tauri host and native transport.
- `packages/core/` — shared schemas, normalized state, and transport contracts.
- `branding/` — product-neutral build-time brand selection.

`tui/` is frozen, unsupported compatibility code retained for a future upgrade.
Do not run it, recommend its binaries/images, or use it for current CLIO
installation or verification. Use Web or Desktop. New releases do not publish
TUI payloads. The reference emulator and both old web
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

## Interface languages

Interface copy is translated. Write it in English inside the Lingui macros
(`t`, `plural`, `<Trans>`) as [docs/i18n.md](docs/i18n.md) describes, run
`pnpm --filter @clio/workspace i18n:extract`, and commit the catalogs with the
change. `node scripts/check_unlocalized_copy.mjs` (in `pnpm lint`) fails on new
bare copy. Agent output, tool payloads and text sent to the agent stay as they
are.

## Adding or changing tools

Read [the tool authoring steps](docs/tool-result-presentation.md#adding-or-changing-a-tool)
before adding a tool, changing its inputs/results or changing its display.
Presentation is part of the feature: one compact action/target row; expansion
shows the actual request, returned content or change. Raw JSON stays in
Technical details. Do not add repeated status prose or decorative dot/em-dash
separators.

Declare semantics once in `tool-operation-contract.ts` or the owning producer
adapter and reuse the shared readers. Include representative large-data input
and output showcases in the production-component review fixtures and browser
checks. Inspect both chat and Evidence at desktop and phone widths. Verify
applicable running, empty, partial, failed and interrupted outcomes. Synthetic
presentation checks do not establish a native agent's semantic success.

Primary gates:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The deprecated Go code has explicit `make test-go` and `make build-tui` targets.
No normal target starts an emulator.
