# Interactive UI for the IOWarp Stack: MCP Apps from clio-kit to clio-agent

**Design brief — June 27, 2026**

## Purpose

This document scopes adding interactive, in-conversation UI to the IOWarp agent stack using the MCP Apps extension. It runs the full path: what the standard is and how it works, where to add the optional UI layer on the clio-kit MCP servers, a worked case study on the geo server, what host-side support requires in clio-agent and gact-tui, and the transport decision that the bridge requirement forces. It records the recommendations reached so the work can be sequenced without re-deriving them.

The short version: the server side is low-friction and the clio-kit servers are good candidates. The host side is where the real design work lives, specifically in the GACT wire contract, and the right move there is a scoped duplex sub-channel rather than a transport rewrite.

## 1. Background: MCP Apps and MCP-UI

Two names matter and they are now related rather than competing. MCP-UI is the community project that pioneered interactive interfaces over MCP, created by Ido Salomon and Liad Yosef and adopted at Postman, Shopify, Hugging Face, Goose, and ElevenLabs. MCP Apps is the official MCP extension (SEP-1865) that standardized those patterns. It was co-authored by Anthropic, OpenAI, and the MCP-UI maintainers, proposed in November 2025, and went live as the first official MCP extension in late January 2026. For new work you target MCP Apps; the `@mcp-ui/*` packages are the recommended SDK for doing so and remain a playground for features ahead of the ratified spec.

The official extension is narrower than MCP-UI's full surface. The initial spec supports only `text/html` rendered in a sandboxed iframe. External URLs, remote DOM, and native widgets are deferred to later iterations, while MCP-UI itself still supports the broader set. Current clients include Claude, Claude Desktop, VS Code Copilot, Microsoft 365 Copilot, Goose, Postman, MCPJam, and Archestra, with Goose as the reference host.

### Alternative for context: Google A2UI

Google's A2UI (announced December 2025) answers the same question with the opposite tradeoff. MCP Apps ships executable HTML/JS and contains it in a sandboxed iframe. A2UI ships a declarative JSON component tree that the client renders with its own native components, so security comes from restricting the agent to a trusted catalog rather than sandboxing code. A2UI gives native look, cross-platform rendering, and a model-generated UI, at the cost of an expressiveness ceiling set by the component catalog. It is Apache 2.0, pre-1.0, and already used in Opal, Gemini Enterprise, and the Flutter GenUI SDK. Google has published "A2UI over MCP" patterns, so the two are combinable. For this stack, MCP Apps is the default because clio-kit is already MCP-native and the views in question are pre-authored and visually specialized. A2UI is the option to revisit if the agent should compose UIs on the fly or render outside a chat host.

## 2. How MCP Apps works

The mechanism is deliberately small and rests on two primitives layered on things MCP already has.

A **UI resource** is served under the `ui://` scheme, a normal MCP resource carrying an HTML page with bundled JS and CSS. A **pointer** on the tool, `_meta.ui.resourceUri`, references that resource. That one field promotes an ordinary tool into an App-capable one.

The lifecycle at call time has four steps. Because the resource URI lives in the tool description, the host can preload the resource before the tool runs and stream tool inputs into it. The host fetches the `ui://` resource. It renders the HTML in a sandboxed iframe, where `_meta.ui.permissions` requests capabilities like camera or microphone and `_meta.ui.csp` controls external origins. Finally the app and host communicate over a JSON-RPC dialect: some methods are shared with core MCP such as `tools/call`, some are similar such as `ui/initialize`, and most are new under a `ui/` prefix.

The transport detail that drives the rest of this document: inside the iframe the transport is `postMessage`, not stdio or HTTP. The iframe never talks to the server directly. It posts to the host, the host routes back to the server as a normal `tools/call`, and the result returns the same way. That indirection is the security model. UI-initiated actions ride the same audited path as direct tool calls, and the sandbox blocks the app from the parent DOM, cookies, and storage.

### SDK surface

Server side, the resource is created and the tool is tagged. App side, the JS in the iframe uses an `App` wrapper that performs the `ui/initialize` handshake, receives tool results through an `ontoolresult` callback, calls back into the server through `callServerTool`, and writes user actions back into the conversation through `updateModelContext`. The `updateModelContext` call is what keeps the model aware of interactions; without it the UI is a dead end the model cannot observe. The `App` class is a convenience wrapper, and the `postMessage` protocol can be implemented directly when tighter control or zero dependencies are wanted.

### FastMCP support

This matters because the clio-kit servers are FastMCP. FastMCP 3.0 added protocol-level MCP Apps support: extension negotiation, typed UI metadata on tools and resources, the `ui://` scheme, and `ctx.client_supports_extension(UI_EXTENSION_ID)` for capability detection. FastMCP 3.2 added ergonomic helpers (`@mcp.tool(app=...)`, `AppConfig`, `ResourceCSP`, Prefab components) plus an explicit raw-HTML path that the docs call out for dropping in a map or 3D viewer. The geo server already pins `fastmcp>=3.0.1`, so the plumbing is present in the version in use. The raw-HTML map path needs `pip install "fastmcp[apps]"` and the `@modelcontextprotocol/ext-apps` JS SDK inside the page; Prefab is not required for a hand-written page.

## 3. Server side: the optional UI layer in clio-kit

### The capability pattern

In MCP Apps the tool's return value is the text fallback. A text-only host ignores the `_meta.ui` it does not understand and shows the returned data; an app-capable host renders the resource and pushes the same data into the iframe. The dual behavior is the default of a single app-tool, not something to engineer. FastMCP's `ctx.client_supports_extension(UI_EXTENSION_ID)` exists for a different goal: sending a *different* payload to the two client types, for example a full feature collection to the iframe and a compact summary to text clients. For small payloads, always returning the data and declaring the UI is correct; the branch is for heavy payloads.

### Case study: the geo server

The geo server is a strong first target and a good illustration. It exposes `geocode` (returns lat/lon), `render_feature_map`, `points_in_polygons`, `bounding_box`, `query_arcgis_features` (up to 200 features), and `filter_points_by_radius`. `render_feature_map` already builds a real basemapped map, but it rasterizes GeoJSON layers through matplotlib and contextily into a static PNG with CartoDB Positron tiles and returns a file path plus bounds. The user gets a flat image with no zoom, pan, or clickable marker.

The conversion is clean because `render_feature_map` already computes the two things an interactive map needs: GeoJSON layers and a bounding box. Instead of rasterizing, serve a `ui://` HTML resource that loads Leaflet (matching the existing CartoDB raster tiles) or MapLibre GL (for smooth vector zoom), pass the GeoJSON and bbox as the tool result, and let the map library handle zoom, pan, and markers natively. The bbox each match already carries is what Leaflet's `fitBounds` consumes, so zoom-to-result is free. Keep the PNG as the fallback through `client_supports_extension`, and keep the GeoJSON out of the model's context by sending it to the iframe rather than the prompt, which matters for the 200-feature `query_arcgis_features` payloads.

The first failure to expect is CSP. A slippy map makes outbound requests for basemap tiles and for the Leaflet library, and the sandbox blocks them unless `_meta.ui.csp` whitelists those origins or the library is bundled inline. A map that renders with controls but no tiles is almost always CSP.

One design point applies beyond geo. `geocode` is frequently plumbing: the model calls it to turn a place name into coordinates to feed `bounding_box` or `filter_points_by_radius`. Rendering a full interactive map on every call is noise, and capability detection does not fix it because the client does support apps; the map is simply unwanted for an intermediate lookup. The cleaner factoring is to leave `geocode` as a data tool and add a separate presentation tool (for example `show_location`) that carries the `AppConfig`. That keeps tool intent legible and avoids surprising pipeline calls with UI. The general rule: presentation and plumbing should be separate tools.

### Target inventory

Surveying the clio-kit MCP servers, the strongest UI targets are where current output is either a static artifact that cannot be interrogated or a firehose of structured data, and where the human needs to explore rather than read.

**First tier.**
- **darshan** (HPC I/O profiling): `get_timeline_analysis`, `analyze_file_access_patterns`, `get_io_performance_metrics`, `identify_io_bottlenecks`, `compare_darshan_logs`. The canonical interactive-viz case and central to IOWarp's domain. A zoomable I/O timeline, per-rank and per-file heatmaps, a clickable bottleneck list, and side-by-side log comparison. Largest context-window win because logs are large. Build first.
- **plot**: `line_plot`, `scatter_plot`, `histogram_plot`, `heatmap_plot`, `plot_timeseries`. Its entire job is visual output and it emits static PNGs. Plotly or uPlot in the iframe yields zoom, pan, hover, and legend toggling with minimal new logic. Doubles as the reusable chart component.
- **slurm**: `list_slurm_jobs`, `get_queue_info`, `get_node_info`, `get_allocation_status`. The "replace the static dashboard" case. A sortable, filterable job table and node grid, with a natural callback loop: click a job, fire `cancel_slurm_job` or `get_job_output`, feed the selection back to the model. Proves the bidirectional channel.

**Second tier.**
- **pandas**: maps onto an interactive data table, with `correlation_analysis` as a heatmap and `profile_data` as an inline report. Large context win.
- **hdf5**: a navigable group tree from `list_keys`/`visit`/`get_by_path`, with dataset previews from `read_partial_dataset`. h5web is the reference for interaction patterns.
- **chronolog**: a time-filterable event timeline and a live status panel, worth doing to dogfood the system and pair with the ATW and timestamping work.

**Niche but legitimate.** seismic and sac (waveform zoom/pan), node-hardware (topology diagram plus health dashboard), adios (a step slider over time-stepped variables), arxiv (a results browser with bibtex export on a button).

**Not first.** paraview (already screenshot-based; true interactivity means streaming a real viewport, a large lift), terrain (3D cost), compression, parallel-sort, lmod (cosmetic UI value), jarvis (a visual pipeline DAG editor is a strong interaction case but the highest-effort build, so a later flagship).

### Reusable components

The targets collapse onto about four parameterized `ui://` resources rather than 21 bespoke UIs:

| Component | Servers it serves |
|---|---|
| Chart | plot, compression, darshan metrics, node-hardware sensors |
| Data table | pandas, parquet, slurm job lists, hdf5 dataset previews |
| Map | geo, geojson, terrain |
| Timeline | chronolog, darshan I/O timeline, adios steps |

Build those four well and most servers point `_meta.ui.resourceUri` at the right one and shape their result to match. This also keeps the text fallback trivial, since each tool's return is the data the component would render.

Suggested server sequence: plot first (proves the chart component and the CSP and handshake plumbing with almost no domain logic), then darshan (highest value, reuses chart plus adds timeline), then slurm (proves the callback loop with the table). After those three only the map type is untouched, and the geo work covers it.

## 4. Host side: clio-agent and gact-tui

This is a separate problem from the server work. The servers emit UI; the host has to render it.

### Architecture as found in the code

clio-agent is a Python backend built on the Claude Agent SDK and FastMCP. It connects to MCP servers with `fastmcp.Client` over stdio and http transports and mounts each one behind a `FastMCP.as_proxy(Client(...))` gateway (FastMCP 3.2, where `as_proxy` is now `create_proxy`). The agent talks to that single aggregating gateway. Its GACT layer exposes an HTTP API under `src/clio_agent/gact/routes/` (agents, blueprints, catalog, sessions, messages, mcp, permissions, and more), with `ui/api.py` and `ui/cli.py` as the local surface.

gact-tui is a separate Go monorepo, "Generic Agentic TUI," that defines a wire contract (GACT v0.2, REST plus SSE) and builds thin frontends against it. The frontends are `apps/web` (Vite plus SolidJS), `apps/desktop` (Tauri 2 with a sidecar launcher for the clio runtime), and the Go `tui/`. Adapters exist for claudecode, crush, goose, opencode, and the claude-agent-sdk-server, with clio-agent as the reference backend implementing 28 of 30 v0.2 capabilities. The contract models parts as an extensible discriminated union: an unrecognized `type` is preserved through round-trips and rendered as a placeholder rather than failing. There is no UI-resource part type today, and the capabilities endpoint gates every feature so frontends can detect support.

The desktop detail is favorable. Tauri 2 is a system webview, so it can render an iframe exactly as the browser does. Desktop is not a separate rendering problem from web; it is the web renderer inside a native shell, plus Tauri configuration.

Two findings from the code define the gaps precisely. First, the execution bridge's `MCPClientProtocol` declares only `list_tools` and `call_tool`, with no `read_resource`. The current tool path cannot fetch a `ui://` resource at all; that is a named code gap. Second, the permission gate, tool interceptor, and observer are already process-global hooks the GACT layer installs, so UI-initiated calls have a consent path ready to reuse.

### What support requires, by layer

**clio-agent (the MCP client).** Negotiate the Apps extension at initialize so servers emit UI, fetch the `ui://` resource and its CSP and permissions when a tool result carries `_meta.ui.resourceUri`, and proxy the bridge by relaying UI-initiated `callServerTool` to the right server and `updateModelContext` into the session. The fetch-and-attach is small. The bridge proxy is coupled to the contract work below. The bridge protocol needs a `read_resource` path added so `ui://` can be fetched.

**The GACT contract (v0.2 to v0.3).** Add a `ui_resource` part that mounts the app, carrying the HTML or a fetch URL, the mime, the CSP, the permissions, and the text fallback. The extensibility rule means old frontends degrade with no change. Add a `ui_bridge` capability flag so frontends detect support the same way they gate everything else, plus conformance tests. The bridge channel design is covered in section 5.

**The frontends.** Web (Solid) is the native fit: a sandboxed iframe, CSP from the contract metadata, `postMessage` bridged to the contract's channels. Pull `@mcp-ui/client` or the ext-apps host glue rather than hand-rolling the protocol. Desktop inherits that renderer; the only desktop-specific work is Tauri configuration, allowing the iframe and the apps' external origins in the webview CSP, and keeping the untrusted MCP HTML in a plain sandboxed iframe with no `@tauri-apps/api` injection so server HTML can never reach `invoke`. That isolation is the main security concern on desktop. The Go TUI cannot render HTML and does not need to: the text fallback covers it, with an optional "open in browser" hand-off later.

## 5. The transport decision

### The structural observation

Everything downstream of the GACT contract is already JSON-RPC: the FastMCP client, the proxy gateway, the clio-kit servers, and the MCP Apps bridge. The REST plus SSE contract is the only non-JSON-RPC hop in the stack, sitting between an all-JSON-RPC backend and the frontends. The UI bridge is the first feature that makes that seam hurt, because it is the first inherently duplex, server-initiated-to-UI traffic in the system.

This has a payoff. Because both ends already speak the bridge's native protocol, the bridge wants to be a tunnel, not a translation. The contract does not have to model every `ui/*` method as a GACT part and map it onto REST plus SSE. GACT parts model the agent conversation; the app's iframe-to-host JSON-RPC can ride an opaque bidirectional frame channel that GACT relays. The v0.3 delta then shrinks to two things: a `ui_resource` part to mount the app, and one opaque duplex frame channel for the bridge.

### Recommendation

Do not replace the contract with RPC. REST plus SSE is what makes GACT usable: curl-debuggable, simple reconnects, and a low enough bar that five adapters exist. The agent loop gains little from duplex and forcing WebSockets on every adapter taxes every adapter author for a feature not all of them implement.

Do not emulate duplex over POST plus SSE-correlated-by-id for the bridge either. For a high-frequency, mid-turn interactive channel that is the wrong amount of cleverness.

Add a capability-gated duplex sub-channel scoped to the UI bridge. A per-app-instance WebSocket or WebTransport, opened only when the `ui_bridge` capability is advertised and an app mounts, carrying the MCP Apps JSON-RPC nearly verbatim. Backends without apps never open it; adapters that do not care never implement it. The core contract stays REST plus SSE and v0.3 adds an optional duplex lane. Because the lane is a tunnel it is protocol-agnostic and not UI-specific, so it can generalize later.

The criterion for going further, to make duplex the primary transport, is whether the UI bridge is the first of several duplex features or an outlier. If MCP sampling and elicitation surfaced to the user, interactive permission negotiation, multi-user sessions, or streaming tool input are on the roadmap, duplex becomes load-bearing across the contract and the UI bridge is a reasonable trigger to start. If it is the only duplex feature foreseen, scope it to the sub-channel. The lean is to build the scoped lane now, design it to generalize, and let the roadmap decide if it graduates.

One clarification to hold onto: changing transport is not adopting MCP as the contract. GACT deliberately models sessions, routing, memory, and diffs that MCP does not. The duplex question is purely transport, independent of the schema. The part and session model stays either way; only the wire for the duplex-needing bits changes.

## 6. Open questions and next steps

**Two things to settle before committing on the host side.**
1. Whether `FastMCP.as_proxy` preserves `_meta.ui` on re-exposed tools. This is the one question not answerable from the clio-agent repo, since the behavior lives in FastMCP. Check against the pinned FastMCP version.
2. Adding a `read_resource` path to the execution bridge's `MCPClientProtocol`, so `ui://` can be fetched at all.

**Sequencing.**
- Server side: plot, then darshan, then slurm, building the chart, timeline, and table components and the map via geo.
- Host side: contract v0.3 first (design-led, unblocks all frontends), then clio-agent backend validated against one clio-kit app (geo map or plot is the cheapest end-to-end proof), then web via `@mcp-ui/client`, then desktop (web renderer plus Tauri CSP and iframe isolation), with the TUI on text fallback until the browser hand-off is judged worth it.

**Effort.** Web and desktop are a few days each on top of the renderer once the contract carries the resource, because Tauri makes desktop a configuration and isolation problem rather than a rendering one. The contract bump and the bridge lane are where the weeks are, and they are shared work that benefits every frontend and adapter.

## Appendix: components and sources

Reusable UI components and their server mappings are in section 3. Key external references used in this brief: the MCP Apps extension specification (SEP-1865) and the modelcontextprotocol.io apps overview; the mcp-ui project; the FastMCP documentation on apps and capability detection; Block's Goose as the reference host; and Google's A2UI announcement and A2UI-over-MCP patterns. Repository facts are drawn from iowarp/clio-kit, iowarp/clio-agent (develop), and iowarp/gact-tui as of June 27, 2026.
