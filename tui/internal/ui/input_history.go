package ui

// inputHistoryCap bounds the per-session ring so a chatty user doesn't
// leak memory. 100 is generous enough that no one hits it in practice
// but small enough that the whole history fits in one terminal scroll.
const inputHistoryCap = 100

// pushHistory appends text to the current session's history ring.
// No-ops on empty input or if the same text was just pushed (so
// repeated Enter on the same unchanged draft doesn't pollute history).
func (c *inputComposerComponent) pushHistory(text string) {
	if text == "" {
		return
	}
	sid := c.app.session.currentID()
	if sid == "" {
		return
	}
	if c.inputHistoryBySession == nil {
		c.inputHistoryBySession = map[string][]string{}
	}
	h := c.inputHistoryBySession[sid]
	if n := len(h); n > 0 && h[n-1] == text {
		return
	}
	h = append(h, text)
	if len(h) > inputHistoryCap {
		// Trim oldest — copy-and-reslice rather than reassigning the
		// slice header so we release the backing array's room
		// eventually instead of growing unbounded.
		h = append([]string{}, h[len(h)-inputHistoryCap:]...)
	}
	c.inputHistoryBySession[sid] = h
}

// historyPrev moves one entry older in history. Returns the text to
// display (empty string = no-op, caller should do nothing). Saves the
// current draft on first entry into history mode so ↓-past-end can
// restore it.
func (c *inputComposerComponent) historyPrev() (string, bool) {
	sid := c.app.session.currentID()
	if sid == "" {
		return "", false
	}
	h := c.inputHistoryBySession[sid]
	if len(h) == 0 {
		return "", false
	}
	// Entering history mode — remember what was typed so the user
	// can return to it.
	if c.historyCursor < 0 {
		c.historyDraft = c.input.Value()
		c.historyCursor = len(h) // "one past the end"; first ↑ goes to last entry
	}
	if c.historyCursor > 0 {
		c.historyCursor--
	}
	// Clamp for safety against out-of-range cursors set by an earlier
	// session's history length.
	if c.historyCursor >= len(h) {
		c.historyCursor = len(h) - 1
	}
	return h[c.historyCursor], true
}

// historyNext moves one entry newer. At the end (cursor == len(h)),
// restores the saved draft and exits history mode.
func (c *inputComposerComponent) historyNext() (string, bool) {
	if c.historyCursor < 0 {
		// Not in history mode — nothing to do.
		return "", false
	}
	sid := c.app.session.currentID()
	h := c.inputHistoryBySession[sid]
	c.historyCursor++
	if c.historyCursor >= len(h) {
		// Stepped past the newest; restore the pre-history draft.
		draft := c.historyDraft
		c.historyCursor = -1
		c.historyDraft = ""
		return draft, true
	}
	return h[c.historyCursor], true
}

// exitHistory drops out of history mode without changing input. Called
// when the user types any non-navigation key; their edit replaces
// whatever was in the textarea from the history walk.
func (c *inputComposerComponent) exitHistory() {
	c.historyCursor = -1
	c.historyDraft = ""
}
