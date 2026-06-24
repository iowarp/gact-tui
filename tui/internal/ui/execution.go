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
}

// nextSeq advances and returns the monotonic per-App execution event sequence.
func (c *executionComponent) nextSeq() int {
	c.executionEventSeq++
	return c.executionEventSeq
}
