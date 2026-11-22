# Dependency upgrade, November 2026

Branch `chore/dependency-upgrade-2026-11`, cut from `develop` (51 commits ahead of
`main`). Inventory taken with `pnpm outdated -r` and by comparing
`desktop/src-tauri/Cargo.lock` with the crates.io index on 2026-11-21. `tui/` is
frozen and was not touched.

Each group is its own commit, patch/minor first and then one commit per major.
Gates per group: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and for
the desktop crate `cargo check` plus `cargo test --locked --lib -- --test-threads=1`
(the CI invocation).

## Baseline

`develop` did not start green: three web tests failed (two connection-provider
mocks missing `useOfflineArchive`, and the new script foreground→background route
missing from the fixture-route contract). They are repaired in the first commit.
Bare `cargo test` also fails to compile three examples (`document_actions`,
`file_associations`, `ssh-hosts-acceptance`) that `#[path]`-include sources which
reference `crate::host_env`; CI only runs `--lib`, and this is left as found.

## JavaScript packages

Outcome: **upgraded**, **held** (left at the current version, reason given), or
**minor group** (part of the patch/minor commit).

| Package | Workspace(s) | Current | Latest | Major | Outcome | Notes that matter |
| --- | --- | --- | --- | --- | --- | --- |
| vite | web, hdf5-viewer | 8.2.2 | 8.3.8 | no | minor group | — |
| oxlint | web, hdf5-viewer | 1.79.0 | 1.94.0 | no | minor group | New `react(purity)` rule flags `new Date()` during render; `DateTimeField` now reads the current year once. |
| @tanstack/react-virtual | web | 3.14.10 | 3.14.26 | no | minor group | virtual-core sizes the scroll element from `clientWidth/clientHeight` instead of `offset*`; windowed-list tests mock both. |
| shiki | web | 4.4.3 | 4.6.0 | no | minor group | Inlined Oniguruma WASM is gzip-compressed and inflated via `Blob.stream()`; jsdom lacks it, so the test setup polyfills it. Browsers are unaffected. |
| radix-ui, @base-ui/react, @radix-ui/* | web | 1.6.7 / 1.7.0 / … | 1.8.1 / 1.9.0 / … | no | minor group | — |
| maplibre-gl, react-map-gl | web | 6.5.0 / 8.1.2 | 6.19.0 / 8.1.3 | no | minor group | — |
| lucide-react | web | 1.33.0 | 1.77.0 | no | minor group | — |
| @tanstack/react-query, react-table | web | 5.102 / 9.1.2 | 5.108.2 / 9.3.1 | no | minor group | — |
| tailwindcss, @tailwindcss/vite | web | 4.3.3 | 4.3.5 | no | minor group | — |
| ai, pele, shadcn, react-router-dom, react-resizable-panels, zustand, tailwind-merge, vega-embed, papaparse, nanoid, @dagrejs/dagre, testing-library, @types/react(-dom), @vitejs/plugin-react, @axe-core/playwright, @playwright/test, typescript-eslint, axios, fake-indexeddb, mdast/micromark utils, @streamdown/cjk+math | various | — | — | no | minor group | Patch/minor releases; no source changes needed. |
| vega-lite | web | 6.4.3 | 6.5.0 | no | **held** | `chart-selection.test.ts` deliberately pins the vega-lite version whose selection-store format the app writes; moving needs a store-format review. |
| libavoid-js | web | 0.5.0-beta.5 | 0.5.0-beta.6 | no | **held** | beta.6 changes the WASM API used by lineage routing (`Cannot convert "undefined" to unsigned int`). |
| streamdown | web | 2.5.0 | 2.8.0 | no | **held** | 2.8 rewrites in-document hash links to `#user-content-*`, breaking anchors to existing document sections (user-visible). |
| prettier | root | 3.3.3 | 3.10.1 | no | **held** | Exactly pinned for `schema-ts-gen`: 3.10 reflows union types in the committed `packages/core/src/generated/clio-schemas/_models.ts`, which that job's drift check would reject. |
| json-schema-to-zod | root | 2.7.0 | 2.8.1 | no | **held** | Pinned generator for the same CI job; regeneration could not be verified here (no access to `iowarp/clio-schemas`). |
| @apidevtools/json-schema-ref-parser | root | 11.9.3 | 16.0.8 | yes | **held** | Pinned generator (above). v15 is ESM-only with strict RFC 6901 pointers; v14 makes `@types/json-schema` a peer. |
| @tauri-apps/api, cli, plugin-* | web, desktop | 2.1.1 / 2.1.0 / … | 2.12.5 / 2.12.6 / … | no (Tauri group) | upgraded | Brings the JS bindings in line with the 2.12 crates; `tauri info` no longer reports a mismatch. MSRV 1.90 (already set). |
| react, react-dom | web | 19.2.8 | 19.3.1 | no (React group) | upgraded | `<ViewTransition>` and Fragment refs stable; resize updates batch to the next frame; Strict Mode double-invokes hydration effects. No source changes. |
| react, react-dom | hdf5-viewer | 18.3.1 | 19.3.1 | yes | **held** | `@h5web/app` 17 and 18 peer on React 18 only; React 19 is planned for h5web 19. |
| @h5web/app | hdf5-viewer | 17.0.0 | 18.0.0 | yes | **held** | Still React 18; replaces suspense fetch stores with TanStack Query, renames `HsdsProvider` `filepath` → `domain`, pins three 0.185.1. Needs its own viewer pass. |
| typescript | root, core, desktop | 5.6.3 | 7.0.2 | yes | upgraded to 6.0.3 | TS 6 defaults `rootDir` to the tsconfig directory, so core sets `rootDir: ./src`. Stops at 6.0: typescript-eslint 8.73 peers on `<6.1`, and `scripts/check_unlocalized_copy.mjs` imports the compiler API, which 7.0 does not ship until 7.1. |
| typescript | web, hdf5-viewer | 6.0.3 | 7.0.2 | yes | upgraded | Native compiler; `tsc -b` over the web project references passes unchanged, 70 s → 22 s here. Nothing in these packages uses the compiler API. |
| vitest | web, core, hdf5-viewer | 2.1.8 | 5.1.1 | yes | upgraded | `environmentMatchGlobs`, `poolMatchGlobs`, `poolOptions` and `minWorkers` are gone; web now uses three inline projects (node/threads/shared graph, dom/forks, dom-ts/forks) covering exactly the same 812 files in the same environments. Mocks invoked with `new` construct instances; the jsdom `URL` global is now Node's (native `createObjectURL`), so the test setup always installs its deterministic stub; `ReturnType<typeof vi.fn>` widened, so typed helpers name their signature. |
| @testing-library/jest-dom | web | 7.0.1 | 8.0.0 | yes | upgraded with vitest | Only change: requires vitest ≥ 5. |
| jsdom | web, hdf5-viewer | 30.0.1 | 31.0.1 | yes | **held** | Tried and reverted: 12 tests in 7 files fail for separate reasons — canvas context fakes (`clearRect is not a function`), the reimplemented CSS engine (`::highlight` rules, `toHaveStyle`, theme tokens read through computed styles), visibility handling in the MCP-app look tests, and `postMessage` in the HDF5 frame. Each needs its own check of whether the test or the environment is right. |
| @types/node | root, core, web | 25.9.1 / 24.13.3 | 26.6.6 | yes | upgraded | undici-types 8; type-checks cleanly across packages. |
| eslint | core | 9.16.0 | 10.15.0 | yes | upgraded | eslintrc fully removed (core already uses flat config); new recommended rules. Core lints cleanly. |
| motion | web | 13.1.1 | 14.14.0 | yes | upgraded | Only removes internal framer-motion 13.0–13.4 compat APIs; public API unchanged. |
| pdfjs-dist, react-pdf | web | 5.4.296 / 10.4.1 | 6.5.438 / 11.1.0 | yes | upgraded | react-pdf 11 suspends by default; the PDF viewer passes `suspense={false}` to keep its own loading/error states. react-pdf 11.1 pins pdfjs-dist 6.5.438 exactly, so the worker matches. |
| three, @types/three | web | 0.180.0 | 0.187.0 | yes (0.x) | upgraded | Renderer/loader deprecations only; nothing the app uses. |
| elkjs | web | 0.11.1 | 0.12.1 | yes (0.x) | upgraded | License is now `EPL-2.0 OR GPL-3.0-or-later`; EPL-2.0 remains available. |
| mermaid | web | 11.17.0 | 12.3.0 | yes | upgraded | ELK becomes the default layout and `neo`/`redux-color` the default look/theme. The renderer already sets `theme` and `look`; it now pins `layout: 'dagre'` so diagrams and node regions keep their shape. Math labels render as MathML with Mermaid's own KaTeX 0.18. |
| katex | web | 0.16.47 | 0.19.1 | yes (0.x) | **held** | 0.18 prefixes internal CSS classes (`katex-base`, …). Chat math is rendered by `@streamdown/math`, whose latest release still uses KaTeX 0.16, and shares the app's KaTeX stylesheet; moving the app copy would mis-style chat math. |
| @xyflow/react | web | 12.11.3 | 13.0.2 | yes | **held** | Code changes are small (`useStore` → `useViewportStore`, `fitViewOptions.padding: 0.15` → `'15%'` because numbers are now pixels), but v13 ships `.dark .react-flow` and follows the system color scheme. The app's `html.dark` would turn every graph's chrome dark where v12 always drew it light; that needs a design decision and visual review of the four graph views. |
| zod | web, core | 3.25.76 | 4.6.7 | yes | **held** | `@a2ui/react` and `@a2ui/web_core` (through 0.15) depend on zod 3; zod 4 in the app would mean two copies with schemas crossing the A2UI boundary. |
| @a2ui/react, @a2ui/web_core | web, core | 0.11.x | 0.15.0 | yes (0.x) | **held** | Four protocol releases: v0.8 exports split out, catalog API (`validationSchema`, required `toJson`), `a2ui-` class prefixes, v1.0 wire version string, `allowedParents/allowedChildren` enforcement, no built-in loading placeholder. A coordinated contract change with clio-schemas and clio-agent, not a dependency bump. |
| @a2ui/markdown-it | web | 0.1.2 | 0.2.2 | yes (0.x) | **held** | Peers on `@a2ui/web_core ^0.14`; moves with the A2UI upgrade. |

## Rust crates (`desktop/src-tauri`)

| Crate | Locked | Latest | Major | Outcome | Notes that matter |
| --- | --- | --- | --- | --- | --- |
| tauri / tauri-build | 2.12.4 / 2.7.3 | 2.12.7 / 2.7.6 | no | upgraded (`cargo update`) | With wry 0.57.3, tao 0.37.3 and runtime patches. |
| tauri-plugin-* | 2.x | 2.x latest | no | upgraded (`cargo update`) | notification 2.8.1, dialog 2.8.4, opener 2.7.3, updater 2.14.1, single-instance 2.5.5. |
| libc, zstd (0.13.x) and other transitive crates | — | — | no | upgraded (`cargo update`) | 149 lockfile updates in total. |
| rand | 0.8.8 | 0.10.4 | yes | upgraded | `thread_rng().fill_bytes()` → `rand::fill()`; `rand::random()` unchanged. MSRV 1.85. |
| sha2 | 0.10.9 | 0.11.1 | yes | upgraded | digest 0.11 outputs lack `LowerHex`; hashes are printed with `hex::encode` (same lowercase hex). Includes Windows-only `runtime_unpack.rs`, audited by hand. MSRV 1.88. |
| portable-pty | 0.8.1 | 0.9.0 | yes | upgraded | New trait bounds only affect implementors; no source changes. |
| ureq | 2.12.1 | 3.5.2 | yes | **held** | Ground-up rewrite on `http` types with its own TLS config, no idempotent retries, `proxy-from-env` default. 36 call sites in the supervisor/HTTP/SSE bridge, where TLS and proxy behaviour are security-relevant; needs its own change with network review. |
| keyring | 3.6.3 | 4.2.0 | yes | **held** | Moves to `keyring-core` with one crate per credential store and drops the 3.x platform features. The macOS and Windows stores cannot be compiled or exercised in this Linux container. |
| zstd | 0.13.5 | 0.14.4 | yes | **held** | Windows-only dependency (runtime pack); cannot be compiled here. |
| winreg, windows-sys, png (direct) | 0.55 / 0.59 / 0.18 | 0.56 / 0.61 / 0.18 | yes (0.x) | **held** | Windows-only; cannot be compiled here. |
| gtk, gio, gdk-pixbuf | 0.18 | 0.19 / 0.22 | yes (0.x) | **held** | Tauri 2.12, wry 0.57 and webkit2gtk 2.0 all still use gtk-rs 0.18; moving would pull a second gtk-rs stack whose types do not interoperate with Tauri's window and webview handles. |
| serde, serde_json, hex, glob, tar, base64, objc2*, block2, webview2-com, windows | current | current | — | unchanged | Already latest within range. |

## Not verified here

- Windows and macOS builds: only `x86_64-unknown-linux-gnu` is installed, so
  `#[cfg(windows)]`/`#[cfg(target_os = "macos")]` code was checked by reading it.
- Schema regeneration (`schema-ts-gen`): `iowarp/clio-schemas` was not reachable,
  so the generator pins were kept rather than verified.
- Playwright e2e and native-webview tests are not part of the primary gates and were
  not run; the browser check below used the review-fixture build instead.

## Browser check

Headless Chromium at 1440×900 and 390×844 against `CLIO_REVIEW_FIXTURES=1` builds
of this branch and of the pre-upgrade commit (`4903d3d5`), both talking to
`web/e2e/fixture-server.mjs`:

- Workspace session, Settings, and published A2UI chart, table and map surfaces from
  the production bundle; the scientific diagrams, standard math and component
  gallery review pages (the first and last are served by the Vite dev server).
- No console errors, page errors or failed requests on either build.
- Every capture is pixel-identical to the baseline except the Mermaid sequence
  diagram at phone width, where Mermaid 12 spreads the actors across the width and
  wraps message labels less.
- The e2e fixture server publishes no A2UI code surface, and
  `tests/review/tool-operations.html` needs data the spec injects with
  `page.route`, so code rendering was checked only through the transcript tool rows
  and the gallery.

## What the upgrades give us

### Adopted

- **pdf.js renderer worker** (pdf.js 6.5). The PDF viewer sets
  `GlobalWorkerOptions.rendererSrc`, so pages are drawn on an `OffscreenCanvas`
  in a worker instead of the main thread; large or image-heavy pages no longer block
  scrolling and input. pdf.js falls back to main-thread drawing when the webview lacks
  `OffscreenCanvas` or the worker cannot start. Checked with
  `e2e/document-artifact-preview.spec.ts` (docx, pptx and xlsx previews at desktop and
  phone width): every page started the renderer worker, and each rendered page canvas
  is pixel-identical to main-thread drawing. The worker is a same-origin bundled
  module, like the existing `pdf.worker`, so the desktop CSP (`script-src 'self'`,
  no `worker-src`) treats it the same way; it has not been run inside the Tauri
  webviews.

### Already active with no code change

- **TypeScript 7**: `tsc -b` for web takes about 10 s instead of about 70 s. It
  already builds project references in parallel; `--builders` and `--checkers`
  gave no further gain here (9–11 s either way).
- **vitest 5**: inline projects share one Vite server, and transformed modules are
  cached on disk (`fsModuleCache`, on by default since 5.0.4).
- **React 19.3**: transitions render independently, resize updates batch to the
  next frame, and unchanged `innerHTML` is not reassigned.
- **Shiki 4.6**: the Oniguruma WASM is gzip-compressed and loaded asynchronously.
- **MapLibre 6.6–6.19**: parallel shader linking, fewer WebGL calls per frame,
  faster symbol layout and placement, no sprite readback stall.
- **Mermaid 12**: deeply indented diagrams parse in milliseconds instead of seconds.
- **pdf.js 6**: ImageDecoder on Chromium, faster JPX/JBIG2 decoding, downscaling of
  large images without a full RGBA buffer.
- **motion 13.3–14**: a smaller and faster `animate`, cheaper scroll animations, and
  hardware-accelerated independent transforms.
- **Tauri 2.5–2.12**: faster `Channel` IPC for small payloads and asynchronous
  protocol handlers at startup.

## Decisions for the user

Each item is a design change, a contract change or a risk that needs a person to
decide. "Value" is what the product gains, "Risk" is what could go wrong.

### Held upgrades

| Item | Value | Risk | Recommendation |
| --- | --- | --- | --- |
| **React Flow 13** (`@xyflow/react`) and its dark mode | Current release line. Graph chrome (controls, minimap, background) can finally follow the app's dark theme, so graphs stop being light islands in a dark UI. Also: per-slice stores (`useViewportStore`, `useNodesStore`, …) so components subscribe to less state. | v13 styles `.dark .react-flow`, which the app's `html.dark` matches, and otherwise follows the OS scheme. All four graph views (lineage, study, knowledge, conversation relationships) change appearance at once. `fitViewOptions.padding: 0.15` becomes 0.15 px unless rewritten as `'15%'`. | **Adopt, with a design pass.** Drive `forceColorMode` from the app theme (never the OS) and review the four graphs in both themes. The code change is small; the visual sign-off is the work. |
| **KaTeX 0.19** | Current release line; `symbolNotInFont` strict reporting; new commands. | Chat math is rendered by `@streamdown/math`, whose latest release still uses KaTeX 0.16 and shares the app's KaTeX stylesheet. 0.18+ renames internal classes (`katex-base`, …), so moving the app copy mis-styles every chat formula. | **Wait** for `@streamdown/math` to move to KaTeX ≥ 0.18, then move both together. |
| **zod 4** | Faster parsing, smaller bundles, `z.toJSONSchema()`, better error formatting. | `@a2ui/react` and `@a2ui/web_core` (through 0.15) depend on zod 3, so the app would carry two copies with schemas crossing the A2UI boundary. `required_error` and `invalid_type_error` are removed, `.default()` changes, `z.record()` needs two arguments. | **Move with A2UI, not before.** Until then, new code can use `zod/v4` from the installed 3.25 package where interoperability isn't needed. |
| **A2UI 0.15** (`@a2ui/react`, `@a2ui/web_core`, `@a2ui/markdown-it`) | Protocol v1.0 wire format, enforced `allowedParents`/`allowedChildren`, catalog `validationSchema`, `a2ui-`-prefixed classes, refusing `agentOnly` functions in the invoker. | A contract change spanning clio-schemas, clio-agent and this renderer. The v0.8 exports move, the basic React catalog is removed, and `A2uiSurface` no longer renders loading or error placeholders. | **Plan a coordinated migration** across the three repositories (see the `a2ui-component-design` skill). Not a dependency bump. |
| **jsdom 31** | Current test DOM: reimplemented CSS engine closer to browsers, async focus changes, `@napi-rs/canvas` support. | Tried: 12 tests in 7 files fail for separate reasons (canvas context fakes, `::highlight` and computed-style reads, visibility in the MCP-app look tests, `postMessage` in the HDF5 frame). Each needs a decision on whether the test or the environment is right. | **Do as its own task.** Fix the canvas fake once in the test setup first; most of the rest are test assumptions about jsdom 30's CSS. |
| **vega-lite 6.5** | Current release; chart fixes and features. | `chart-selection.test.ts` pins the vega-lite version whose selection-store format the app writes, so saved selections may be read differently. | **Adopt after checking** the selection-store format against 6.5 and updating the pin with a migration note. |
| **streamdown 2.8** | Current Markdown streaming renderer. | 2.8 rewrites in-document hash links to `#user-content-*`: two tests expecting `#section` now get `#user-content-section`. Whether the target headings get the same prefix (so the links still resolve) was not checked. | **Check, then decide.** If heading ids are prefixed too, update the two tests and adopt; if not, wait for a fix or an option to turn the prefix off. |
| **ureq 3** (desktop HTTP bridge) | Maintained major; `http`-crate types, explicit TLS config with platform verifier, `Agent::shutdown()`. | Rewrite of 36 call sites in the supervisor, SSE and `gact_http` bridge. TLS root choice, proxy-from-env (now on by default) and no automatic retries change network behaviour in security-relevant code. | **Do as its own change** with a network/TLS review and tests against a proxied and an HTTPS endpoint. 2.x still works. |
| **keyring 4** (desktop credentials) | Maintained major; credential stores split into small crates. | The API moves to `keyring-core` with a separate store crate per platform; the macOS and Windows paths cannot be built or exercised on Linux. A mistake loses or orphans stored credentials. | **Do on each platform**, with a migration test that reads credentials written by 3.x. |
| **Schema generator pins** (prettier 3.10, json-schema-to-zod 2.8, json-schema-ref-parser 16) | Current formatter and generators. | `schema-ts-gen` regenerates `packages/core/src/generated/clio-schemas` and rejects drift; prettier 3.10 reflows the union types in `_models.ts`. | **Move all three together** with a regenerated tree from the pinned clio-schemas commit. |
| **H5Web 18** and React 19 for the HDF5 viewer | One React version across the workspace. | H5Web 18 still requires React 18 (19 is planned for H5Web 19) and changes `HsdsProvider` and data fetching. | **Wait for H5Web 19.** |
| **libavoid-js 0.5.0-beta.6** | Current routing engine. | The WASM API used by lineage edge routing changed. | **Wait for a stable release**, then port the routing calls. |

### New features worth adopting

| Feature | Value | Risk | Recommendation |
| --- | --- | --- | --- |
| **Shiki JavaScript regex engine** (`createJavaScriptRegexEngine` with `shiki/core` and per-language imports) | No WASM to download or compile before code is highlighted, and a much smaller highlighter bundle. It also removes highlighting's dependence on WebAssembly under the desktop CSP (below). All built-in grammars are supported by the JS engine. | Tokenization can differ for some grammars, and the app's custom grammars need checking. | **Adopt next**, after a token-by-token comparison of both engines over a corpus of the languages agents actually emit. |
| **Desktop CSP and WebAssembly** | Reliable WASM features on desktop: highlighting, CAD STEP import (`occt-import-js`), lineage routing (`libavoid-js`), pdf.js image decoders. | The desktop CSP is `script-src 'self'` with no `'wasm-unsafe-eval'`. Chromium (so WebView2 on Windows) refuses to compile WebAssembly under such a policy, unless Tauri adds the keyword at runtime, which was not checked. | **Verify on Windows and macOS.** If WASM is blocked, add `'wasm-unsafe-eval'` to `script-src` (it allows compiling WASM, not `eval`). |
| **React 19.3 `<ViewTransition>`** with motion's `AnimateView` (`motion/react-animate-view`) | Animated navigation between conversations, files and canvas states, and shared-element transitions (a file row expanding into the viewer), with no layout-thrash code. | Product motion design. Needs a `prefers-reduced-motion` policy in CSS and a decision on which transitions are worth animating. | **Design first.** Pick two or three transitions (open file, switch conversation), then adopt behind the reduced-motion rule. |
| **Tauri `build.removeUnusedCommands`** (2.4) | Strips commands that no capability allows from the binary, shrinking the IPC attack surface. | Commands granted by capabilities added at runtime would be stripped. None are added at runtime today (no `add_capability` calls), but it changes the built binary and needs a desktop smoke run. | **Adopt** with a full desktop build and native smoke test. |
| **Tauri 2.12 webview security options** (`limitNavigationsToAppBoundDomains`, the WebView permission handler) | Tighter navigation and permission control (display capture, MIDI, file-system access) for embedded content. | Can block legitimate flows (OAuth windows, MCP apps) if mis-scoped. | **Review with the security owner**; start by denying permissions the app never needs. |
| **Vite `build.chunkImportMap`** (experimental) | Chunks import each other through an import map, so a release invalidates only the chunks that changed. Faster repeat loads of the web workspace after updates. | Experimental; needs `import.meta.resolve`. Little benefit in the desktop app, which ships its bundle locally. | **Try for the web deployment** once it leaves experimental. |
| **MapLibre `oklch`/`oklab` interpolation** (6.19) and layer blend modes (6.18) | Perceptually uniform colour ramps for scientific map layers (no muddy midpoints), and better raster/vector overlays. | Changes how existing ramps look; needs the chart and map colour design to agree. | **Adopt in the map colour system** together with the chart palette. |
| **Mermaid 12 per-diagram ELK, step animation and new diagrams** | Agents can ask for ELK layout on dense diagrams (`config: { layout: elk }` in front matter already works while the site default stays dagre), plus BPMN shapes, use-case diagrams and stepped flowcharts. | Small reach: Pele renders most diagrams first, and Mermaid is the fallback. Step animation needs a reduced-motion check. | **Document per-diagram ELK** in the agent's diagram guidance; skip the rest until Pele cannot cover a need. |
| **react-virtual `cancelScroll()`** (virtual-core 3.18) | A reader's scroll gesture cleanly interrupts the transcript's stick-to-bottom scroll while an answer streams. | Touches streaming scroll behaviour, which is easy to regress. | **Adopt** if stick-to-bottom fights user scrolling today; test on touch devices. |
| **vitest `--last-failed` / `--since-last-run`** (5.1) and `isolate: false` for DOM tests | Faster local loops: rerun only failures or what changed. Sharing the DOM environment could cut the 8–9 minute suite substantially. | The scripts are harmless. `isolate: false` for DOM tests exposes cross-file state leaks (this upgrade already found two in node tests). | **Add the scripts; evaluate `isolate: false`** for DOM tests separately with `vitest doctor`. |
| **three r187 loader priority, `Object3D.dispose()`, `KHR_meshopt_compression`** | Lower memory when mesh and CAD viewers close, and smaller glTF downloads. | Viewer code paths that are hard to test headlessly. | **Adopt `dispose()`** when the 3D viewers are next touched. |
| **pdf.js `partialFrames`** (6.5) | Progressive drawing of very heavy pages. | react-pdf does not expose it. | **Skip** until react-pdf exposes it. |
