# Product branding

GACT supplies a product-neutral workspace. The embedding agent supplies the
product identity and scientific-domain language:

```text
GACT workspace + agent service + product brand = product
```

The tracked [`brand.config.json`](../brand.config.json) selects the neutral
`branding/gact` profile. A gitignored `brand.config.local.json` beside it may
select a profile owned by another repository:

```json
{
  "profile": "clio",
  "brandingRoot": "../clio-agent/branding"
}
```

`brandingRoot` is resolved relative to the config file unless it is absolute.
Selection happens at build time; it is not an environment-variable theme toggle.

## Web brand fields

Only `name` is required. The workspace currently consumes:

| Field | Purpose |
| --- | --- |
| `name` | Document title, accessible product name, and product-facing copy |
| `wordmark` | Short chrome label; defaults to `name` |
| `tagline`, `taglineAccent` | Optional short product phrases |
| `homeUrl`, `taglineAccentUrl` | Optional product links |
| `markGlyph` | One-character fallback when no logo exists |
| `logoSvg` | SVG asset path relative to the profile directory; inlined at build time |
| `logoImage` | Raster asset path relative to the profile directory; inlined as a data URL |
| `accent` | Product action accent |
| `themeTokens` | CSS custom-property overrides applied at boot |
| `landing.eyebrow` | Short domain/product category on the connection screen |
| `landing.headline` | Primary product promise on the connection screen |
| `landing.description` | Supporting product description on the connection screen |

The landing fields are deliberately product-owned. Transport versions, replay
cursors, process topology, and similar implementation details do not belong in
them.

The Vite plugin exposes a typed virtual `@brand` module. Application components
must read product identity from that module rather than hard-code CLIO or any
other embedding product.

## Build examples

```sh
pnpm --dir web build
pnpm --dir web dev
```

Both commands resolve `brand.config.local.json` first when it exists. The desktop
webview bundles the same branded web build. Native desktop packaging fields and
managed-service configuration are documented in [`INTEGRATION.md`](./INTEGRATION.md).
