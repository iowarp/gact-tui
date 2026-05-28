# @clio/web

Pure-browser CLIO frontend. Talks GACT v0.2 directly to any reachable backend
(typically `clio-agent` or the `gact-tui` emulator).

## Dev

```sh
pnpm install
pnpm --filter @clio/web dev          # vite dev server on :5173
pnpm --filter @clio/web build        # static dist/
pnpm --filter @clio/web preview      # serve dist/ on :4173
pnpm --filter @clio/web test         # unit tests (vitest)
pnpm --filter @clio/web test:visual  # playwright + screenshots/
```

## Visual proofs

`pnpm test:visual` builds the app, serves it locally, navigates the Playwright
runner across the fixture routes, and writes PNGs to `screenshots/`. Add a row
to `tests/visual/screenshots.spec.ts` whenever you ship UI worth proving.

Fixture URLs:

- `/` — connect screen
- `/?route=chat&fixture=normal` — default chat shell
- `/?route=chat&fixture=streaming` — mid-stream assistant turn
- `/?route=chat&fixture=permission` — inline permission approval
- `/?route=chat&fixture=verbose` — verbose density (tool bodies expanded)
- `/?route=chat&fixture=summary` — summary density (tool noise hidden)
- `/?route=chat&fixture=empty-sidebar` — empty-state sidebar
