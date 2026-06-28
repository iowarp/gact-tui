package ui

// paste_segments.go compacts pasted content into placeholders and expands them back on demand.

import (
	"fmt"
	"strings"
)

// pastedSegment represents a single multi-line paste compressed in the input.
type pastedSegment struct {
	placeholder string
	content     string
	lineCount   int
}

// insertPlaceholder records a long paste and inserts a short input token.
func (c *inputComposerComponent) insertPlaceholder(content string, lineCount int) {
	seq := len(c.pastes) + 1
	placeholder := fmt.Sprintf("[pasted content #%d: %d lines]", seq, lineCount)
	c.pastes = append(c.pastes, pastedSegment{
		placeholder: placeholder,
		content:     content,
		lineCount:   lineCount,
	})

	cur := c.input.Value()
	if cur != "" && !strings.HasSuffix(cur, " ") && !strings.HasSuffix(cur, "\n") {
		cur += " "
	}
	c.input.SetValue(cur + placeholder + " ")
}

func normalizePasteNewlines(content string) string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	return strings.ReplaceAll(content, "\r", "\n")
}

func compactSingleLinePaste(content string) string {
	return strings.Join(strings.Fields(content), " ")
}

func compactTokenPaste(content string) string {
	return strings.Join(strings.Fields(content), "")
}

func compactPathLikePaste(content string) string {
	text := strings.TrimSpace(normalizePasteNewlines(content))
	return strings.ReplaceAll(text, "\n", "")
}

func (c *inputComposerComponent) compactBuffered() {
	rawContent := c.pasteBuffer
	content := normalizePasteNewlines(rawContent)
	if strings.TrimSpace(content) == "" {
		return
	}
	lineCount := visualLineCount(content, c.estimatedTextWidth())
	threshold := c.app.Theme.PasteCompressThreshold
	if threshold <= 0 {
		threshold = 3
	}
	if lineCount < threshold {
		return
	}
	raw := c.input.Value()
	for _, candidate := range []string{
		rawContent,
		content,
		strings.ReplaceAll(rawContent, "\r", "\n"),
	} {
		if candidate == "" {
			continue
		}
		if strings.HasSuffix(raw, candidate) {
			c.input.SetValue(strings.TrimSuffix(raw, candidate))
			c.insertPlaceholder(content, lineCount)
			return
		}
		if idx := strings.LastIndex(raw, candidate); idx >= 0 {
			c.input.SetValue(raw[:idx] + raw[idx+len(candidate):])
			c.insertPlaceholder(content, lineCount)
			return
		}
	}
	c.insertPlaceholder(content, lineCount)
}

// expandText substitutes recorded paste placeholders for their content.
func (c *inputComposerComponent) expandText(raw string) string {
	out := raw
	for _, p := range c.pastes {
		out = strings.ReplaceAll(out, p.placeholder, p.content)
	}
	return out
}

func (c *inputComposerComponent) expandMostRecent() {
	if len(c.pastes) == 0 {
		return
	}
	c.expandSegment(len(c.pastes) - 1)
}

func (c *inputComposerComponent) expandSegment(idx int) {
	if idx < 0 || idx >= len(c.pastes) {
		return
	}
	seg := c.pastes[idx]
	buf := c.input.Value()
	if !strings.Contains(buf, seg.placeholder) {
		c.pastes = append(c.pastes[:idx], c.pastes[idx+1:]...)
		return
	}
	c.input.SetValue(strings.Replace(buf, seg.placeholder, seg.content, 1))
	c.pastes = append(c.pastes[:idx], c.pastes[idx+1:]...)
}
