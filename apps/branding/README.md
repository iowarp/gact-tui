# Brand profiles

GACT's web + desktop frontends are **brand-neutral by default**. A brand profile
supplies the product name, wordmark, tagline, mark/logo, and theme tokens that are
injected at **build time** via the `GACT_BRAND` environment variable.

```sh
GACT_BRAND=gact  pnpm --filter @clio/web build   # neutral default
GACT_BRAND=clio  pnpm --filter @clio/web build   # CLIO reference brand
```

`GACT_BRAND` defaults to `gact` when unset. The build reads
`apps/branding/<profile>/brand.json` (plus any referenced asset files) and exposes a
typed `brand` object through the virtual module `@brand` (see
`apps/web/vite-plugin-brand.ts`). The app imports `brand` and routes every
user-facing product name / mark / accent through it.

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

The resolved `brand` object always carries `name`, `wordmark`, `tagline`, `markGlyph`,
`accent`, `themeTokens`, and `logoSvg` (the inlined SVG source string, or `null`).

## Profiles shipped

- `gact/` — neutral default: name "GACT", blue accent `#5b8def`, mark glyph "G".
- `clio/` — the reference CLIO brand: name "CLIO", orange accent `#ea7b2a`, mark glyph "C",
  tagline "Your local AI coding & data agent".

## Adding a profile

1. Create `apps/branding/<id>/brand.json`.
2. (Optional) Drop `logo.svg` next to it and set `"logoSvg": "logo.svg"`.
3. Build with `GACT_BRAND=<id>`.

## Desktop (Tauri-native) injection points

The webview is fully driven by `brand`. Tauri-native static config is NOT auto-rewritten
by `GACT_BRAND` — these are the per-brand injection points the packaging build (e.g.
clio-agent's release pipeline) must set. See
`apps/desktop/src-tauri/tauri.brand.md` for the documented hook.
