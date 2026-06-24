package ui

// command_palette_cursor.go manages the palette filter-input cursor and its editor rendering.

func (c *commandPaletteComponent) clampCursor() {
	if !c.paletteCursorSet && c.paletteFilter != "" {
		c.paletteCursor = len([]rune(c.paletteFilter))
	}
	c.paletteCursorSet = true
	max := len([]rune(c.paletteFilter))
	if c.paletteCursor < 0 {
		c.paletteCursor = 0
	}
	if c.paletteCursor > max {
		c.paletteCursor = max
	}
}

func (c *commandPaletteComponent) cursorValue() int {
	if !c.paletteCursorSet && c.paletteFilter != "" {
		return len([]rune(c.paletteFilter))
	}
	cursor := c.paletteCursor
	if cursor < 0 {
		return 0
	}
	max := len([]rune(c.paletteFilter))
	if cursor > max {
		return max
	}
	return cursor
}

func (c *commandPaletteComponent) resetAfterFilterEdit() {
	c.paletteCursorSet = true
	c.paletteSel = 0
	c.searchMatches = nil
	c.searching = false
}

func renderPaletteCursorEditor(value string, cursor int) string {
	runes := []rune(value)
	if cursor < 0 {
		cursor = 0
	}
	if cursor > len(runes) {
		cursor = len(runes)
	}
	return string(runes[:cursor]) + "_" + string(runes[cursor:])
}
