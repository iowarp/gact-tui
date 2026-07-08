package ui

// pageSize returns the number of session entries that fit in the
// visible sidebar pane — used by PgUp/PgDn so the jump matches what the
// user sees. Reuses the same budget math as renderSidebar
// so keyboard paging stays aligned with what's rendered (previously
// drifted by 1-2 rows depending on context-file count + R2 footer,
// causing PgDn to jump past the last visible session).
func (c *sidebarComponent) pageSize() int {
	const rowsPerSession = 2
	contextLines := 0
	if c.app.session.selected >= 0 {
		if c.contextCollapsed {
			contextLines = 1
		} else if n := len(c.app.session.contextFiles); n > 0 {
			contextLines = 1 + n
		} else {
			contextLines = 2
		}
	}
	footerLines := 0
	if len(c.app.session.sessions) > 0 {
		footerLines = 2
	}
	fileLines := c.app.fileViewer.rowCount(8)
	agentLines := c.app.agent.sidebarAgentHierarchyRowCount(8)
	// c.app.height includes the header row (1) + footer hints row (1) +
	// optional hint banner row. The pane itself gets c.app.height-4 outer
	// rows (header + footer + 2 spacer rows per the layout math in
	// renderBody). Same inner-row budget as renderSidebar.
	inner := (c.app.height - 4) - 2
	avail := inner - contextLines - fileLines - agentLines - footerLines
	if (contextLines > 0 && !c.contextCollapsed) || (fileLines > 0 && !c.filesCollapsed) || (agentLines > 0 && !c.app.agent.sidebarCollapsed()) {
		avail--
	}
	page := avail / rowsPerSession
	if page < 1 {
		page = 1
	}
	return page
}

func (c *sidebarComponent) clampContextFileSelection() {
	if len(c.app.session.contextFiles) == 0 {
		c.app.session.selectContextFile(0)
		return
	}
	if c.app.session.contextFileSel < 0 {
		c.app.session.selectContextFile(0)
	}
	if c.app.session.contextFileSel >= len(c.app.session.contextFiles) {
		c.app.session.selectContextFile(len(c.app.session.contextFiles) - 1)
	}
}

func (c *sidebarComponent) hasContextSection() bool {
	return c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions)
}

func (c *sidebarComponent) firstVisibleSessionIndex() int {
	vis := c.app.session.visibleIndexes()
	if len(vis) == 0 {
		return -1
	}
	return vis[0]
}

func (c *sidebarComponent) visibleSessionRange(height int, visIdx []int) (int, int) {
	if c.sessionsCollapsed || len(visIdx) == 0 {
		return 0, 0
	}
	selVis := -1
	for i, idx := range visIdx {
		if idx == c.app.session.selected {
			selVis = i
			break
		}
	}
	startIdx := 0
	anchorVis := selVis
	if selVis >= 0 && c.showChildSessions && c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) && !isChildSession(c.app.session.sessions[c.app.session.selected]) {
		for j := selVis + 1; j < len(visIdx); j++ {
			if !isChildSession(c.app.session.sessions[visIdx[j]]) || c.app.session.sessions[visIdx[j]].ParentSessionID != c.app.session.sessions[c.app.session.selected].ID {
				break
			}
			anchorVis = j
		}
	}
	avail := c.sessionRowsAvailable(height)
	if avail < 1 {
		avail = 1
	}
	if anchorVis >= 0 {
		used := 0
		startIdx = anchorVis
		for startIdx >= 0 {
			next := used + c.sessionRowCount(visIdx[startIdx])
			if used > 0 && next > avail {
				break
			}
			used = next
			startIdx--
		}
		startIdx++
	}
	endIdx := startIdx
	used := 0
	for endIdx < len(visIdx) {
		next := used + c.sessionRowCount(visIdx[endIdx])
		if used > 0 && next > avail {
			break
		}
		used = next
		endIdx++
	}
	return startIdx, endIdx
}

func (c *sidebarComponent) sessionRowsAvailable(height int) int {
	contextLines := c.contextRowCount()
	fileLines := c.app.fileViewer.rowCount(8)
	footerLines := 0
	if len(c.app.session.sessions) > 0 {
		footerLines = 2
	}
	avail := (height - 2) - 2 - contextLines - fileLines - footerLines
	if contextLines > 0 || fileLines > 0 {
		avail--
	}
	if avail < 1 {
		return 1
	}
	return avail
}

func (c *sidebarComponent) contextRowCount() int {
	if c.app.session.selected < 0 {
		return 0
	}
	if c.contextCollapsed {
		return 1
	}
	if len(c.app.session.contextFiles) == 0 {
		return 2
	}
	rows := 1
	for i := range c.app.session.contextFiles {
		rows += c.contextFileRowCount(i)
	}
	return rows
}

func (c *sidebarComponent) contextFileRowCount(index int) int {
	if index < 0 || index >= len(c.app.session.contextFiles) {
		return 0
	}
	if index == c.app.session.contextFileSel {
		return 2
	}
	return 1
}
