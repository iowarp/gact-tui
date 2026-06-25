# Brand profiles

GACT's web + desktop frontends are **brand-neutral by default**. A brand profile
supplies the product name, wordmark, tagline, mark/logo, and theme tokens that are
injected at **build time** via the `GACT_BRAND` environment variable.

```sh
cd apps/web
pnpm build:gact   # the in-repo neutral default
```

From the `apps/` workspace root, the equivalent filtered command is
`pnpm --filter @clio/web build:gact`.

`GACT_BRAND` defaults to `gact` when unset. The build reads
`apps/branding/<profile>/brand.json` (plus any referenced asset files) and exposes a
typed `brand` object through the virtual module `@brand` (see
`apps/web/vite-plugin-brand.ts`). The app imports `brand` and routes every
user-facing product name / mark / accent through it.

## Product brands live in the embedding project

gact-tui ships **only** the neutral `gact` brand. A product brand (e.g. CLIO) is
owned by the agentic system that embeds gact-tui (`clio-agent` owns the full CLIO
brand in its own `branding/clio/brand.json`). A project compiles gact-tui from its
own branding dir by setting:

```sh
GACT_BRAND=<id>          # the profile id to build
GACT_BRAND_SRC=<dir>     # the project's branding/ dir (default: apps/branding)
```

See `apps/web/vite-plugin.brand` wiring in `apps/web/vite.config.ts` and the
desktop equivalent in `apps/desktop/scripts/gen-brand-backend.mjs`.

## `brand.json` schema

| Field         | Type                  | Required | Meaning                                                                                  |
| ------------- | --------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `name`        | string                | yes      | Product name → window title, copy ("Welcome to <name>", "<name> Desktop").                |
| `wordmark`    | string                | no       | Text wordmark in the chrome lockups. Defaults to `name`.                                  |
| `tagline`     | string                | no       | One-line product description (connect-screen lede).                                       |
| `markGlyph`   | string (1 char)       | no       | Single-character fallback mark when no `logoSvg`. Defaults to first char of `name`.       |
| `logoSvg`     | string (path)         | no       | Path (relative to the profile dir) to an SVG. Overrides `markGlyph` if present.           |
| `accent`      | string (CSS color)    | no       | Primary accent token. Defaults to the design-system default if omitted.                   |
| `themeTokens` | record<string,string> | no       | Extra CSS custom-property overrides, merged into the default theme at boot.               |
| `starterPrompts` | array<{eyebrow,label}> | no   | First-run chat prompt cards tuned for the product/domain. Defaults to neutral GACT prompts. |

The resolved `brand` object always carries `name`, `wordmark`, `tagline`, `markGlyph`,
`accent`, `themeTokens`, `starterPrompts`, `backendRepository`, `backend`, and `logoSvg`
(the inlined SVG source string, or `null`).

### Optional `backend` block

A profile MAY include a `backend` block to describe a managed backend (sidecar name,
install URLs, ports). **A profile that omits `backend` resolves to connect-mode**: the
shell attaches to an already-running backend on `attachPort` (default `17800`,
overridable via `GACT_PORT` / `GACT_URL`) and never offers an installer. The neutral
`gact` profile omits `backend`, so the in-repo default makes no managed-agent
assumption. Product brands that ship a managed backend (e.g. CLIO) supply an explicit
`backend` block in their own brand file.

## Profiles shipped

- `gact/` — the only in-repo profile; neutral default: name "GACT", blue accent
  `#5b8def`, mark glyph "G", connect-mode backend.

Product brands (e.g. CLIO) are NOT shipped here — they are owned by the embedding
project and supplied via `GACT_BRAND` + `GACT_BRAND_SRC` (see above).

## Adding a profile

1. Create `apps/branding/<id>/brand.json`.
2. (Optional) Drop `logo.svg` next to it and set `"logoSvg": "logo.svg"`.
3. Add package scripts that call `node scripts/with-brand.mjs <id> build` and
   `node scripts/with-brand.mjs <id> dev`, or call that helper directly.

## Desktop (Tauri-native) injection points

The webview is fully driven by `brand`. Tauri-native static config is NOT auto-rewritten
by `GACT_BRAND` — these are the per-brand injection points the packaging build (e.g.
clio-agent's release pipeline) must set. See
`apps/desktop/src-tauri/tauri.brand.md` for the documented hook.
