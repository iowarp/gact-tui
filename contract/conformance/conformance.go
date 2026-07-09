// Package conformance is a runnable test harness that any
// GACT-compliant backend can use to verify it matches the v0.1
// contract. Point it at a live URL and it walks the major endpoints,
// asserting shape (not semantics — that's on the backend under test).
//
// Usage:
//
//	func TestMyBackendConformance(t Reporter) {
//	    srv := startMyBackend(t)
//	    defer srv.Close()
//	    conformance.Run(t, srv.URL, conformance.Options{
//	        WorkspaceID: "ws_default",
//	    })
//	}
//
// Options let callers skip sections their backend doesn't implement
// (e.g. SkipPostMessage when only read-only endpoints are wired).
// Unskipped sections that return 501 count as a failure — silently
// tolerating 501 would defeat the purpose.
package conformance

import (
	"net/http"
	"strings"
	"time"
)

// Options lets callers scope the suite to what their backend supports.
// Defaults (zero value): run every section, no workspace override.
type Options struct {
	// WorkspaceID is used for endpoints that require one (sessions
	// list, SSE scoped to a workspace, etc.). When empty, the suite
	// picks the first workspace from /v1/workspaces — good enough for
	// emulator-style backends that seed a default.
	WorkspaceID string

	// SessionID pins a specific session for per-session assertions.
	// When empty, the suite creates one if the backend allows.
	SessionID string

	// Skip* flags turn sections off for backends that only implement
	// a subset of the SPEC. A skipped section emits t.Log instead of
	// running its assertions.
	SkipHealth        bool
	SkipCapabilities  bool
	SkipWorkspaces    bool
	SkipSessions      bool
	SkipCreateSession bool
	SkipPostMessage   bool
	// IIIIII1: Messages list/get section — gated on a non-empty
	// session id. Walks GET /v1/sessions/{id}/messages and drills
	// into GET /v1/sessions/{id}/messages/{msg_id} for the first
	// entry. Locks the wire shape that powers `gact log` and the
	// conversation pane's history fetch.
	SkipMessageList bool
	// RRRRRR1: Sessions_Export — SPEC §6.2 GET
	// /v1/sessions/{id}/export. Asserts 200 + JSON content-type +
	// decodable body. Read-only.
	SkipSessionExport bool
	SkipSSE           bool
	SkipCommands      bool
	SkipTools         bool
	SkipMetrics       bool
	// DDDDDD1: Agents section — no capability flag in SPEC (read is
	// always available per §6.5). Walks GET /v1/agents and locks the
	// AgentDef shape that powers the Settings → Agent picker. Skip
	// for backends that surface a totally different agent model.
	SkipAgents bool
	// AAAA1: optional MMM-endpoint coverage. Each gated by the
	// matching capability flag — backends that don't claim it get
	// auto-skipped, so adapters that wire only a subset don't fail
	// here. Setting Skip* explicitly always skips even if the cap
	// is true.
	SkipHooks    bool
	SkipPolicies bool
	SkipTasks    bool
	// BBBBB1: MCP servers section — gated on capabilities.mcp. Adds
	// shape coverage for GET /v1/mcp/servers since the TUI's catalog
	// browser depends on it. Backends that don't claim mcp=true skip
	// automatically.
	SkipMcp bool
	// TTTTT1: Models/Providers section — gated on capabilities.providers.
	// Walks GET /v1/providers + GET /v1/providers/{id}/models so the
	// model picker (Settings tab + `gact models list`) catches drift
	// at the wire level before users hit it.
	SkipProviders bool
	// UUUUU1: Files section — gated on capabilities.files. Walks
	// GET /v1/workspaces/{id}/files (the workspace tree). Locks the
	// shape that powers `gact files list`, the @-file picker (M6),
	// and `gact repo-map`. Read-only: doesn't touch the file body
	// endpoint to avoid coupling to the test fixture's file content.
	SkipFiles bool
	// BBBBBB1: Diffs section — gated on capabilities.diffs. Walks
	// GET /v1/sessions/{id}/diffs (the pending file_diff list).
	// Locks the shape that powers `gact diff` + the conversation
	// pane's a/r apply/reject keys. Read-only: doesn't apply or
	// reject anything (idempotent against the live session).
	SkipDiffs bool
	// CCCCCC1: per-message diffs section — gated on
	// capabilities.diffs + at least one message in the session.
	// Walks GET /v1/sessions/{id}/messages → first message id →
	// GET /v1/sessions/{id}/messages/{mid}/diffs. Locks the wire
	// shape that powers per-turn diff drill-down (Ctrl+E from a
	// tool_result row). Read-only.
	SkipMessageDiffs bool
	// QQQQQQ1: messages search — gated on
	// capabilities.search_messages + sid. Walks GET
	// /v1/sessions/{id}/messages/search?q=hello. Locks the wire
	// shape SPEC §6.3 promises so the @-search palette and `gact
	// search` don't drift at the wire level.
	SkipMessageSearch bool

	// CLIO-BBBBBBBBBB5 (v0.2): the five v0.2 capability suites.
	// Each gated on its capabilities.* flag — backends that don't
	// claim the capability get auto-skipped.
	//
	// Skip flags here let a caller force-skip even when the flag is
	// true (useful for integration tests that don't want to round-trip
	// through one of these endpoints).
	SkipAgentRouting      bool // capabilities.agent_routing (§4.3.1) — AgentDef.tier/specialization/keywords populated; `?tier=2` filter works
	SkipMemoryStats       bool // capabilities.memory (§6.19) — /v1/memory/stats returns the expected envelope
	SkipStructuredErrors  bool // capabilities.structured_errors (§14) — 404/501 responses carry the typed error envelope
	SkipIntegrationHealth bool // capabilities.integration_health (§3.4) — /v1/health has overall_status + integrations[]
	SkipToolTelemetry     bool // capabilities.tool_telemetry (§4.5) — no endpoint to hit; asserted via the capabilities self-report + presence of the capability flag

	// CLIO-232: drift-class checks (SPEC §15.8). These assert the
	// reconciliation drift classes that actually bit clients — see
	// drift_checks.go. The SSE/rollback/compact ones mutate the
	// session (title PATCH, message rollback, ledger compaction), so
	// Run() additionally gates them on the session being suite-created
	// (opts.SessionID == "") — a caller-pinned session is never
	// touched.
	SkipCapabilityTruth  bool // §3.3 — advertised single-route capabilities must have their route (probed via 404/501 distinction)
	SkipSSEDrift         bool // §7.1/§7.3a — Last-Event-ID replay returns real events (heartbeats must not evict); flat message.created; session.updated = full Session
	SkipRollbackEnvelope bool // §6.2 — undo/rewind response envelope keys
	SkipCompactFocus     bool // §6.25 — POST /compact accepts {focus}

	// SpecPath points at a contract/SPEC.md to enforce the §7.7 wire
	// event-vocabulary drift class (Drift_EventVocabulary): every event
	// type observed on the live SSE stream must be declared in §7.7
	// (custom x.{vendor}.* types exempt). Empty ⇒ the section is skipped,
	// so the `gact conformance` CLI and adapter callers that don't ship
	// the SPEC stay backward-compatible.
	SpecPath string

	// HTTPTimeout bounds each RPC (not SSE). Default 10 s.
	HTTPTimeout time.Duration

	// SSEBudget bounds how long the SSE probe waits for its first
	// event. Default 3 s — enough for an emulator, may need bumping
	// for real-world backends that take longer to wake up.
	SSEBudget time.Duration
}

// Run executes the conformance suite. Each section uses t.Run so a
// failure in one doesn't mask failures elsewhere, and individual
// sections can be skipped via -run.
func Run(t Reporter, baseURL string, opts Options) {
	t.Helper()
	if opts.HTTPTimeout == 0 {
		opts.HTTPTimeout = 10 * time.Second
	}
	if opts.SSEBudget == 0 {
		opts.SSEBudget = 3 * time.Second
	}
	baseURL = strings.TrimRight(baseURL, "/")
	c := &conformClient{baseURL: baseURL, http: &http.Client{Timeout: opts.HTTPTimeout}}

	if !opts.SkipHealth {
		t.Run("Health", func(t Reporter) { checkHealth(t, c) })
	}
	if !opts.SkipCapabilities {
		t.Run("Capabilities", func(t Reporter) { checkCapabilities(t, c) })
	}

	// Resolve workspace once so later sections can reuse it.
	wsID := opts.WorkspaceID
	if wsID == "" && !opts.SkipWorkspaces {
		var got string
		t.Run("Workspaces", func(t Reporter) {
			got = checkWorkspaces(t, c)
		})
		wsID = got
	} else if !opts.SkipWorkspaces {
		t.Run("Workspaces", func(t Reporter) { _ = checkWorkspaces(t, c) })
	}

	// Resolve or create session.
	sid := opts.SessionID
	if !opts.SkipSessions {
		t.Run("Sessions_List", func(t Reporter) {
			checkSessionsList(t, c, wsID)
		})
	}
	if sid == "" && !opts.SkipCreateSession {
		t.Run("Sessions_Create", func(t Reporter) {
			sid = checkCreateSession(t, c, wsID)
		})
	}

	if sid != "" && !opts.SkipSessions {
		t.Run("Sessions_Get", func(t Reporter) {
			checkSessionGet(t, c, sid)
		})
	}

	if sid != "" && !opts.SkipPostMessage {
		t.Run("Messages_Post", func(t Reporter) {
			checkPostMessage(t, c, sid, wsID)
		})
	}

	if sid != "" && !opts.SkipMessageList {
		t.Run("Messages_List", func(t Reporter) {
			checkMessagesList(t, c, sid)
		})
	}

	if sid != "" && !opts.SkipSessionExport {
		t.Run("Sessions_Export", func(t Reporter) {
			checkSessionExport(t, c, sid)
		})
	}

	if sid != "" && !opts.SkipSSE {
		t.Run("SSE", func(t Reporter) {
			checkSSE(t, c, sid, wsID, opts.SSEBudget)
		})
	}

	if !opts.SkipCommands {
		t.Run("Commands_List", func(t Reporter) { checkCommands(t, c) })
	}
	if !opts.SkipTools {
		t.Run("Tools_List", func(t Reporter) { checkTools(t, c) })
	}
	if !opts.SkipMetrics {
		t.Run("Metrics", func(t Reporter) { checkMetrics(t, c) })
	}
	if !opts.SkipAgents {
		t.Run("Agents", func(t Reporter) { checkAgents(t, c) })
	}
	// AAAA1: MMM endpoints, gated by capability flag. We need the
	// caps to know which to run; reuse the Capabilities check's
	// fetch by re-calling it here (cheap GET).
	if !opts.SkipHooks || !opts.SkipPolicies || !opts.SkipTasks || !opts.SkipMcp || !opts.SkipProviders || !opts.SkipFiles || !opts.SkipDiffs || !opts.SkipMessageDiffs || !opts.SkipMessageSearch {
		caps := fetchCapabilities(c)
		if !opts.SkipHooks && caps.Hooks {
			t.Run("Hooks", func(t Reporter) { checkHooks(t, c) })
		}
		if !opts.SkipPolicies {
			// Policies has no capability flag in Capabilities —
			// permissions itself does. Run when permissions=true.
			if caps.Permissions {
				t.Run("Policies", func(t Reporter) { checkPolicies(t, c) })
			}
		}
		if !opts.SkipTasks && caps.SessionTasks {
			if sid != "" {
				t.Run("Tasks", func(t Reporter) { checkTasks(t, c, sid) })
			}
		}
		if !opts.SkipMcp && caps.Mcp {
			t.Run("Mcp", func(t Reporter) { checkMcp(t, c) })
		}
		if !opts.SkipProviders && caps.Providers {
			t.Run("Providers", func(t Reporter) { checkProviders(t, c) })
		}
		if !opts.SkipFiles && caps.Files && wsID != "" {
			t.Run("Files", func(t Reporter) { checkFiles(t, c, wsID) })
		}
		if !opts.SkipDiffs && caps.Diffs && sid != "" {
			t.Run("Diffs", func(t Reporter) { checkDiffs(t, c, sid) })
		}
		if !opts.SkipMessageDiffs && caps.Diffs && sid != "" {
			t.Run("Messages_Diffs", func(t Reporter) { checkMessageDiffs(t, c, sid) })
		}
		if !opts.SkipMessageSearch && caps.SearchMessages && sid != "" {
			t.Run("Messages_Search", func(t Reporter) { checkMessagesSearch(t, c, sid) })
		}
		// UUUUUU1: context_files + repo_map. Both gated on caps.files
		// since the SPEC groups them in §6.9 alongside the workspace
		// file tree. context_files needs a sid; repo_map needs a wsID.
		if !opts.SkipFiles && caps.Files && sid != "" {
			t.Run("Context_Files", func(t Reporter) { checkContextFiles(t, c, sid) })
		}
		if !opts.SkipFiles && caps.Files && wsID != "" {
			t.Run("Repo_Map", func(t Reporter) { checkRepoMap(t, c, wsID) })
		}

		// CLIO-BBBBBBBBBB5: v0.2 suites.
		if !opts.SkipAgentRouting && caps.AgentRouting {
			t.Run("V0_2_AgentRouting", func(t Reporter) { checkAgentRouting(t, c) })
		}
		if !opts.SkipMemoryStats && caps.Memory {
			t.Run("V0_2_MemoryStats", func(t Reporter) { checkMemoryStats(t, c, sid) })
		}
		if !opts.SkipIntegrationHealth && caps.IntegrationHealth {
			t.Run("V0_2_IntegrationHealth", func(t Reporter) { checkIntegrationHealth(t, c) })
		}
		if !opts.SkipStructuredErrors && caps.StructuredErrors {
			t.Run("V0_2_StructuredErrors", func(t Reporter) { checkStructuredErrors(t, c) })
		}
		if !opts.SkipToolTelemetry && caps.ToolTelemetry {
			t.Run("V0_2_ToolTelemetry", func(t Reporter) { checkToolTelemetry(t, c) })
		}
	}

	// CLIO-232: drift-class checks (SPEC §15.8). Run last — the
	// rollback check deletes the newest message and compact rewrites
	// the ledger, so nothing downstream may depend on the transcript.
	// suiteOwnsSession gates every mutating drift check: they only
	// run against a session this suite created itself.
	suiteOwnsSession := sid != "" && opts.SessionID == ""
	if sid != "" && !opts.SkipCapabilityTruth {
		t.Run("Drift_CapabilityTruth", func(t Reporter) { checkCapabilityTruth(t, c, sid) })
	}
	if sid != "" {
		// Read-only pagination contract check (CLIO-232 / #872) — safe against a
		// caller-pinned session, so not gated on suiteOwnsSession.
		t.Run("Drift_MessagePagination", func(t Reporter) { checkMessagePagination(t, c, sid) })
	}
	if suiteOwnsSession {
		// Forks a sub-session to make the filter assertion non-vacuous — mutating,
		// so only against a session this suite created itself.
		t.Run("Drift_ParentSessionFilter", func(t Reporter) { checkParentSessionFilter(t, c, sid) })
	}
	if sid != "" && opts.SpecPath != "" && !opts.SkipSSE && !opts.SkipPostMessage {
		t.Run("Drift_EventVocabulary", func(t Reporter) {
			checkEventVocabulary(t, c, sid, wsID, opts.SpecPath, opts.SSEBudget)
		})
	}
	if suiteOwnsSession && !opts.SkipSSEDrift && !opts.SkipSSE && !opts.SkipPostMessage {
		t.Run("Drift_SSEReplayAndShapes", func(t Reporter) { checkSSEDrift(t, c, sid, opts.SSEBudget) })
	}
	if suiteOwnsSession && !opts.SkipCompactFocus {
		t.Run("Drift_CompactFocus", func(t Reporter) { checkCompactFocus(t, c, sid) })
	}
	if suiteOwnsSession && !opts.SkipRollbackEnvelope {
		t.Run("Drift_RollbackEnvelope", func(t Reporter) { checkRollbackEnvelope(t, c, sid) })
	}
}

// --- Section implementations ------------------------------------------------
