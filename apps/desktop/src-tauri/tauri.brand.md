# Tauri-native brand injection points

The **webview** (the `@clio/web` frontend) is fully brand-driven at build time via
`GACT_BRAND` (see `apps/branding/README.md`): window title once loaded, splash, connect,
copy, accent, favicon. Nothing CLIO-specific is hardcoded in the SolidJS app.

Tauri's **native** layer, however, reads a static `tauri.conf.json` at compile time.
Tauri does not template these from env vars, so the per-brand values below are injected
by the **packaging build** (e.g. the embedding project's release pipeline) — they are
NOT rewritten by `GACT_BRAND`.

The in-repo base `tauri.conf.json` carries the neutral **GACT** identity. A product
brand (e.g. CLIO) is owned by the embedding project, which supplies its own native
values via a `--config` overlay (and points `GACT_BRAND` / `GACT_BRAND_SRC` at its own
branding dir for the webview half).

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
   GACT_BRAND=<brand> GACT_BRAND_SRC=<project-branding-dir> \
   pnpm --filter @clio/desktop tauri build \
     --config <path-to>/tauri.<brand>.conf.json
   ```

   The overlay also replaces the Tauri `beforeBuildCommand` /
   `beforeDevCommand` with the matching web brand scripts so the webview and native
   shell stay paired. Override `productName`, `identifier`, `app.windows[0].title`,
   the descriptions, and `bundle.icon`.

2. **Per-brand icon set.** Drop the brand's icon PNG/ICO/ICNS into a brand-specific
   `icons/` dir and point `bundle.icon` at it from the overlay. (Tauri requires real
   raster assets here; the SVG mark in `<brand>/logo.svg` is the source to regenerate
   them with `pnpm tauri icon <path-to-1024.png>`.)

## clio-agent build hook (the reference product brand)

clio-agent ships the **CLIO** brand, which it owns in its own `branding/clio/`. Its
release pipeline points `GACT_BRAND_SRC` at that dir and supplies the CLIO native
overlay via `--config`. Its release pipeline runs:

```sh
cd apps
GACT_BRAND=clio GACT_BRAND_SRC=<clio-agent>/branding \
pnpm --filter @clio/desktop tauri:build:bundled --config <clio native overlay>
```

The webview half is selected by `GACT_BRAND` / `GACT_BRAND_SRC`; the native half by
the CLIO overlay. Other distributors point `GACT_BRAND_SRC` + `--config` at their own
branding dir, overlay, and icons as above.
