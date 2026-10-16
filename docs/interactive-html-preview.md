# Interactive HTML previews

Opening a generated HTML artifact runs its JavaScript in a separate frame. Static
HTML is sanitized before a fixed, nonce-authorized sizing/theme script is added;
authored scripts remain excluded from static content. The Source tab always shows the
original file. Stop removes the running frame; Restart creates a fresh instance.
In file and resource viewers, Stop and Restart join the existing Preview/Source
toolbar. Standalone previews keep their own controls.

Previews grow and shrink with their content, including expanded controls, image
loads, font loads and updated file content. Scrolling belongs to the containing
viewer. Full-viewport documents keep their authored layout. Layout messages are
accepted only from the matching frame and random channel; heights are bounded at
50,000px, with ordinary scrolling retained for exceptionally large documents.

HTML and SVG can use CLIO's `--background`, `--foreground`, `--primary`, `--muted`,
`--muted-foreground`, `--border`, `--radius`, `--font-sans`, `--font-mono`, role and
chart color tokens. Basic HTML controls receive theme defaults. Existing explicit
author styles take precedence. Switching themes sends the new values into the
running frame and preserves inputs, controls and simulations; it does not reload
the document. Canvas renderers can listen for `clio:theme-change` and repaint.
SVG image previews and existing inline Image surfaces receive the same tokens in
a display copy, preserving viewer zoom and inline fullscreen state.
Original file bytes, source, downloads and provenance are unchanged. Hard-coded
author colors are retained; use tokens or `currentColor` for adaptive visuals.

This extends the existing HTML/SVG viewers. It does not add another widget tool,
chat-message protocol, hidden prompt bridge or automatic placement rule.

WebGL works in this frame. Three.js 0.180.0 and OrbitControls are supplied offline:

```html
<script type="module">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  // Create a canvas, renderer, camera and scene as in an ordinary web page.
</script>
```

Classic scripts may also use `THREE`. Additional Three.js addons resolve against
the same pinned version on jsDelivr. Scripts from jsDelivr, unpkg and cdnjs are
allowed, so those libraries need network access unless bundled into the file.
Model authors should prefer the supplied offline imports for portable scenes.

The frame has scripts enabled and a separate opaque origin. It has no same-origin
permission. Its policy blocks fetch/WebSocket connections, nested frames, forms
and embedded objects. On Desktop it loads a stateless backend bootstrap document
before receiving the preview over postMessage; this avoids inheriting the app's
script policy. The main app keeps `script-src 'self'`. The bootstrap route serves
constant HTML only and exposes no files or API actions.

These boundaries are practical browser containment. Removing an iframe is not a
guaranteed process-level kill switch, and this policy is not a complete network
firewall. The browser acceptance checks exercise real WebGL pixels, OrbitControls,
a slider, Stop/Restart, offline loading and the actual Desktop parent CSP.

# Goal and model loading feedback

The retained goal `judging` phase shows **Checking goal completion** with an
elapsed timer in the conversation and Work view. Semantic goal events invalidate
the shared work query immediately; the normal poll remains a recovery path.
Reduced-motion mode uses a plain status label.

The model picker paints provider rows before preparing large model lists. It
prepares the selected provider first, then remaining providers in background
frames. Prepared facts are cached for reopening, and startup queries warm the
provider catalog and selected model list. Refreshing does not clear the current
query or filters.

# Inline math in Markdown

Conversation text, Markdown files and artifact documents render `$...$` as inline
math and `$$...$$` as display math. The existing `\(...\)` and `\[...\]`
delimiters also work. Single-dollar delimiters touch the formula without padding
spaces; a closing dollar cannot be followed by a digit, so prices such as
`$20 and $30` and `$20–$30` stay plain text. Backticks and escaped dollars remain
literal. Source views keep the original LaTeX.

For browser acceptance, start the owned Vite development server on port 5198 and
the real backend renderer on port 8198, set `CLIO_REVIEW_EVIDENCE` to an owned
output directory, then run:

```powershell
pnpm --filter @clio/workspace exec playwright test -c tests/review/webgl-playwright.config.ts
pnpm --filter @clio/workspace exec playwright test -c tests/review/html-responsive-playwright.config.ts
```
