package ui

// app_main_layout.go computes the main-screen pane geometry (sidebar/body/conversation widths and heights).

import "charm.land/lipgloss/v2"

func (c *inputComposerComponent) conversationPaneHeightForWidth(bodyH, textWidth int) int {
	lineCount := visualLineCount(c.input.Value(), textWidth)
	inputH := 3
	if lineCount > 1 {
		inputH = lineCount + 2
		maxInputH := bodyH / 3
		if maxInputH < 3 {
			maxInputH = 3
		}
		if inputH > maxInputH {
			inputH = maxInputH
		}
	}
	hintH := 0
	if c.app.transientHint != "" {
		hintH = 1
	}
	convH := bodyH - inputH - hintH
	if convH < 1 {
		convH = 1
	}
	return convH
}

func (c *inputComposerComponent) estimatedTextWidth() int {
	a := c.app
	if a.width <= 0 {
		return 80
	}
	sidebarW := 30
	if sidebarW > a.width/3 {
		sidebarW = a.width / 3
	}
	rightSidebarW := a.chrome.rightSidebarWidth(sidebarW)
	bodyW := a.width - sidebarW - rightSidebarW
	if bodyW < 20 {
		bodyW = 20
	}
	return c.textWidthForBody(bodyW)
}

func (c *inputComposerComponent) textWidthForBody(bodyWidth int) int {
	textW := bodyWidth - 4
	if c.app.MouseEnabled {
		textW -= c.commandChipWidth()
	}
	if textW < 8 {
		textW = 8
	}
	return textW
}

func (a *App) viewMainBase() string {
	sidebarW, bodyH, convH := a.chrome.mainPaneGeometry()
	rightSidebarW := a.chrome.rightSidebarWidth(sidebarW)
	bodyW := a.width - sidebarW - rightSidebarW
	if bodyW < 20 {
		bodyW = 20
	}

	// LLL5: align the sidebar's bottom border with the conversation
	// pane's bottom border. Previously the sidebar took the full bodyH
	// (which includes the input box + transient hint row), so its
	// bottom corner sat 3+ rows below the conversation pane's corner.
	// Compute the same convH that renderBody uses for the left sidebar.
	// The optional right sidebar spans bodyH so its hit target owns the
	// full column beside both the transcript and composer.
	sidebar := a.sidebar.render(sidebarW, convH)
	sidebar = fitLinesWithBackground(sidebar, convH, a.Theme.Bg)

	// The body pane starts at the sidebar's *rendered* width (which can
	// differ from the requested sidebarW), so pass that as the explicit
	// hit-test offset; renderWithBodyOffset scopes it to this frame.
	body := a.conversation.renderWithBodyOffset(bodyW, bodyH, renderedBlockWidth(sidebar))
	body = fitLinesWithBackground(body, bodyH, a.Theme.Bg)

	rightSidebar := ""
	if rightSidebarW > 0 {
		sidebarRenderedW := renderedBlockWidth(sidebar)
		bodyRenderedW := renderedBlockWidth(body)
		if remaining := a.width - sidebarRenderedW - bodyRenderedW; remaining > rightSidebarW {
			rightSidebarW = remaining + 2
		}
		rightOffsetX := sidebarRenderedW + bodyRenderedW
		rightSidebar = a.sidebar.renderRight(rightSidebarW, bodyH, rightOffsetX)
		rightSidebar = fitLinesWithBackground(rightSidebar, bodyH, a.Theme.Bg)
	}

	// CCCCC1: force exact row counts on both stacks. lipgloss's
	// .Height(N) only sets a minimum outer height; if the inner
	// content is shorter the pane stays short and the bottom border
	// floats up. fitLines guarantees both stacks span the rows the
	// horizontal layout expects.
	rowParts := []string{sidebar, body}
	if rightSidebarW > 0 {
		rowParts = append(rowParts, rightSidebar)
	}
	row := lipgloss.JoinHorizontal(lipgloss.Top, rowParts...)
	header := a.chrome.renderHeaderForWidth(a.width)
	footer := a.chrome.renderFooter()
	full := lipgloss.JoinVertical(lipgloss.Left, header, row, footer)
	// Final belt-and-braces clip: if any subpane still overflows
	// (e.g. a stray soft-wrap from an ultra-wide paste), prefer
	// clipping to letting the footer slip off screen.
	return clampLines(full, a.height)
}

func (c *chromeComponent) mainPaneGeometry() (sidebarW int, bodyH int, convH int) {
	a := c.app
	const headerH = 1
	const footerH = 1
	bodyH = a.height - headerH - footerH
	if bodyH < 5 {
		bodyH = 5
	}
	sidebarW = 30
	if sidebarW > a.width/3 {
		sidebarW = a.width / 3
	}
	rightSidebarW := c.rightSidebarWidth(sidebarW)
	bodyW := a.width - sidebarW - rightSidebarW
	if bodyW < 20 {
		bodyW = 20
	}
	convH = a.inputComposer.conversationPaneHeightForWidth(bodyH, a.inputComposer.textWidthForBody(bodyW))
	return sidebarW, bodyH, convH
}

func (c *chromeComponent) rightSidebarWidth(leftSidebarW int) int {
	a := c.app
	if len(a.sidebar.rightModules()) == 0 {
		return 0
	}
	width := 30
	if maxW := a.width / 4; maxW > 0 && width > maxW {
		width = maxW
	}
	if width < 24 {
		width = 24
	}
	if a.width-leftSidebarW-width < 60 {
		return 0
	}
	return width
}
