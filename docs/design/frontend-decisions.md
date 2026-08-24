# Frontend decisions

This log records deliberate departures from the retired web UI and from the
initial rebuild composition. Backend state, authorization, causality, and
recoverability remain authoritative; these decisions change how that truth is
presented.

## 2026-08-22 — Product identity belongs to the embedding agent

- **Old failure:** The connection screen hard-coded CLIO copy, exposed transport
  vocabulary, and did not use the product logo. That made a GACT client look like
  a single fixed product and described implementation details instead of the
  product's purpose.
- **Decision:** The tracked profile is the neutral `Agent Workspace`. The Vite
  brand loader reads the product name, logo, landing eyebrow, headline,
  description, accent, and theme tokens from the embedding project's selected
  brand profile. The local CLIO build points at `clio-agent/branding/clio` without
  copying CLIO assets into this repository.
- **Acceptance evidence:** The real CLIO profile renders its logo and
  “From scientific question to defensible result” copy in the browser. The
  neutral tracked profile contains no CLIO product identity.

## 2026-08-22 — Connection is a remembered product action

- **Old failure:** The landing form foregrounded endpoint/token mechanics and
  required a repeated manual connection even when a working endpoint had already
  been used.
- **Decision:** Previously successful endpoints are remembered and attempted
  automatically. Saved endpoints are selectable from one control; access tokens
  remain memory-only and live under an explicitly opened Advanced section.
- **Acceptance evidence:** Reloading the local CLIO build reconnects to the real
  server and opens the most recent session across all workspaces. Failed attempts
  remain on the landing screen with a labeled reason.

## 2026-08-23 — Session history belongs to its agent service

- **Old failure:** Workspace return memory was global. Switching from the disposable Luna service
  to the Homelab service left Settings pointing at Luna's workspace and session identifiers, so
  “Workspace” opened an unavailable route owned by another agent.
- **Decision:** Workspace return routes are keyed by normalized endpoint. A service switch first
  reads that destination's authoritative workspace and session catalogs, selects by actual last
  interaction rather than operational update time, primes only destination-owned state, and then
  records or opens the resolved route. Route-state shortcuts are accepted only when their endpoint
  matches the active connection.
- **Acceptance evidence:** The live Settings connection menu switched from Luna at
  `127.0.0.1:8790` to the LAN service at `10.0.0.102:8182`; its Workspace link resolved directly to
  Homelab session `sess_a53f8bdcf93e`. The in-workspace service switcher then returned directly to
  Luna session `sess_cf97c512a610`, restoring its NDP workspace, interaction time, transcript,
  reasoning, and A2UI view without visiting the connection landing page.

## 2026-08-22 — Inter replaces Oxanium in the workspace

- **Old failure:** Oxanium made ordinary navigation and transcript text feel like
  decorative science-fiction chrome and reduced reading comfort in dense,
  long-running scientific sessions.
- **Decision:** Inter Variable is the interface and heading face. JetBrains Mono
  remains limited to code, identifiers, measurements, and other data where a
  monospace face adds meaning.
- **Acceptance evidence:** The landing, navigation, transcript, and A2UI browser
  checkpoints resolve to Inter; code and numeric data retain JetBrains Mono.

## 2026-08-22 — Restrained grid background, locally owned

- **Old failure:** The old connection screen had no memorable product arrival
  state, while a highly animated background would compete with connection errors
  and accessibility needs.
- **Decision:** A restrained grid and aurora treatment was adapted as local CSS
  after a 21st.dev “Grid Background” catalog search. No third-party background
  component or runtime dependency was copied. Motion is omitted in reduced-motion
  mode.
- **Acceptance evidence:** Dark browser acceptance shows branded content with a
  quiet cyan/orange field, stable geometry, and readable connection controls.

## 2026-08-22 — A2UI is a product surface, not JSON or tool chrome

- **Old failure:** The previous renderer exposed component payloads as JSON and
  separately foregrounded `create_a2ui_surface`, forcing users to understand a
  producer implementation detail.
- **Decision:** The agent may author a trusted A2UI surface through a server tool,
  but the persistent result is rendered as a first-class analysis view. Producer
  activity is labeled “Building analysis view” / “Analysis view created”; the
  backend tool identifier is no longer primary transcript copy. Raw inputs remain
  available only in the collapsed technical detail.
- **Acceptance evidence:** A real Codex Luna turn created and persisted
  `luna-a2ui-visual-core-v1`; the browser rendered its Mermaid evidence flow,
  compact plot, highlighted Python, and semantic data table. No component payload
  appeared as JSON in the result.

## 2026-08-22 — Scientific visual core uses professional shared renderers

- **Old failure:** A generic card/catalog-first A2UI implementation did not answer
  the scientific questions users actually inspect: flow, code, trends, and
  evidence rows.
- **Decision:** Mermaid diagrams, highlighted code, interactive time-series
  charts, and data tables are the primary CLIO catalog components. Charts use
  the shadcn Recharts primitive, tables use ReUI DataGrid, and code uses AI
  Elements CodeBlock. CLIO code only normalizes scientific rows, applies bounded
  limits, and validates Mermaid input. Tables accept both string field names and
  labeled column objects so producer variation does not turn valid evidence into
  a JSON fallback.
- **Acceptance evidence:** Renderer tests cover the shared chart and data-grid
  roots, both table column shapes, and absence of serialized JSON. Mermaid tests
  cover declarative input and rejection/removal of executable directives, HTML,
  links, scripts, and event attributes. The real Luna browser checkpoint rendered
  all four surfaces with sortable table headers and a chart tooltip/legend path.

## 2026-08-22 — Reuse is the default implementation boundary

- **Old failure:** Early rebuild surfaces wrapped locally styled divs around
  domain data, reproducing the old UI with new class names while leaving the
  supplied professional component libraries largely unused.
- **Decision:** Standard behavior comes from registry source: AI Elements owns
  agent process, composer model selection, artifacts, context, code, and
  approvals; ReUI owns frames, timelines, and data grids; shadcn owns the shell,
  panels, forms, dialogs, empty states, and chart foundation. CLIO wrappers may
  translate backend entities, enforce trust, and supply terminology, but may not
  recreate those components. This rule is also recorded in `.21st/design.json`.
- **Acceptance evidence:** TypeScript resolves the installed upstream component
  APIs directly. Browser semantics expose a ReUI activity timeline, AI Elements
  artifact actions, an AI Elements chain-of-thought process, ReUI A2UI tables,
  and shadcn/Recharts plots; the Vitest catalog suite asserts the shared component
  roots rather than a local SVG implementation.

## 2026-08-22 — Navigation is bounded and physically resizable

- **Old failure:** The left panel consumed a fixed width, expanded every project,
  and exposed raw paths as identity. It could not be resized to match workspace
  density or the current task.
- **Decision:** The sourced shadcn Sidebar sits inside a sourced resizable panel.
  It shows the active workspace plus bounded recent workspaces, labels each by
  display name, and offers path copy only as a secondary action. Collapse and
  resize share one state model and remain keyboard accessible.
- **Acceptance evidence:** In-browser ArrowRight on the labeled navigation
  separator changed its width from 280px to 343px. The real endpoint rendered the
  active workspace, six recent workspaces, and a visible “Show all 25 workspaces”
  action without displaying full paths as primary labels.

## 2026-08-22 — Settings and model choice use authoritative catalogs

- **Old failure:** Settings were absent and the composer displayed model controls
  without a complete authoritative configuration workflow.
- **Decision:** Settings use live provider, language-model, catalog, permission,
  connection, appearance, and desktop capability responses. The composer uses AI
  Elements ModelSelector over the same model catalog. Missing fields remain
  unavailable rather than being replaced by defaults. The live preset status outranks a provider
  definition's coarse authentication flag, so a no-key CLI provider is not called ready when its
  executable is absent, and an unchecked local endpoint remains labeled “Not checked.”
- **Acceptance evidence:** The real Codex endpoint populated GPT-5.6 Sol, Terra,
  and Luna in the composer selector and GPT-5.6 Luna in settings. The Homelab service showed four
  local providers as “Not checked” and Claude Code as unavailable with its exact missing-CLI reason,
  instead of the former false “Ready” label. The workspace continues to show unavailable token cost
  when no authoritative usage snapshot exists.

## 2026-08-22 — SPOTTER actions preserve server behavior

- **Old failure:** Action-card buttons were rebuilt from bare action IDs and had
  no behavior. This discarded server labels, disabled reasons, child handles,
  source identity, severity, and quarantine state.
- **Decision:** GACT 0.3 preserves the bounded action label, enabled state, and
  safe behavior object. Native cards use shadcn Alert/Button composition. The
  only currently executable native behavior is `focus_session`, resolved through
  the authoritative agent-task endpoint; stub actions remain visibly disabled
  with the server-provided reason.
- **Acceptance evidence:** The canonical working SPOTTER session rendered both
  critical anomaly cards as raised by `spotter-ai`, exposed Discuss, disabled
  Address/Remove, showed the halt and explicit user-driven resume, and navigated
  Discuss to child session `sess_b2d148d4cd83`.

## 2026-08-22 — Runs are execution handles, not renamed sessions

- **Old failure:** The run explorer queried sessions and relabeled them “runs,”
  hiding tool and remote execution handles while presenting the wrong entity as
  operational truth. Structured failure payloads also leaked into primary rows.
- **Decision:** ReUI DataGrid consumes the authoritative `/v1/runs` projection.
  Session snapshots are used only to resolve a legitimate child or parent
  destination. Source, placement, detach state, server status, and concise failure
  reason remain distinct; structured task records stay out of primary copy.
- **Acceptance evidence:** The live browser rendered 258 agent and tool handles,
  linked SPOTTER child sessions to their workspaces, displayed failed states with
  labeled icons, and contained no `mcp_result_artifact` JSON in visible grid text.

## 2026-08-22 — Files and context retain server ownership

- **Old failure:** The inspector rendered permanent “unavailable” placeholders
  even though the server already exposed bounded workspace files and ARC context.
- **Decision:** AI Elements FileTree renders `/v1/workspaces/{id}/files`; AI
  Elements Context renders `/v1/sessions/{id}/context/state`. The model-grounded
  prompt reading and live ARC attribution are labeled separately, and no value is
  substituted when the model reading is absent. GACT 0.3 exposes `agent_id` so the
  client requests the authoritative context scope rather than guessing it.
- **Acceptance evidence:** Canonical flat-NDP displayed the EarthScope datasets,
  plot, and report in the keyboard-selectable file tree. Its context panel showed
  the `main` scope, 262,144-token window, zero live attribution, and an unavailable
  model prompt reading without fabricating usage.

## 2026-08-22 — User questions are first-class interactions

- **Old failure:** Ask-user events existed as protocol records but had no complete
  workspace interaction, leaving the agent waiting while users inspected logs.
- **Decision:** Server-authored choices render through ReUI Frame plus shadcn
  fields and radio controls, and answers use the canonical question mutation.
  The interaction is visible, keyboard accessible, and removed only after the
  server acknowledges resolution.
- **Acceptance evidence:** A real question on the disposable Luna session rendered
  its prompt, option descriptions, and disabled-until-selected submit action. The
  browser selected `continue`; the server recorded `answered` with
  `selected_options: ["continue"]`, and the pending panel disappeared.

## 2026-08-22 — Interrupted responses remain visibly recoverable

- **Old failure:** Cancelling an active turn persisted an assistant message with
  no blocks, which the workspace rendered as an unexplained blank row. Retry was
  only instructional copy inside explicit error blocks and did not call the
  backend.
- **Decision:** Empty assistant turns are labeled “Response unavailable” without
  inventing an error cause. Recoverable errors and empty responses expose AI
  Elements' shared message action, backed by the authoritative retry-attempt
  route. Cancellation continues to use the session cancel mutation.
- **Acceptance evidence:** In the disposable Codex Luna session, the browser
  stopped a running turn, exposed the empty response with a keyboard-accessible
  Retry action, created an authoritative retry attempt, resolved a real tool
  approval, and received `LUNA RECOVERY COMPLETE`. The context bar and composer
  both identified `codex · gpt-5.6-luna` at medium effort throughout.

## 2026-08-23 — The right side is a unified canvas, not an inspector

- **Old failure:** The permanent right inspector mixed activity, files, artifacts,
  and context into narrow fixed tabs, while the later resource-only workbench split
  observability from the user's durable working space. A static shell header also
  occupied the canvas's width and prevented it from taking over the workspace.
- **Decision:** The right pane is a resizable general canvas. Its non-closeable
  Session tab is the full observability surface; files, artifacts, blueprint
  contents, and read-only child conversations open as sibling durable tabs. The
  adaptive pill remains the compact ambient summary and a gateway to the Session
  tab. The center owns its own header and status strip. The canvas owns its full
  height and can maximize over navigation, conversation, composer, and shell chrome.
- **Acceptance evidence:** In canonical EarthScope NDP, Shift-click kept the parent
  session central and opened the visualization child as a live canvas tab; plain
  click navigated the center and returning preserved the canvas tab. The launcher
  opened the real artifact browser, full-canvas mode covered the other workspace
  surfaces, and restore returned to side-by-side composition. Keyboard resizing
  continued to expand the canvas without losing its active content.

## 2026-08-23 — Session history is task-oriented and server-owned

- **Old failure:** Lifecycle routes existed without a coherent place in the live
  workspace, destructive rollback semantics were hidden, and a raw endpoint was
  easy to mistake for finished history UX.
- **Decision:** The session title owns whole-session actions for branching,
  compaction, last-message removal, and expiring read-only sharing. Every message
  uses AI Elements' shared action row for one-click branching and an explicitly
  confirmed “rewind to here” action. All mutations reconcile from authoritative
  transcript/session snapshots; the client never splices causal history locally.
- **Acceptance evidence:** Core repository tests assert the encoded fork, undo,
  rewind, compact, and share request contracts. Component tests cover direct
  branching, destructive confirmations, rejected-action recovery, expiry, and
  share-link presentation. In the real EarthScope NDP browser session, the whole-
  session menu and every visible message exposed the expected actions; compact,
  remove, rewind, and share dialogs were inspected and cancelled without changing
  the canonical session. Live mutation evidence remains intentionally open for a
  disposable session.

## 2026-08-23 — Administration reports operator meaning before protocol detail

- **Old failure:** The replacement settings surface exposed only a subset of the
  service and forced users back to raw health, metrics, memory, hook, and policy
  responses for ordinary diagnosis. Blueprint “sources” also obscured their
  product role as marketplaces.
- **Decision:** Settings now calls blueprint publishers “Marketplaces,” separates
  expert packs from standalone blueprints, shows persistent access rules beside
  one-time permission requests, and provides a System workspace composed from
  ReUI Frames and shared shadcn Tabs/Accordion. Service integration identifiers
  are mapped to task-oriented labels while exact endpoints and remediation detail
  remain available inside expanded diagnostics.
- **Acceptance evidence:** Repository contract tests decode all six authoritative
  administration endpoints and assert policy mutation boundaries. Component tests
  cover degraded health labels, activity, memory, access rules, and empty expert-
  pack state. The real service browser showed 15 labeled integration checks, the
  true 239-session/625-message activity snapshot, memory and hook state, the active
  workspace access rule, and the local marketplace with its three installable
  scientific blueprints.

## 2026-08-23 — Session setup exposes intent before implementation detail

- **Old failure:** New sessions inherited opaque server defaults and offered no
  blueprint choice. Adding every protocol field directly would have made the
  frequent path feel like a backend configuration form, while the expanded form
  initially escaped a 720px-tall browser viewport.
- **Decision:** Session name, workspace, and installed agent blueprint are the
  primary setup. Working mode, routing, and protected-action policy use shared
  shadcn Select controls inside an explicit collapsed section. Creation sends the
  selected behavior in the authoritative session mutation and then activates an
  explicit blueprint through its dedicated route. The dialog header and actions
  remain fixed while the form body scrolls within the available viewport height.
- **Acceptance evidence:** Core repository tests assert the exact create payload
  and blueprint activation route. The interaction test selects SPOTTER, planning,
  domain experts, and SPOTTER review. The live Luna browser exposed the real local
  blueprint catalog and all advanced fields, and the 720px checkpoint verified the
  bounded expanded layout without creating or altering the canonical NDP session.

## 2026-08-23 — Responsive behavior follows containers, not only the viewport

- **Old failure:** The desktop shell shrink-wrapped inside its flex provider and
  the workbench breakpoint read the browser viewport even after the navigation
  divider changed the workspace's actual width. Large blank regions and stale
  column modes resulted.
- **Decision:** The shell owns all available width with `flex: 1`, while a shared
  ResizeObserver hook selects embedded workbench versus sheet from the session
  workspace's measured width. Navigation and resource dividers remain separately
  keyboard resizable.
- **Acceptance evidence:** The live browser changed from a narrow shrink-wrapped
  column with blank space to a full-width three-pane layout. Repeated ArrowLeft
  resizing kept the workbench mounted and enlarged the NDP plot without a reload.

## 2026-08-23 — Artifact bytes and historical recovery remain authoritative

- **Old failure:** The native bridge converted binary bodies to strings, artifact
  URIs were sent to `window.open`, and old transcript artifacts became dead cards
  after their registry projection expired.
- **Decision:** Browser and Rust transports preserve `Uint8Array` bytes. Non-CAS
  custody follows only the server-provided fetch route. A missing historical
  artifact may use a workspace file only when one exact basename match exists in
  the same workspace; ambiguous matches remain unavailable.
- **Acceptance evidence:** Binary transport and repository tests pass. The live
  NDP PNG rendered both from the file tree and from an expired transcript artifact,
  with the unique-file recovery path stated alongside custody and checksum.

## 2026-08-23 — Child-agent dispatch is visible without redundant disclosure

- **Old failure:** Child assignment and outcome were incomplete in GACT 0.3 and
  then nested inside a generic collapsed work card, requiring extra clicks before
  users could understand the delegation.
- **Decision:** The server joins transcript handoffs to its authoritative task
  registry, preserving child session, assignment, result, and duration. A single
  child dispatch renders the pinned TheoKit component directly; AI Elements owns
  surrounding multi-step reasoning and tool sequences. Plain click makes the child
  the steerable center conversation. Shift-click opens its read-only transcript in
  a durable canvas tab; a visible secondary action provides touch and keyboard parity.
- **Acceptance evidence:** The canonical NDP visualization child displayed its
  assignment, 52-second duration, result, and both destinations. Browser plain-click
  navigated to `sess_cb254e7200dd`; Shift-click retained the EarthScope parent URL and
  opened a live child transcript tab. Returning from center navigation retained it.

## 2026-08-23 — CLIO-owned TypeScript has an enforceable size boundary

- **Old failure:** Large feature files forced section-by-section searches and made
  cross-cutting behavior easy to miss during review.
- **Decision:** Root lint rejects CLIO-owned TypeScript files above 800 physical
  lines. Source-owned registry directories are exempt so upstream code remains
  upgradeable. Features split by behavior rather than compressing formatting.
- **Acceptance evidence:** The workbench was split into tab coordination and
  resource viewers. Core repository decoders and artifact-custody recovery moved
  into owned modules; the new 800-line ratchet now passes.

## 2026-08-23 — Observability answers questions instead of exposing event payloads

- **Old failure:** Session details were inferred only from transcript cards or
  presented as raw event data. Child work had no useful concurrency view, sources
  were buried inside nested workflow state, and duration bars risked resembling
  invented progress.
- **Decision:** The Session canvas reconciles four authoritative scoped registries:
  asynchronous processes, file diffs, attached context files, and retained context
  frames. ReUI Frames present observed start/update spans as concurrency lanes, with
  an explicit statement that width is time rather than completion. Evidence is
  grouped into changed files, sources, artifacts, plans, and attached context; raw
  workflow payloads never become the interface. The shadcn tab grid follows its
  measured container, switching to two rows when the canvas is narrow, and the
  canvas tab bar aligns with the conversation header before taking over the full
  window in maximized mode. The delegation topology uses `@xyflow/react` with
  Dagre layout, labeled nodes, fit/zoom controls, and no decorative dot field.
  Child nodes preserve the same routing contract as transcript dispatches: normal
  activation opens the central conversation, Shift-click opens a durable canvas
  tab, and a visible “Open in canvas” action provides keyboard and touch parity.
- **Acceptance evidence:** Repository tests assert all four live routes and process
  state normalization. The canonical EarthScope NDP session rendered eight actual
  child-process spans, five artifacts, and three extracted source/provenance records,
  including the National Data Platform and EarthScope URLs. At the same browser
  width, split mode exposed a readable two-by-two tab grid; maximize replaced the
  rest of the shell with one full-width Session canvas and restore returned to the
  central-conversation composition. In the live topology, Shift-clicking
  `geospatial #2` retained the parent URL and opened a canvas tab; activating
  `ndp #2` normally navigated the center to its authoritative child session.

## 2026-08-23 — Data files are tables, with an explicit inline-read budget

- **Old failure:** CSV artifacts and workspace files opened as monolithic code
  blocks. A 50 MB scientific dataset could be fetched and highlighted in full,
  which was both semantically weak and capable of freezing the canvas.
- **Decision:** Native resources and A2UI now share one ReUI Data Grid surface.
  Papa Parse supplies CSV dialect handling and typed cells; the grid supplies
  resizable/sortable columns and pagination. Parsing is capped to 1,000 displayed
  rows and labeled as a preview. Files above 8 MB are not read inline: the canvas
  states the observed size and directs the user to a bounded analysis or
  visualization action without pretending that a sample was available.
- **Acceptance evidence:** The real `earthscope_stations_clean.csv` opened as a
  paginated 1,000-row data canvas with station, coordinate, elevation, network,
  and antenna fields rather than CSV text. Maximizing the canvas exposed the wide
  column set. Opening the 50.4 MB `MTA1.CI.LY_.30.csv` produced the labeled 8 MB
  boundary immediately and did not start an inline read. CSV parser, A2UI catalog,
  workbench, TypeScript, and file-size gates pass.

## 2026-08-23 — Real Luna A2UI lifecycle preserves session scope and causal deletion

- **Old failure:** Hand-authored fixtures could make the renderer appear complete
  while the producer still invented invalid component props and action envelopes.
  The persistent surface store also described IDs as session-scoped while indexing
  them globally, so a disposable session could poison the same surface ID in an
  unrelated conversation. Deleted surfaces were mislabeled as unavailable.
- **Decision:** Codex Luna at medium effort is the production acceptance path.
  Server validation rejects invalid component props, double-wrapped actions, and
  missing registered-action context before persistence. Surface identity is keyed
  by session and surface ID. Deletion retains a tombstone so old transcript
  references say that the surface was removed instead of implying a connection or
  capability failure.
- **Acceptance evidence:** Through the real composer, `gpt-5.6-luna` created a
  surface containing a 30-point shadcn/Recharts plot, adjustable observation
  window, sortable ReUI table, Mermaid SVG, Kibo/Shiki code view, status,
  disclaimer, and Button. Luna then updated that same surface ID; the Button sent
  a real `form.submit` action, the server returned `accepted`, and the acknowledgement
  survived a hard route reload. An official `deleteSurface` message removed the
  renderer live and the reloaded transcript retained the labeled removed state.
  Eleven focused Python persistence/security tests, seven reducer tests, five
  conversation tests, Ruff, and strict TypeScript pass for this slice.

## 2026-08-23 — A2UI maps use a bounded domain adapter over MapLibre

- **Old failure:** A hand-drawn map or a generic JSON card would not provide the
  navigation, selection, and spatial context expected of a scientific product.
  The closest 21st catalog result injected HTML, loaded arbitrary marker assets,
  geocoded from the browser, and only logged failures, so it was not a safe A2UI
  trust boundary.
- **Decision:** `clio.map.v1` is a bounded A2UI domain component backed by
  React MapLibre and MapLibre GL. The server accepts 1–500 labeled coordinates
  with bounded text and valid latitude/longitude ranges. The client owns the
  basemap, style, tile URL, marker implementation, and navigation controls;
  agent-authored styles, URLs, scripts, images, geocoding, and HTML never cross
  the catalog boundary. A visible location list mirrors pointer selection for
  keyboard and touch users and keeps the data understandable without the map.
- **Acceptance evidence:** Real `gpt-5.6-luna` at medium effort produced a
  five-location Chicago-area surface through the live composer. The browser
  rendered actual OpenStreetMap tiles, MapLibre zoom controls, labeled markers,
  a popup, and an adjacent accessible location list. Selecting Station 4 from
  the list updated the pressed marker, popup, and exact coordinate details.
  Server tests reject out-of-range coordinates atomically; catalog, reducer,
  conversation, strict TypeScript, and the 800-line frontend ratchet pass.

## 2026-08-23 — A2UI local actions never cross the server command boundary

- **Old failure:** Every official client action was posted to the session action
  route, including `artifact.open`, `data.select`, and `workflow.focus`. The
  server correctly rejected those client-local names, but the user experienced
  an interactive component as a failed remote command.
- **Decision:** The surface action dispatcher separates client-local navigation
  and focus from registered server actions. `artifact.open` resolves only an
  artifact already owned by the focused session and opens it as a durable canvas
  tab. Data selection and workflow focus remain inside the rendered surface.
  Only registered server actions use the A2UI action REST endpoint.
- **Acceptance evidence:** Component tests prove `artifact.open` invokes the
  local workspace handler without calling the repository, while `form.submit`
  still posts the official versioned action envelope. Conversation integration,
  strict TypeScript, and transport cancellation tests pass.

## 2026-08-23 — Scheduled work is session intent, not a cron administration screen

- **Old failure:** The replacement exposed no schedule management even though the
  service already owned recurring and one-time session turns. Requiring users to
  type commands or edit cron syntax would turn a product workflow into protocol
  administration and obscure which agent context would run.
- **Decision:** Settings presents scheduled work as an instruction attached to an
  existing named session. The primary choice is “Once” or “Repeats,” with daily,
  weekday, and weekly presets. Raw five-part expressions exist only under an
  advanced disclosure. The service-reported time zone and next-run timestamp are
  explicit; no countdown, percent, or client timer implies execution authority.
  Cancellation uses the destructive server route and preserves completed history.
- **Acceptance evidence:** Repository tests decode the authoritative envelope and
  assert exact session-scoped list/create and schedule-scoped delete routes. The
  interaction test creates one-time work, confirms the session identity without a
  raw workspace path, and cancels an existing schedule. Against the live Luna
  service, the screen selected `Disposable Luna A2UI acceptance 3 — default`,
  showed an honest empty state, and rendered repeating presets with the server's
  `America/Chicago` time zone. No live schedule was created during inspection.

## 2026-08-23 — New-session defaults belong to the service, not local storage

- **Old failure:** The new-session dialog always submitted hard-coded edit/auto/ask
  values and copied the currently focused session's model. A settings screen backed
  only by browser storage would look configurable while other products, devices,
  and reconnects continued creating different sessions.
- **Decision:** The service persists model override, effort, blueprint, working mode,
  change style, work routing, and protected-action defaults. Creation applies a
  default only when that field is omitted; an explicit request remains authoritative.
  The UI says “New session defaults,” separates it from the global Models page, and
  explains that existing sessions are unchanged. Model inheritance is the normal
  default, so provider availability remains owned by the active service catalog.
- **Acceptance evidence:** Python tests prove persistence across app rebuild, partial
  update validation, omitted-field inheritance, and explicit-request precedence.
  Core repository and React interaction tests pass. In the live Codex Luna service,
  the settings screen reported `gpt-5.6-luna`, a temporary “Plan before acting”
  default produced disposable session `sess_65845a714e8e` with `mode: plan`, and the
  session was deleted. A hard reload then confirmed “Build and edit” was restored.

## 2026-08-23 — Session behavior is live state, not static header metadata

- **Old failure:** The composer displayed a disabled “Auto” routing button while mode, change
  style, routing, and protected-action review were already mutable session-owned fields. The
  workspace header therefore looked informative but could not adapt the running agent.
- **Decision:** The header uses a compact shadcn session-behavior menu for all four orthogonal
  axes. The AI Elements composer routing control is a real Select backed by the same session
  mutation. All changes reconcile the live entity store from the authoritative response;
  selecting “Bypass checks” requires a separate destructive confirmation.
- **Acceptance evidence:** Core tests assert the exact GACT 0.3 PATCH payload and the interaction
  test covers domain-expert routing plus bypass confirmation. In the canonical EarthScope NDP
  browser session, routing changed from Automatic to Use domain experts in both header and
  composer, survived a full route reload, and was then restored to Automatic.

## 2026-08-23 — Archived sessions remain recoverable without crowding navigation

- **Old failure:** Archiving removed a session from navigation with no replacement discovery or
  restore workflow. Deletion and archival were therefore visually indistinguishable after the
  action completed.
- **Decision:** The shared New menu opens an Archived sessions workspace. It identifies each
  session by session and workspace display name, supports immediate restore, and separates
  permanent deletion behind an explicit destructive confirmation. Full workspace paths remain
  absent from primary identity.
- **Acceptance evidence:** The interaction test proves restore and confirmed deletion and asserts
  that the raw workspace path is not rendered. The real Luna service showed the honest empty
  archive state without fabricating recoverable sessions; live restore/delete evidence remains
  open for a disposable session.

## 2026-08-23 — Model discovery exposes provenance instead of implying a static list

- **Old failure:** Provider settings displayed whatever model list happened to be loaded without a
  user-triggered discovery path or evidence of where and when the list was obtained. This made a
  configured local provider appear equivalent to the active Codex subscription and obscured stale
  or failed discovery.
- **Decision:** The Models screen refreshes only the selected provider through the authoritative
  service route. It preserves the service-reported source, checked time, discovered count, catalog
  delta, and failure. The active provider/model controls remain separate from discovery, so a probe
  never silently changes the model used for work.
- **Acceptance evidence:** Core tests assert the exact selected-provider refresh request and decode
  all catalog deltas and failure fields, plus the report-only forced-handshake route; interaction
  tests render provenance, additions, connectivity, authentication, latency, and model count. In
  the live service, OpenAI Codex remained selected with GPT-5.6-Luna at medium effort while refresh
  returned seven models, zero additions/removals, source `codex_app_server`, and an authoritative
  check timestamp. A separate live handshake then reported connection `ok`, sign-in
  `not_required`, seven models, source `live`, and 328 ms latency without mutating the selection.

## 2026-08-23 — Navigation never advertises a control without a destination

- **Old failure:** Explore included a Usage row styled as a navigation action even though it had no
  route or click behavior. It looked broken and competed with the honest unavailable usage state in
  the session status surfaces.
- **Decision:** Remove the inert row until an authoritative cross-session usage workflow exists.
  Session-local usage continues to display an explicit unavailable state when the service does not
  provide a snapshot; a decorative destination is not a substitute for that contract.
- **Acceptance evidence:** The navigation tree now exposes only actionable Explore destinations,
  while the capability ledger continues to track authoritative usage projection as incomplete.

## 2026-08-23 — Canvas allocation follows measured space instead of static header geometry

- **Old failure:** At a 1280 px browser width the canvas remained mounted and announced as open,
  but the conversation panel's `calc(100% - 420px)` default still occupied the full inner group.
  The canvas was pushed beyond the viewport, the page gained horizontal overflow, and its toolbar
  could not be clicked even though the accessibility tree contained it.
- **Decision:** The conversation panel no longer claims a computed default width. The shared
  resizable group allocates the remaining measured space around the canvas's real 420 px default,
  320 px minimum, and 70 percent maximum. Canvas visibility is derived from container width, the
  user's explicit preference, and a new resource reveal key; query refreshes do not copy layout
  state through an effect. The right canvas remains durable across central-session navigation.
- **Acceptance evidence:** At the same 1280 px viewport, a browser screenshot shows navigation,
  central conversation, resize handle, and the Session canvas simultaneously with no canvas pushed
  beyond the right edge. The plus launcher became pointer-accessible, opened Session artifacts, and
  retained both the historical NDP report and a newly produced document as durable tabs.

## 2026-08-23 — Documents are immutable review workspaces, not generic file previews

- **Old failure:** The replacement could display Markdown as code, but it had no document manifest,
  exact-version review, rendition, working-copy, conflict, or editor workflow. A historical artifact
  also looked equivalent to a current registry record even when its immutable identity could no
  longer be resolved.
- **Decision:** Document artifacts use the service-owned manifest, bytes, reviews, rendition,
  working-copy, conflict, editor-health, and editor-session routes. shadcn Tabs and Dialog compose
  Preview, Reviews, History, and Safety; ReUI Timeline presents review history; AI Elements renders
  Markdown; React-PDF supplies selectable PDF pages with a locally emitted, version-matched worker.
  Text and PDF selections create typed anchors bound to the displayed version and checksum. Native
  and embedded editing operate only on confined working copies whose stable saves create immutable
  revisions. A pre-registry artifact retains its readable workspace fallback while review controls
  explicitly say why they are unavailable.
- **Acceptance evidence:** Core route tests cover manifests, bytes, reviews, renditions, working
  copies, conflict resolution, editor health, and editor sessions. React tests bind the exact quote
  `Bounded claim from the source.` to version 3 and its checksum, then send it through the session
  review route. In the real browser, Codex `gpt-5.6-luna` at medium effort created and registered
  `document-review-acceptance.md`; the canvas displayed v1, checksum prefix `619158ae558b`, the
  rendered Evidence heading and exact claim, created a server-confined working copy, and closed it.
  The historical `LA_GNSS_report.md` stayed readable but reported its missing registry identity.
  Production output includes the actual version-matched PDF worker; 159 core and 77 web tests pass.

## 2026-08-23 — Observability is a canvas tab, not the canvas itself

- **Old failure:** The right column was described interchangeably as an inspector, observability
  view, and destination for files and child agents. That made its ownership unclear, left the
  conversation header visually dominant, and encouraged one-off peek panels instead of durable
  user context.
- **Decision:** The right side is the general workspace canvas. Observability is its non-closeable
  default tab and the floating session-details pill is a compact doorway into that same tab. Files,
  artifacts, blueprints, and Shift-opened child agents are peer durable tabs. Normal child-agent
  activation replaces the central conversation. Every tab retains the workspace and session that
  authorized its resource, even when the central conversation changes. Maximize promotes the canvas
  over navigation, conversation, composer, and their static header; Escape restores the measured
  split layout.
- **Acceptance evidence:** A live browser checkpoint at 1280 px showed the named central session and
  Observability canvas side by side. The maximize control then produced a full-viewport canvas with
  Work, Activity, Evidence, and Context and no residual application header; Escape restored the
  split. Focused canvas tests cover resource launch, maximize, and keyboard restoration.

## 2026-08-23 — Completed agent work summarizes outcomes before wire details

- **Old failure:** A completed reasoning/tool sequence collapsed to the last reasoning phrase, such
  as “Formatting response,” while the actual tool result required reopening the chain and then the
  nested tool. Old sessions without a curated title also exposed identifiers such as
  `fs_read_file`, and wire durations retained noisy floating-point precision.
- **Decision:** The sourced AI Elements chain-of-thought remains the interaction foundation, but its
  collapsed summary prioritizes the latest tool outcome, then task or child-agent outcome, before
  reasoning text. Server-authored MCP/native titles remain authoritative. Historical fallback names
  remove transport namespaces, and known file, command, search, artifact, and analysis-view tools
  derive bounded state-aware summaries from their authoritative inputs/results. Raw parameters and
  outputs remain available one disclosure deeper.
- **Acceptance evidence:** In the live Codex Luna document session, the collapsed chain now reads
  `Agent work — Created document-review-acceptance.md — Completed`; the nested row reads
  `Create artifact — Created document-review-acceptance.md — Succeeded — 674 ms`. The exact input and
  structured registry result remain inspectable. Twelve focused conversation/presentation tests and
  strict TypeScript pass.

## 2026-08-23 — Run operations use durable handles, not table-local state

- **Old failure:** The run explorer listed agent, tool, and relay-backed execution but offered no
  control, no relay status, and no explanation of whether removing a row cancelled work or deleted
  evidence.
- **Decision:** The explorer uses server-owned run handles for detach and dismiss, and the
  authoritative child-agent task ID for cancellation. Cancellation and dismissal require explicit
  confirmation with preservation semantics; every row exposes its action menu without hover.
  Relay reachability appears as labeled remote-execution state above the shared ReUI data grid and
  links to its settings surface. Unsupported remote-job cancellation is not synthesized.
- **Acceptance evidence:** The live service rendered 258 real operational handles with search,
  filters, labeled status, workspace identity, visible row actions, and an honest “Remote execution
  is not configured” state. A failed SPOTTER handle exposed Open conversation and Dismiss without
  mutating it during inspection. Core tests assert the exact encoded detach, dismiss, and
  child-agent cancellation routes; the 800-line ratchet remains green.

## 2026-08-23 — File changes are durable review tabs

- **Old failure:** Session changes were trapped inside an observability accordion; opening a path
  discarded the proposed change and showed only the current file, while apply/reject ownership was
  invisible.
- **Decision:** A changed file opens as a durable canvas tab backed by the authoritative session
  diff. The tab keeps the unified diff, labeled lifecycle state, current-file shortcut, and explicit
  confirmed Apply/Reject actions together. Every mutation carries the originating session and
  workspace so navigating the central conversation cannot retarget an older review tab.
- **Acceptance evidence:** Core tests pin the selected-path apply/reject routes and preserve per-path
  write failures; component tests prove Evidence opens the exact diff in a canvas tab and exposes
  both decisions. Live mutation remains intentionally unexercised until a disposable session owns a
  real pending diff.

## 2026-08-23 — Agent settings manage definitions, not inventory cards

- **Old failure:** The Agents route repeated title, source, model, and counts from the service but
  exposed no lifecycle action even though the registry already supported create, replace, and
  delete. Tool selection also regressed to raw identifiers such as `fs_read_file`.
- **Decision:** Built-in agents are labeled immutable. User agents expose a visible action menu,
  structured editor, searchable service-owned tool selector, and confirmed removal. The complete
  decoded agent definition is round-tripped on update so editing visible copy cannot erase hidden
  instructions, parameters, metadata, capability references, or execution bindings. Friendly tool
  titles are primary; exact identifiers remain secondary.
- **Acceptance evidence:** The live registry showed its built-in main agent and three user agents;
  the Base Agent editor retained its selected tools, enabled saving a legacy empty-instruction
  definition, and presented `Read file` and `Run command` instead of raw names. No live registry row
  was mutated. Core and React tests cover exact CRUD routes, hidden-field preservation, and built-in
  immutability.

## 2026-08-23 — Expert packs are managed agent groups, not blueprint aliases in the UI

- **Old failure:** The service exposed pack lifecycle aliases but the replacement only listed the
  legacy `clio-pack.yaml` discovery rows. Marketplace candidates did not expose whether they were a
  blueprint or a loose expert pack, newly installed `AGENT.md` packs disappeared into the blueprint
  list, and the Expert packs route had no detail or lifecycle actions.
- **Decision:** Marketplace candidates now carry the authoritative `blueprint | pack` discriminator.
  The pack discovery route unifies legacy packs with service-managed `AGENT.md` packs and labels
  lifecycle ownership explicitly. The settings surface filters packs from blueprints, shows their
  specialist agents, supports global or workspace installation, and provides update plus confirmed
  removal only when the service owns the installed files. Manually placed legacy packs stay visible
  and inspectable without misleading destructive controls.
- **Acceptance evidence:** The Python lifecycle test installs a loose pack, then proves list and
  detail discovery with the expected agent. Core tests pin scoped list/detail/validate/install/
  update/delete paths and request bodies. Three focused React tests cover the honest empty state,
  agent details, and marketplace installation. The live Codex `gpt-5.6-luna` service reported one
  marketplace and zero packs; the browser rendered that real empty state with workspace scoping and
  no mutation.

## 2026-08-23 — Tool providers expose owned contents and honest lifecycle boundaries

- **Old failure:** Tools and integrations repeated server names, status, and counts but could not
  open provider contents or exercise the service's connect, reconnect, and disconnect routes.
  Built-ins appeared primarily as `fs` and `shell`, while tool identifiers such as `fs_read_file`
  were easier to see than their provider-supplied titles.
- **Decision:** The settings surface names built-ins by user purpose, keeps exact tool identifiers as
  secondary metadata, and opens provider-owned Tools, Resources, and Prompts in sourced shadcn tabs.
  Service-process connections can be added as a remote service or advanced local command,
  reconnected, and disconnected with confirmation. Built-in and blueprint-owned providers remain
  immutable here. The copy explicitly says runtime connections last for the current service process
  because the backend does not persist them.
- **Acceptance evidence:** The core repository was split before crossing the 800-line ratchet and
  tests pin scoped discovery, detail, remote install, reconnect, inventories, and delete routes.
  Three React tests cover built-in immutability, remote connection, contents, reconnect, and
  confirmed disconnect. The live Codex Luna service rendered Workspace files and Local commands,
  opened the real file provider's three tools, and exposed no destructive control for the built-in;
  no live provider was added or removed.

## 2026-08-23 — Prompt settings edit scoped instructions, not catalog cards

- **Old failure:** The Prompts and commands route repeated family titles, profile counts, and
  availability while hiding the service's profile resolution, provenance, validation, live-context
  render, reload, and scoped-save routes. Packaged prompts looked editable in place even though the
  service correctly treats them as immutable inputs beneath external overrides.
- **Decision:** Prompt families open a structured editor backed by the service-owned profile and
  resolution schemas. Packaged definitions remain unchanged; saving creates an explicit global or
  selected-workspace override. Validation runs before every save, live preview renders against the
  current agents, tools, commands, memory, permissions, provider, and active pack, and complete
  source paths appear only as secondary provenance. Commands expose their supplied title,
  availability, audience, aliases, and usage while file-backed command creation remains owned by
  agents, blueprints, and skills.
- **Acceptance evidence:** Core tests pin scoped list/detail/render/validate/save/reload paths and
  bodies. Three interaction tests cover packaged provenance, validated workspace override save,
  live rendering, and command details. Against the live Codex Luna service the screen rendered
  eight packaged families with six profiles each, opened `Main planner` at its packaged source, and
  expanded its placeholders into the real installed agent tree without mutating any definition.

## 2026-08-23 — Stream completion does not reload an authoritative live transcript

- **Old failure:** After receiving ordered block-completed and message-completed events, the client
  immediately refetched and decoded the entire transcript. In the 1,000-message acceptance case
  that redundant completion work produced 51–56 ms main-thread tasks and could race the last live
  reducer update.
- **Decision:** Ordered GACT 0.3 completion events finish the live entity directly. Completion still
  refreshes session and observability summaries; an authoritative full transcript is fetched after
  cursor gaps and explicit reconciliation, not on every successful turn.
- **Acceptance evidence:** The serial Playwright gate passed three consecutive 100-delta/second,
  1,000-message runs with no task above 50 ms, bounded frame-batched mutations, and a stable bottom
  anchor. The full desktop, mobile/reduced-motion, axe, canvas takeover, and performance suite then
  passed three of three tests.

## 2026-08-23 — Access rules expose the security model and save atomically

- **Old failure:** Permissions showed one-time requests and repeated persistent policy rows, but
  offered no way to author or remove a rule and did not explain ordering, tie behavior, subject
  kind, or the consequence of an empty scope identity. Users could not tell whether a tool, path,
  domain, plan-mode action, or lifecycle hook was actually protected.
- **Decision:** The access-rule editor round-trips the service's tool, domain, file-root, plan-mode,
  and hook discriminators with explicit scope, subject, optional path, priority, modes, and events.
  Higher-priority and restrictive-tie behavior is visible before editing. Create, update, and
  confirmed removal replace the complete policy list through the server's atomic validator, so one
  malformed row leaves all existing protection unchanged. Exact patterns remain visible because
  they define the authorization boundary; workspace display names replace IDs when resolvable.
- **Acceptance evidence:** Core decoding retains every enforcement axis and still strips the
  frontend-only metadata wrapper before PUT. Three interaction tests cover labeled precedence,
  atomic scoped addition, and confirmed removal with audit-preservation copy. The live Codex Luna
  service rendered its existing SPOTTER workspace allow rule, priority, tool/path subjects, and
  complete editor state without applying a mutation.

## 2026-08-23 — Service commands are composer actions, not synthetic user messages

- **Old failure:** Commands existed only as settings inventory. Typing a slash command into the
  composer either sent protocol text as an ordinary user message or required the user to remember
  exact identifiers and arguments without knowing whether the connected service supported them.
- **Decision:** The composer queries the session- and workspace-scoped command catalog and uses the
  sourced AI Elements command surface for discovery. Provider titles and argument guidance are
  primary, exact command IDs remain visible, aliases resolve to canonical IDs, and disabled
  commands expose the service's reason. Submission calls the authoritative command route; unknown
  or unavailable commands never fall through to chat. A successful command then reconciles the
  transcript, session summary, and Observability tab because commands such as clear and trace dump
  may intentionally change those registries.
- **Acceptance evidence:** Repository tests pin the exact dispatch route, caller identity, and
  argument body. Three composer tests cover discovery and alias resolution, unknown-command
  containment, and disabled explanations. In the disposable Codex `gpt-5.6-luna` session, the live
  menu exposed seven service commands with supplied descriptions, labeled `/optimize` unavailable,
  executed non-destructive `/cache-stats`, rendered its returned system message, advanced the live
  cursor, cleared the composer, and restored input without touching NDP or SPOTTER histories.

## 2026-08-23 — Running work remains steerable without hiding Stop

- **Old failure:** As soon as a session entered `running`, the textarea was disabled and the single
  submit affordance became Stop. That concealed the backend's safe-boundary steer contract and
  forced a false choice between interrupting useful work or waiting for the entire turn to finish.
- **Decision:** The AI Elements composer stays editable during a live turn. A labeled Working state
  explains that new input joins at the next safe boundary, a visible Steer action submits that
  direction through the normal authoritative message route, and Stop remains a separate adjacent
  action. The client does not insert an optimistic user message: the service persists and streams
  the steer only when its inbox consumes it. Failed steering retains the draft and reports the
  service error.
- **Acceptance evidence:** Component coverage proves the running textarea, disabled-empty/enabled-
  populated Steer action, independent Stop action, and exact submitted direction. In the disposable
  Codex `gpt-5.6-luna` session, a second instruction was submitted while the first turn was running,
  appeared once as an authoritative user message, redirected the ongoing provenance investigation,
  survived a one-time inspected approval, and completed with the requested immutable artifact URI.

## 2026-08-23 — Global search opens work instead of listing routes

- **Old failure:** `Ctrl/Cmd+K` opened three static navigation rows and its local shadcn
  `CommandDialog` omitted cmdk's required `Command` provider, so the palette could become inert or
  crash. Showing every historical session would also promote probe and fan-out noise over the
  current scientific work.
- **Decision:** The repaired sourced command composition now presents the active workspace's pinned
  or seven-day-recent sessions by default. An explicit query searches all session titles, current
  file names and artifacts, and the server-owned cross-session memory index. File and artifact hits
  open durable canvas tabs; memory hits retain their service title, role, match provenance, session,
  and message identity, then navigate and focus the exact virtualized transcript row. No client-only
  transcript index or raw event browser is introduced.
- **Acceptance evidence:** Core tests pin message, workspace-memory, and semantic-context search
  routes and scopes. Command-menu tests cover real canvas launches and exact-message navigation;
  conversation coverage proves a hash target scrolls and receives focus even through
  virtualization. Against the live Luna service, the default menu showed only the disposable review
  and canonical EarthScope NDP sessions, an `immutable artifact URI` query returned provenance-rich
  matches from the authoritative index, and selecting the steer message produced its exact session
  URL and message fragment.

## 2026-08-23 — Observability summarizes repetition without erasing history

- **Old failure:** A long-running scientific session rendered every completed wait as another
  full-size Work card. Seven semantically identical `Wait agent tasks` operations displaced the
  actual child processes, evidence, and failures even though their individual timestamps still
  mattered in the audit trail.
- **Decision:** The default Observability tab groups only terminal operations whose supplied title,
  state, and human-readable outcome are identical. The Work summary keeps one complete operation
  and a labeled call count; active operations never group, and Activity continues to expose every
  authoritative record. A child tab whose conversation is already central now says `Central view`
  instead of offering a no-op navigation action.
- **Acceptance evidence:** Focused coverage proves three repeated terminal operations become one
  `3 calls` Work summary while a running operation stays independent. In the canonical EarthScope
  NDP session, Observability rendered one labeled `Wait agent tasks — 7 calls` summary and retained
  the child-process topology and peer canvas tabs. Opening `analysis #1` in the canvas, promoting it
  to the center, and keeping its durable tab established the central-versus-canvas contract against
  real child-session data.

## 2026-08-23 — Context is an inspectable session compartment

- **Old failure:** The Context tab reduced the server's working set to a percentage and two counts.
  It discarded the effective read policy, automatic-compaction threshold, live block inventory,
  retained frame inputs, file destinations, and manual compaction operation. A user could not tell
  what the agent could recall, what was actually retained, or why a context action was unavailable.
- **Decision:** The canvas preserves the complete server-owned context snapshot and pairs it with
  the effective session-compartment policy. It labels session-only writes, explicit-intent
  cross-session recall, the service's compaction threshold, live block count, token categories, and
  retained frame inputs. Attached files and file-backed frame items open in peer canvas tabs.
  Manual compaction is confirmation-gated and enabled only when the selected service scope contains
  live blocks; the server chooses and returns the faithful summary. The live stream controller owns
  context refresh after completion and authoritative reconciliation after cursor gaps.
- **Acceptance evidence:** Core coverage pins the policy and compact routes and preserves segment,
  render, and token-kind fields. Component coverage proves policy explanation, retained-file
  navigation, confirmation, and the empty-scope disabled state. The canonical EarthScope NDP
  browser checkpoint showed its 922,000-token window, `main` scope, zero live blocks, 85% automatic
  threshold, explicit cross-session consent policy, and disabled compaction without mutating the
  session. The route/transport split reduced the workspace composition from 798 to 659 lines, and
  the navigation pocket no longer leaks horizontal overflow at the checkpoint width.

## 2026-08-23 — Component reuse is a build contract, not a visual suggestion

- **Old failure:** Major surfaces imported a registry primitive and then rebuilt most of the actual
  product interaction in CLIO-owned JSX. Artifact metadata in particular was repeated across the
  transcript, inspector, Observability, and canvas, while image artifacts exposed URI-shaped rows
  instead of the sourced media preview. The two central composition files had also grown to 774 and
  772 lines, making ownership and source provenance difficult to review.
- **Decision:** The frontend now has an explicit reuse ledger and an executable import ratchet for
  20 major surfaces. Professional components own their intended presentation and interaction;
  CLIO adapters are limited to GACT entity mapping, authorization, mutations, and workspace
  routing. Artifact presentation is one shared adapter over AI Elements Artifact and Attachments,
  and its image path uses the official media preview. Document source and effective-prompt previews
  use the official Code Block rather than raw `pre` elements. Agent work and resource browsing
  moved into behavior-owned modules, reducing the central conversation and workbench files to 616
  and 459 lines. A sourced categorical Select replaces the repeated reasoning-effort card strip.
- **Acceptance evidence:** Focused reuse tests pass 26 of 26 without console warnings. TypeScript
  and the 800-line size ratchet pass after the behavioral splits. The canonical EarthScope NDP PNG
  renders in the transcript, Evidence gallery, and a durable canvas tab. Its retired registry entry
  recovers through the server-enforced workspace file route while unavailable version history stays
  explicitly labeled. `pnpm check:frontend-reuse` fails if a catalog-backed major surface silently
  loses its required AI Elements, ReUI, TheoKit, or shadcn composition.

## 2026-08-23 — Workspace navigation is one compact project interaction

- **Old failure:** Workspace disclosure lived in a tiny independent chevron, the name still behaved
  like selectable text, workspace and session rows used different heights and insets, and basic
  project identity was hidden in a narrow overflow menu. At practical sidebar widths the hierarchy
  consumed too much horizontal and vertical space while the useful actions became harder to reach.
- **Decision:** The full 32px workspace row is the pointer and keyboard disclosure target; its
  chevron is a passive state cue and the overflow action is event-isolated. Workspace and session
  rows now share the same compact height and action baseline, with a restrained child rail providing
  hierarchy. The sourced shadcn Hover Card exposes the display name, authoritative session/active
  counts, permitted folder, and direct create, rename, and access-settings actions. Full paths remain
  secondary metadata rather than primary labels.
- **Acceptance evidence:** In the live canonical SPOTTER workspace, click and Enter both collapsed
  and expanded the full row. Opening the overflow menu left disclosure unchanged. At the 217px
  navigation width, workspace and session rows remained 32px tall, the scroll container stayed at
  `scrollLeft: 0` with equal client and content widths, and the project card opened beside the rail
  with real SPOTTER identity and actions.

## 2026-08-23 — Conversation detail is a projection, never a different history

- **Old failure:** The compact AI Elements Chain of Thought grouped reasoning, progress, tools, and
  delegated work into an effective evolving turn, but offered no direct path to the original
  reasoning/text/tool sequence. Users had to accept the summary grammar or leave the conversation
  for a separate observability surface, even though the complete causal blocks were already loaded.
- **Decision:** Conversation activity has two user-owned projections over the same ordered domain
  blocks. `Chain of thought` is the compact default and exposes a visible, keyboard-accessible
  `Full activity` action on the chain. `Full activity` renders every reasoning, text, tool, task,
  child-agent, UI, and artifact block directly with its sourced AI Elements component, and offers
  `Condense` for the turn. Appearance settings persist the user's default locally; switching modes
  never changes backend state, event order, authorization, or the recoverable transcript.
- **Acceptance evidence:** Focused component coverage exercises compact-to-full-to-compact turn
  switching. In the disposable Codex `gpt-5.6-luna` scientific-analysis session, the compact chain
  opened into two independently expandable Reasoning blocks, the complete progress text, sourced
  tool summary, five-tab A2UI surface, and final answer in causal order. The Appearance setting
  reactively changed the session default in both directions, and the original compact preference
  was restored after the browser checkpoint.

## 2026-08-24 — Desktop settings expose native truth before native acceptance

- **Old failure:** The desktop settings route was a static promise that treated every named native
  integration as available whenever the page ran inside Tauri. It had no update workflow and could
  not distinguish implemented transport, tunnel, or shell code from missing secure credentials and
  sleep/wake recovery. Stale documentation still pointed at removed `apps/web`, `apps/desktop`, and
  emulator paths.
- **Decision:** The settings route now reports each native capability independently. Implemented
  REST/SSE transport, the SSH tunnel engine, and menu/tray integration are labeled as installed-app
  features in the browser; secure credential storage and sleep/wake recovery remain explicitly not
  available. The official Tauri updater and process plugins provide an on-demand signed-update
  check, download progress from real byte events, installation, and relaunch. The UI never invents
  a percentage when the server omits content length and never offers native mutation in a browser.
  Active package paths and the sidecar launcher module now match the root-level `web/` and
  `desktop/` structure.
- **Acceptance evidence:** The focused updater test covers version discovery, byte progress,
  resource cleanup, and relaunch; the desktop smoke contract covers plugin configuration, Rust
  registration, the root-level launcher module, and Tauri SSE isolation. TypeScript and targeted
  lint pass. The live browser checkpoint shows three `Installed app only` capabilities, two
  labeled `Not available` capabilities, a browser-only explanation, and a disabled update action.
  Native installation and signed-feed behavior remain an open acceptance gate.

## 2026-08-24 — Tool catalogs lead with purpose and preserve provider identity

- **Old failure:** The available-tools frame remained unexplained and empty during a multi-second
  live catalog load, then replaced the blank area with full backend docstrings and always-visible
  implementation identifiers. GACT also dropped curated MCP titles from several live catalog and
  inventory projections even though the execution path already preserved them. Relay settings
  exposed an internal reason code and raw configuration key names to every user.
- **Decision:** GACT tool rows retain the upstream MCP title in bundled, runtime, declared, live,
  detail, and provider-inventory paths. The settings catalog uses that authoritative title first,
  renders a concise task-oriented purpose, and keeps the exact identifier plus full provider
  documentation behind a keyboard-accessible shadcn Collapsible. The frame has explicit loading,
  empty, and failure states. Relay failures are mapped to user-facing guidance and labeled missing
  connection concepts while the server reason remains available only to diagnostic surfaces.
- **Acceptance evidence:** Focused server tests prove provider titles survive runtime and external
  streamable-HTTP catalogs and details. Five focused React interactions cover loading, disclosure,
  provider inventory, connect, reconnect, and confirmed disconnect. In the live Luna browser, four
  tools rendered as compact purpose rows; opening `Read file` revealed its exact identifier and
  complete provider documentation without altering neighboring rows. The Relay checkpoint exposed
  access credential, job service address, and control service address while containing no internal
  `relay_tools_not_configured` text.

## 2026-08-24 — Appearance choices change the workspace, not just the form

- **Old failure:** Appearance stopped at theme and conversation-activity projection. Users could
  not explicitly reduce motion for CLIO, and the transcript remained pinned to one reading width
  even when scientific diagrams, tables, and long-form artifacts needed more room.
- **Decision:** A local appearance owner now persists and reactively shares two presentation-only
  preferences. Motion either follows the operating system through Motion’s `user` behavior or is
  reduced unconditionally through `always`; it never offers an override that defeats an operating
  system accessibility preference. Conversation width switches the real virtualized transcript and
  detached A2UI surface containers between focused and wide layouts. Neither preference changes
  backend state or causal content.
- **Acceptance evidence:** Focused provider coverage proves persistence and cross-context reactive
  updates; the existing nine conversation cases remain green under the new provider. In the live
  browser, selecting Wide and Reduce motion updated both radio groups immediately, navigation to the
  canonical Luna session rendered the Conversation container with `max-w-6xl`, and restoring
  Focused plus Follow system updated the controls without reload.
## 2026-08-24 — Split workspace widths reflow the composer instead of clipping it

- **Old failure:** Expanding the workspace canvas to 648 px correctly preserved the
  conversation's 400 px minimum, but the viewport-based composer controls remained on
  one line. The effort selector was cut off even though the canvas divider and all
  underlying controls were working.
- **Decision:** The AI Elements prompt tools remain the sourced controls, while CLIO's
  composition lets the tool group consume the available row and wrap as a unit. Routing
  and model stay together when possible; effort moves to the next line before any control
  is clipped, and Submit remains visible.
- **Acceptance evidence:** In the live Luna acceptance browser at a 1,280 px viewport,
  navigation resized from 229 to 399 px with workspace/session menus still reachable.
  The canvas expanded to 648 px beside a 400 px conversation; the composer measured
  352 px wide, reflowed to 189 px high, and kept routing, model, effort, and Submit fully
  inside its bounds. The CLIO-owned 800-line ratchet also passes after provider contracts
  and their repository tests were split by behavior.

## 2026-08-24 — Selection menus open beside their controls

- **Old failure:** The shared shadcn Select used item-aligned positioning, placing the current
  option directly beneath the pointer. A normal click opened and immediately re-selected that
  option, so Provider, Model, Reasoning effort, and other settings appeared inert even though
  keyboard activation worked. The resulting menu also covered the field label and page heading.
- **Decision:** CLIO keeps the sourced Radix Select behavior and uses its supported popper
  position with start alignment by default. Menus now open from the trigger edge, preserve their
  existing keyboard behavior, and avoid treating the opening click as a selection.
- **Acceptance evidence:** On the live Models settings page, an ordinary pointer click opened all
  ten provider choices below Provider, the seven Codex models below Model, and the four labeled
  effort choices below Reasoning effort. Space still opened the focused control, Escape dismissed
  it, and no persisted model setting changed during the checkpoint.

## 2026-08-24 — Settings control groups own an explicit responsive width

- **Old failure:** The Expert packs install controls lived in a shrink-to-fit FieldGroup that was
  also a CSS size container. Its intrinsic inline size was therefore zero, so the visible select
  overflowed its parent, clipped against the viewport, and created a document-level horizontal
  scrollbar at the standard 1,280 px acceptance width.
- **Decision:** The ReUI Frame and shadcn Field composition remains intact. This settings surface
  gives the size-contained control group an explicit responsive width for its one- and two-field
  states, while the descriptive side is allowed to shrink and wrap.
- **Acceptance evidence:** In the live Expert packs page, the one-field state measured 176 px and
  the two-field state 412 px. Both remained inside the 880 px frame; document and body scroll width
  matched the 1,265 px client width, and switching between Every workspace and One workspace did
  not introduce horizontal scrolling or clip either control.

## 2026-08-24 — Permission summaries translate wildcard syntax

- **Old failure:** Access-rule cards projected backend wildcard fields as `*, *`. The exact values
  were necessary in the security editor, but meaningless and visually noisy in the ordinary rule
  summary.
- **Decision:** Permission cards translate wildcard domain, file, tool, and path patterns into
  labeled product meaning such as `All tool actions in all permitted locations`. Specific patterns
  remain explicitly labeled, and the edit dialog continues to expose the exact backend values
  because they define the authorization boundary.
- **Acceptance evidence:** The live workspace rule changed from `*, *` to the full labeled sentence.
  Opening Edit access rule still showed `*` in both Tool name pattern and Limit to file paths, with
  the original workspace scope and priority unchanged.

## 2026-08-24 — Memory state describes user impact, not storage enums

- **Old failure:** Session retention displayed the raw lowercase threshold `normal`, and retained
  summaries exposed storage values such as `stored` and `gact_compact` as primary language.
- **Decision:** The Memory surface maps threshold and compaction records to their operational
  meaning: `Within context budget`, `Approaching context limit`, `Retained`, and `Service
  compaction`. Exact recorded status and source remain supplemental title metadata on historical
  records.
- **Acceptance evidence:** The live SPOTTER memory view now shows `Within context budget` beside
  the real 100,798 retained tokens and 922,000-token budget, while retaining the service's full
  no-compaction recommendation for focus and hover users.
