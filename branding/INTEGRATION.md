# Embedding a branded agent product

The product repository owns its logo, name, landing copy, theme tokens, and
domain terminology. This repository owns the generic workspace and transport.

## Web and desktop webview

1. Add `branding/<profile>/brand.json` and its referenced assets to the embedding
   agent repository.
2. Add a gitignored `brand.config.local.json` to this checkout, selecting that
   profile and branding root.
3. Run `pnpm --dir web build` or `pnpm --dir web dev`.
4. Verify the logo, document title, landing promise, action accent, and product
   name in user-facing error and composer copy.

The build fails when a selected profile or referenced asset is missing. Product
assets are read from their owning repository; they are not copied into GACT.

## Native desktop identity

The desktop build has two additional compile-time seams:

- `desktop/scripts/gen-brand-backend.mjs` reads the same brand selection and
  writes `desktop/src-tauri/gen/brand-backend.json` for the Rust supervisor.
- Tauri package identity—`productName`, application identifier, icons, updater,
  and external binaries—comes from the selected Tauri configuration passed to
  the build.

An embedding product may include a `backend` block for the desktop generator.
Omitting it means attach-only operation; the workspace connects to an existing
agent endpoint and does not claim it can install or start one. A managed product
must provide its executable identity, attach address, and installer coordinates
explicitly.

## Product boundary

- The GACT default must remain usable as `Agent Workspace`, not CLIO.
- CLIO-specific terms and claims live in `clio-agent/branding/clio`.
- A domain branch may replace product copy and theme without changing wire
  semantics.
- Technical details remain available in diagnostics and advanced settings, not
  as the primary landing message.
- Branding never changes authorization, capabilities, protocol negotiation, or
  server truth.
