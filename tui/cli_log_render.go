package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// printLogMessage renders one message in the canonical role-headered
// shape used by `gact log` and `gact follow`. Extracted so both
// callers stay in sync.
func printLogMessage(m gact.Message) {
	fmt.Printf("[%s @ %s]\n", strings.ToUpper(m.Role), m.CreatedAt.UTC().Format(time.RFC3339))
	for _, p := range m.Parts {
		switch p.Type {
		case gact.PartTypeText:
			if p.Text != "" {
				fmt.Println(indent(p.Text, "  "))
			}
		case gact.PartTypeThinking:
			if p.Thinking != "" {
				fmt.Println(indent("(thinking) "+p.Thinking, "  "))
			}
		case gact.PartTypeToolCall:
			args, _ := json.Marshal(p.Input)
			fmt.Printf("  → %s(%s)\n", p.ToolName, string(args))
		case gact.PartTypeToolResult:
			body := flattenToolResultParts(p.Content)
			prefix := "  ⎿ "
			if p.IsError {
				prefix = "  ⎿! "
			}
			fmt.Println(indent(body, prefix))
		case gact.PartTypeFileDiff:
			fmt.Printf("  ◇ diff %s\n", p.Path)
		}
	}
	fmt.Println()
}

// indent prefixes every line of s with prefix. Used by `gact log` to
// keep multi-line bodies aligned under their role header.
func indent(s, prefix string) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	for i := range lines {
		lines[i] = prefix + lines[i]
	}
	return strings.Join(lines, "\n")
}

// flattenMessageForGrep joins every text-bearing part in a message
// (text, thinking, tool_call name + serialized input, tool_result
// flattened content) into a single string so `--grep` (BBBBBBBBB1)
// can match any of them. Returns ("", false) when the message has
// no grep-able content — caller treats that as "doesn't match".
func flattenMessageForGrep(m gact.Message) (string, bool) {
	var b strings.Builder
	for _, p := range m.Parts {
		switch p.Type {
		case gact.PartTypeText:
			if p.Text == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(p.Text)
		case gact.PartTypeThinking:
			if p.Thinking == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(p.Thinking)
		case gact.PartTypeToolCall:
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(p.ToolName)
			if len(p.Input) > 0 {
				args, _ := json.Marshal(p.Input)
				b.WriteString(" ")
				b.Write(args)
			}
		case gact.PartTypeToolResult:
			body := flattenToolResultParts(p.Content)
			if body == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(body)
		}
	}
	if b.Len() == 0 {
		return "", false
	}
	return b.String(), true
}

// flattenToolResultParts joins a tool_result's nested text parts with
// blank lines — same flattening shape the TUI render uses.
func flattenToolResultParts(parts []gact.Part) string {
	var b strings.Builder
	for i, p := range parts {
		if p.Type != gact.PartTypeText {
			continue
		}
		if i > 0 && b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(p.Text)
	}
	return b.String()
}
