# Tauri-native brand injection points

The **webview** (the `@clio/web` frontend) is fully brand-driven at compile time by
the **brand config file** (`apps/brand.config.json`, or a `brand.config.local.json`
override — see `apps/branding/README.md`): window title once loaded, splash, connect,
copy, accent, favicon. Nothing CLIO-specific is hardcoded in the SolidJS app. The
brand is selected by the config file, NOT an env var.

Tauri's **native** layer, however, reads a static `tauri.conf.json` at compile time.
Tauri does not template these from the brand config file, so the per-brand values
below are injected by the **packaging build** (e.g. the embedding project's release
pipeline) via a `--config` overlay.

The in-repo base `tauri.conf.json` carries the neutral **GACT** identity. A product
brand (e.g. CLIO) is owned by the embedding project, which supplies its own native
values via a `--config` overlay and selects the webview/backend brand by dropping a
`brand.config.local.json` whose `brandingRoot` points at its own `branding/` dir.

## What is brand-specific in `tauri.conf.json`

| Key                          | GACT value (base)                       | Why it's native                                    |
| ---------------------------- | --------------------------------------- | -------------------------------------------------- |
| `productName`                | `GACT Desktop`                          | Installer name, .app/.exe name, Start-menu entry.  |
| `identifier`                 | `ai.iowarp.gact.desktop`                | OS bundle id / single-instance key. Must be stable per brand. |
| `app.windows[0].title`       | `GACT Desktop`                          | First-paint OS window title (before the webview sets `document.title`). |
| `bundle.shortDescription`    | `GACT Desktop — …`                      | Installer metadata.                                |
| `bundle.longDescription`     | `GACT Desktop is …`                     | Installer metadata.                                |
| `bundle.icon`                | `icons/*` (the neutral app icon)        | OS app icon — a raster asset, not generated at runtime. |

## How to build a product brand (e.g. CLIO)

The in-repo base `tauri.conf.json` IS the neutral GACT brand (no overlay needed to
build GACT). A product brand is owned by the embedding project; build it via:

1. **Config overlay (low-risk).** Tauri merges any number of `--config` files over the
   base. The embedding project keeps a per-brand overlay (e.g.
   `tauri.<brand>.conf.json`) that overrides only the brand-specific keys:

   ```sh
   cd apps
   # Select the webview/backend brand by dropping apps/brand.config.local.json
   # ({ "profile": "<brand>", "brandingRoot": "<project-branding-dir>" }), then:
   pnpm --filter @clio/desktop tauri build \
     --config <path-to>/tauri.<brand>.conf.json
   ```

   The native `beforeBuildCommand` / `beforeDevCommand` already read the brand config
   file (the plain web build/dev + `gen-brand-backend.mjs`), so the webview, backend
   descriptor, and native shell all resolve the same brand without per-brand scripts.
   The overlay overrides the native-only keys: `productName`, `identifier`,
   `app.windows[0].title`, the descriptions, and `bundle.icon`.

2. **Per-brand icon set.** Drop the brand's icon PNG/ICO/ICNS into a brand-specific
   `icons/` dir and point `bundle.icon` at it from the overlay. (Tauri requires real
   raster assets here; the SVG mark in `<brand>/logo.svg` is the source to regenerate
   them with `pnpm tauri icon <path-to-1024.png>`.)

## clio-agent build hook (the reference product brand)

clio-agent ships the **CLIO** brand, which it owns in its own `branding/clio/`. Its
release pipeline drops an `apps/brand.config.local.json` pointing `brandingRoot` at
that dir and supplies the CLIO native overlay via `--config`. Its release pipeline
runs:

```sh
cd apps
# apps/brand.config.local.json:
#   { "profile": "clio", "brandingRoot": "<clio-agent>/branding" }
pnpm --filter @clio/desktop tauri:build:bundled --config <clio native overlay>
```

The webview + backend halves are selected by the `brand.config.local.json`; the
native half by the CLIO overlay. Other distributors drop their own
`brand.config.local.json` (with an absolute `brandingRoot`) + `--config` overlay and
icons as above.
