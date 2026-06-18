# Tauri-native brand injection points

The **webview** (the `@clio/web` frontend) is fully brand-driven at build time via
`GACT_BRAND` (see `apps/branding/README.md`): window title once loaded, splash, connect,
copy, accent, favicon. Nothing CLIO-specific is hardcoded in the SolidJS app.

Tauri's **native** layer, however, reads a static `tauri.conf.json` at compile time.
Tauri does not template these from env vars, so the per-brand values below are injected
by the **packaging build** (e.g. clio-agent's release pipeline) — they are NOT rewritten
by `GACT_BRAND`.

## What is brand-specific in `tauri.conf.json`

| Key                          | CLIO value (base)                       | Why it's native                                    |
| ---------------------------- | --------------------------------------- | -------------------------------------------------- |
| `productName`                | `CLIO Desktop`                          | Installer name, .app/.exe name, Start-menu entry.  |
| `identifier`                 | `ai.iowarp.clio.desktop`                | OS bundle id / single-instance key. Must be stable per brand. |
| `app.windows[0].title`       | `CLIO Desktop`                          | First-paint OS window title (before the webview sets `document.title`). |
| `bundle.shortDescription`    | `CLIO Desktop — …`                      | Installer metadata.                                |
| `bundle.longDescription`     | `CLIO Desktop is …`                     | Installer metadata.                                |
| `bundle.icon`                | `icons/*` (the CLIO app icon)           | OS app icon — a raster asset, not generated at runtime. |

## How to build a brand other than CLIO

Two supported paths:

1. **Config overlay (low-risk, implemented).** Tauri merges any number of `--config`
   files over the base. A per-brand overlay file (e.g. `tauri.gact.conf.json`, shipped
   here for the neutral profile) overrides only the brand-specific keys:

   ```sh
   cd apps
   pnpm --filter @clio/desktop tauri build \
     --config src-tauri/tauri.gact.conf.json
   ```

   The overlay also replaces the Tauri `beforeBuildCommand` /
   `beforeDevCommand` with the matching web brand scripts
   (`build:gact` / `dev:gact`), so the webview and native shell stay paired.
   Add `tauri.<brand>.conf.json` next to this file for a new brand, overriding
   `productName`, `identifier`, `app.windows[0].title`, the descriptions, and
   `bundle.icon`.

2. **Per-brand icon set.** Drop the brand's icon PNG/ICO/ICNS into a brand-specific
   `icons/` dir and point `bundle.icon` at it from the overlay. (Tauri requires real
   raster assets here; the SVG mark in `apps/branding/<brand>/logo.svg` is the source
   to regenerate them with `pnpm tauri icon <path-to-1024.png>`.)

## clio-agent build hook (the reference brand)

clio-agent ships the **CLIO** brand, which is the base `tauri.conf.json` as-is — no
overlay needed. Its release pipeline runs:

```sh
cd apps
pnpm --filter @clio/desktop tauri:build:bundled
```

The base Tauri config invokes `pnpm --filter @clio/web build:clio`, keeping the
webview on the CLIO profile; the native config is already CLIO. No further
injection is required for CLIO. Other distributors point `--config` at their own
overlay + icons as above.
