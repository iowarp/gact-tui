package ui

// executionComponent owns the execution-transcript domain: the per-session
// append-only SSE ledger and its sequence counter, plus the behaviour that
// projects, renders, and opens detail views for CLIO's execution timeline. It
// holds a back-reference to the root App for shared services (messages, focus,
// current session, detail modal, theme, file viewer). Unlike the modal
// components this domain has no open/close lifecycle — it is a passive
// projection of streamed events — so there is no open flag.
type executionComponent struct {
	app *App

	// executionEventsBySession is the append-only receive-order ledger
	// used to project CLIO's semantic highway and assistant deltas into
	// one chronological execution transcript.
	executionEventsBySession map[string][]executionTimelineEvent
	executionEventSeq        int

	// projCache memoizes the projected+filtered turns for the current session.
	// The ledger is append-only, so (sessionID, len(events)) uniquely keys the
	// projection — this avoids re-running projectExecutionTimelineTurns (an
	// O(events) graph build) on every frame / keystroke / SSE token.
	projCacheSID   string
	projCacheLen   int
	projCacheTurns []executionProjectedTurn
	projCacheOK    bool

	// turnRenderCache memoizes each rendered turn block (the user row + its
	// execution timeline) by a cheap per-turn signature, keyed by the owning
	// message id. During a streaming turn only the active turn's nodes change,
	// so every earlier block is reused verbatim instead of the whole transcript
	// being re-rendered each token (the projected-render hot path — mirrors the
	// per-message conversationRenderCache).
	turnRenderCacheSID string
	turnRenderCache    map[string]execTurnRender
}

// execTurnRender is one cached rendered turn block plus the signature of the
// inputs that produced it; a signature mismatch re-renders just that block.
type execTurnRender struct {
	sig uint64
	row string
}

// nextSeq advances and returns the monotonic per-App execution event sequence.
func (c *executionComponent) nextSeq() int {
	c.executionEventSeq++
	return c.executionEventSeq
}
