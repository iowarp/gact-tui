/**
 * Operational tunables for the web surface.
 *
 * Every value here is an engineering trade-off (freshness vs. request volume,
 * fidelity vs. memory, completeness vs. layout) — never a user preference, so
 * none of them belong in Settings. Change one here and every surface that
 * depends on it moves together.
 *
 * Two kinds of limit deliberately live elsewhere:
 *   - per-store retention bounds that only make sense beside the store they
 *     guard (recent connections, live-store frame gaps, presentation overrides);
 *   - wire/protocol caps, which are owned by the generated `clio-schemas`
 *     contract in `@clio/core/v3` and must never be restated here.
 */

// ## Polling
// Cadences for surfaces that cannot be driven by the live stream. Lower means
// fresher data and more requests against the backend; raise these first if a
// deployment reports request pressure.

/**
 * Refetch cadence for the focused session's mutable state (session list while a
 * turn is in flight, pending approvals). Unit: milliseconds.
 * Raise it if the backend is request-bound; lower it only if a surface that has
 * no stream event still feels stale.
 */
export const ACTIVE_SESSION_POLL_MS = 1_500;

/**
 * Refetch cadence for infrastructure inventories (relays, MCP servers, hosts).
 * Unit: milliseconds. These change on human timescales, so the cadence exists to
 * notice an operator's out-of-band change, not to track live progress.
 */
export const INFRASTRUCTURE_POLL_MS = 20_000;

/**
 * Refetch cadence for operations/administration panels (schedules, health,
 * relay settings). Unit: milliseconds. Slowest tier: these panels are opened
 * deliberately and read, not watched.
 */
export const OPERATIONS_POLL_MS = 30_000;

/**
 * Refetch cadence for the runs list, which advances while work executes.
 * Unit: milliseconds. Faster than the operations tier because a run's state is
 * the thing the page exists to show.
 */
export const RUNS_POLL_MS = 5_000;

/**
 * Readiness poll cadence for the desktop-managed backend during startup.
 * Unit: milliseconds. Tight because it is a one-shot boot wait against a local
 * process, and every extra interval is startup latency the user watches.
 */
export const MANAGED_BACKEND_POLL_MS = 150;

// ## Streaming and reconnect backoff
// The client reconnects a dropped SSE stream with exponential backoff between
// these two bounds.

/**
 * First reconnect delay after a stream drop, doubled on each further failure.
 * Unit: milliseconds. Also the coalescing window for externally triggered
 * reconnects (network online, tab visible, desktop resume) so a burst of those
 * events opens one stream, not several.
 * Raise it if a flapping backend is being hammered; lower it for snappier
 * recovery on a reliable local backend.
 */
export const STREAM_RECONNECT_BASE_MS = 250;

/**
 * Ceiling for the reconnect backoff. Unit: milliseconds. Caps how long a
 * recovered backend stays unnoticed; raise it to be gentler on a backend that
 * is down for long stretches.
 */
export const STREAM_RECONNECT_MAX_MS = 8_000;

// ## Timeouts
// Bounds on how long the client waits before calling an operation failed.

/**
 * How long desktop startup waits for the managed backend to report ready before
 * surfacing a startup failure. Unit: milliseconds. Generous because a first run
 * may install the service; shorten it only if a faster failure beats a slow
 * success.
 */
export const MANAGED_BACKEND_READY_TIMEOUT_MS = 90_000;

/**
 * Timeout for the signed desktop update check. Unit: milliseconds. Bounded so a
 * slow or unreachable update feed cannot hang the Settings panel.
 */
export const UPDATE_CHECK_TIMEOUT_MS = 15_000;

// ## Retention
// How much history a surface holds or asks for.

/**
 * Maximum provenance records requested for one execution-provenance view.
 * Unit: records. High because the view is a complete lineage audit and a
 * silently trimmed graph would be misleading; lower it only if large sessions
 * make the request itself the bottleneck.
 */
export const EXECUTION_PROVENANCE_LIMIT = 10_000;

// ## Preview budgets
// Ceilings on how much of an artifact the client will fetch and render inline.
// These protect the tab's memory and main thread; the full resource is always
// reachable through its own viewer.

/**
 * Largest artifact the client will read into the tab for an inline preview.
 * Unit: bytes. Above this the card explains the budget instead of fetching.
 */
export const INLINE_PREVIEW_MAX_BYTES = 8_000_000;

/**
 * Largest text artifact fetched for a transcript card's text preview.
 * Unit: bytes. Much tighter than the inline budget because a card preview is a
 * glance, not a read.
 */
export const TEXT_PREVIEW_MAX_BYTES = 256_000;

/**
 * Characters of a fetched text preview actually rendered into a card.
 * Unit: characters. Bounds layout and paint cost independently of the fetch
 * budget above.
 */
export const TEXT_PREVIEW_RENDER_CHARS = 4_000;

/**
 * Rows requested and rendered for a tabular preview (CSV samples, artifact
 * table previews, plotted series). Unit: rows.
 * The backend enforces its own ceiling; this is the client's ask, and
 * `@clio/core/v3` carries the matching default for direct repository callers.
 */
export const PREVIEW_ROW_LIMIT = 1_000;

/**
 * Rows rendered from an inline JSON record collection. Unit: rows.
 * Higher than the tabular preview limit because the payload is already in the
 * tab — this bounds grid rendering, not a fetch.
 */
export const JSON_TABLE_ROW_LIMIT = 5_000;

/**
 * Largest Mermaid source accepted for rendering. Unit: characters.
 * A security and responsiveness bound: the renderer is synchronous, so an
 * unbounded diagram blocks the main thread.
 */
export const MAX_DIAGRAM_SOURCE_CHARS = 16_384;

// ## Truncation
// Where generated prose is cut for a compact surface. All of these are applied
// through `truncate` in `@/lib/format`, which appends the ellipsis within the
// budget, so the value is the maximum rendered length.

/**
 * Maximum length of a one-line summary (tool result, turn headline, tool
 * description). Unit: characters. Roughly two lines at the surfaces that render
 * these.
 */
export const SUMMARY_TRUNCATE_CHARS = 180;

/**
 * Maximum length of a run's state reason in the runs table. Unit: characters.
 * Shorter than a summary because it shares a table row with other columns.
 */
export const RUN_REASON_TRUNCATE_CHARS = 140;

/**
 * Maximum length of a label drawn inside a generated diagram node.
 * Unit: characters. Bounded by what the node box can show, not by readability.
 */
export const DIAGRAM_LABEL_TRUNCATE_CHARS = 160;

/**
 * Maximum length of a subagent's assignment text on its card. Unit: characters.
 */
export const SUBAGENT_TASK_TRUNCATE_CHARS = 260;

/**
 * Maximum length of a subagent's returned result on its card. Unit: characters.
 * Longer than the assignment because the result is the part a reader scans.
 */
export const SUBAGENT_RESULT_TRUNCATE_CHARS = 300;

// ## Query policy
// Defaults applied to every cached read, and the shared options for reads that
// can never go stale.

/**
 * How long a cached query result is served without a background refetch.
 * Unit: milliseconds. Short enough that navigating back to a surface shows
 * current data, long enough to absorb a burst of remounts.
 */
export const QUERY_STALE_TIME_MS = 10_000;

/**
 * Automatic retries for a failed read. Unit: attempts after the first.
 * One retry covers a dropped connection without masking a real backend failure
 * behind a long retry ladder.
 */
export const QUERY_RETRY_COUNT = 1;

/**
 * Query options for content addressed by an immutable identity — registered
 * artifact bytes, text, and table previews. That content cannot change under a
 * given key, so refetching it only costs bandwidth.
 */
export const IMMUTABLE_QUERY = { staleTime: Number.POSITIVE_INFINITY } as const;

// ## Interaction
// Values a person feels directly: input latency and how much of a list a
// surface shows before it asks to expand.

/**
 * Idle time after the last keystroke before a search query is sent.
 * Unit: milliseconds. Below roughly 150 ms a fast typist issues a request per
 * character; above roughly 250 ms the results feel detached from the typing.
 */
export const SEARCH_DEBOUNCE_MS = 180;

/**
 * Workspaces listed in the sidebar before the "show all" control appears.
 * Unit: workspaces. When the active workspace is outside this window it takes
 * the last visible slot, so one fewer of the ordered workspaces is shown.
 */
export const VISIBLE_WORKSPACE_LIMIT = 7;

/**
 * Page sizes offered by every paginated data grid. Unit: rows per page.
 * Shared so the pagination control reads the same on every table.
 */
export const DATA_GRID_PAGE_SIZES: number[] = [10, 25, 50, 100];
