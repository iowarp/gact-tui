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

## Demo recording

With a CLIO backend and the web preview/dev server already running, record a
real web UI session:

```sh
pnpm --filter @clio/web demo:record -- \
  --backend-url http://localhost:17800 \
  --web-url http://localhost:4173 \
  --provider claude_code \
  --model haiku \
  --blueprint earthscope-gnss-region \
  --query "Find the nearest EarthScope GNSS station to Los Angeles, stage its time-series CSV, profile it, and create a displacement time-series plot." \
  --out screenshots/demo-earthscope
```

The recorder drives the normal web interface, records `demo.webm`, converts it
to `demo.mp4` when `ffmpeg` is available, and saves HTML/API evidence
(`messages.json`, `*.transcript-core.html`, `autoscroll.json`, `summary.json`).
It fails if the transcript is no longer pinned to the bottom while streaming
and the user has not intentionally scrolled away.

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
