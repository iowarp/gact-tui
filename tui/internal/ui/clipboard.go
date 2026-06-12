package ui

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/atotto/clipboard"
)

// clipboardWrite is a package-level indirection so tests can swap the
// backend without touching the OS clipboard. Production tries concrete
// terminal clipboard utilities first, then falls back to atotto/clipboard.
var clipboardWrite = writeNativeClipboard
var clipboardLookPath = exec.LookPath
var clipboardAtottoWrite = clipboard.WriteAll
var clipboardRunCommand = func(name string, args []string, input string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdin = strings.NewReader(input)
	return cmd.Run()
}
var clipboardForcedFailure = func() bool {
	return os.Getenv("GACT_CLIPBOARD_FORCE_FAILURE") == "1"
}
var osc52Write = func(text string) error {
	encoded := base64.StdEncoding.EncodeToString([]byte(text))
	_, err := fmt.Fprintf(os.Stdout, "\x1b]52;c;%s\a", encoded)
	return err
}

func copyTextToClipboard(label string, text string) string {
	return copyExactTextToClipboard(text, "nothing to copy", func(int) string {
		if strings.TrimSpace(label) == "" {
			label = "content"
		}
		return "copied " + label + " to clipboard"
	})
}

func copyExactTextToClipboard(text string, emptyHint string, copiedHint func(chars int) string) string {
	if strings.TrimSpace(text) == "" {
		if strings.TrimSpace(emptyHint) == "" {
			return "nothing to copy"
		}
		return emptyHint
	}
	if clipboardForcedFailure() {
		return clipboardFailureHint()
	}
	if err := clipboardWrite(text); err != nil {
		if oscErr := osc52Write(text); oscErr != nil {
			return clipboardFailureHint()
		}
		return "sent copy via terminal OSC52 (native clipboard unavailable: " + err.Error() + ")"
	}
	if copiedHint == nil {
		return "copied content to clipboard"
	}
	return copiedHint(len(text))
}

func clipboardFailureHint() string {
	return "copy failed - run `gact diag`; check clipboard_native/clipboard_missing/clipboard_osc52"
}

type clipboardCommand struct {
	name string
	path string
	args []string
}

var clipboardPreferredCommand *clipboardCommand

func nativeClipboardCommands() []clipboardCommand {
	return []clipboardCommand{
		{name: "wl-copy"},
		{name: "xclip", args: []string{"-selection", "clipboard"}},
		{name: "xsel", args: []string{"--clipboard", "--input"}},
		{name: "pbcopy"},
		{name: "clip.exe"},
		{name: "powershell.exe", args: []string{"-NoProfile", "-Command", "$input | Set-Clipboard"}},
		{name: "termux-clipboard-set"},
	}
}

func writeNativeClipboard(text string) error {
	var tried []string
	var failures []string
	fallbackNames := "wl-copy, xclip, xsel, pbcopy, clip.exe, powershell.exe, termux-clipboard-set, atotto/clipboard"
	if clipboardPreferredCommand != nil {
		cmd := *clipboardPreferredCommand
		path := firstNonEmpty(cmd.path, cmd.name)
		tried = append(tried, cmd.name)
		if err := clipboardRunCommand(path, cmd.args, text); err == nil {
			return nil
		} else {
			failures = append(failures, cmd.name+": "+err.Error())
			clipboardPreferredCommand = nil
		}
	}
	for _, cmd := range nativeClipboardCommands() {
		if clipboardPreferredCommand != nil && cmd.name == clipboardPreferredCommand.name {
			continue
		}
		path, err := clipboardLookPath(cmd.name)
		if err != nil {
			continue
		}
		tried = append(tried, cmd.name)
		if err := clipboardRunCommand(path, cmd.args, text); err != nil {
			failures = append(failures, cmd.name+": "+err.Error())
			continue
		}
		clipboardPreferredCommand = &clipboardCommand{name: cmd.name, path: path, args: cmd.args}
		return nil
	}
	if err := clipboardAtottoWrite(text); err != nil {
		if len(tried) == 0 {
			return fmt.Errorf("no native clipboard utilities found; fallback order %s; atotto/clipboard: %w", fallbackNames, err)
		}
		return fmt.Errorf("no native clipboard utility succeeded; fallback order %s; installed attempts: %s; failures: %s; atotto/clipboard: %w",
			fallbackNames,
			strings.Join(tried, ", "),
			strings.Join(failures, "; "),
			err,
		)
	}
	return nil
}

// messageText returns the concatenated text/thinking content of a
// single message — the same flattening rule lastAssistantText uses.
// Returns ("", false) when the message has no copyable content.
func messageText(m gact.Message) (string, bool) {
	var b strings.Builder
	for _, p := range m.Parts {
		var chunk string
		switch p.Type {
		case gact.PartTypeText:
			chunk = p.Text
		case gact.PartTypeThinking:
			if p.Thinking == "" {
				continue
			}
			chunk = "<thinking>\n" + p.Thinking + "\n</thinking>"
		default:
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString(chunk)
	}
	if b.Len() == 0 {
		return "", false
	}
	return b.String(), true
}

func messageTranscriptText(msgs []gact.Message, msgIdx int) (string, bool) {
	if msgIdx < 0 || msgIdx >= len(msgs) {
		return "", false
	}
	m := msgs[msgIdx]
	var b strings.Builder
	for _, p := range m.Parts {
		var chunk string
		if p.Type == gact.PartTypeToolCall {
			chunk = toolCallCopyText(p)
		} else {
			chunk, _ = semanticPartCopyText(msgs, msgIdx, p)
		}
		if chunk == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString(chunk)
	}
	if b.Len() == 0 {
		return "", false
	}
	return b.String(), true
}

func selectedConversationBlockText(msgs []gact.Message, msgIdx int, addrIdx int) (string, bool) {
	if msgIdx < 0 || msgIdx >= len(msgs) {
		return "", false
	}
	m := msgs[msgIdx]
	addr := addressablePartsOf(m)
	if addrIdx < 0 || addrIdx >= len(addr) {
		return "", false
	}
	partIdx := addr[addrIdx]
	if partIdx < 0 || partIdx >= len(m.Parts) {
		return "", false
	}
	return conversationPartCopyText(msgs, msgIdx, m.Parts[partIdx])
}

func conversationPartCopyText(msgs []gact.Message, msgIdx int, p gact.Part) (string, bool) {
	if text, ok := semanticPartCopyText(msgs, msgIdx, p); ok {
		return text, true
	}
	return "", false
}

func semanticPartCopyText(msgs []gact.Message, msgIdx int, p gact.Part) (string, bool) {
	switch p.Type {
	case gact.PartTypeText:
		return cleanCopiedSemanticText(p.Text), strings.TrimSpace(p.Text) != ""
	case gact.PartTypeThinking:
		if strings.TrimSpace(p.Thinking) == "" {
			return "", false
		}
		return cleanCopiedSemanticText("<thinking>\n" + p.Thinking + "\n</thinking>"), true
	case gact.PartTypeExpertHandoff:
		text := expertHandoffCopyText(p)
		return text, strings.TrimSpace(text) != ""
	case gact.PartTypeToolCall:
		if p.CallID != "" {
			if result, ok := matchingToolResultForCall(msgs, msgIdx, p.CallID); ok {
				if text := toolResultCopyText(result); text != "" {
					return text, true
				}
			}
		}
		text := toolCallCopyText(p)
		return text, strings.TrimSpace(text) != ""
	case gact.PartTypeToolResult:
		if text := toolResultCopyText(p); text != "" {
			return text, true
		}
	case gact.PartTypeFileDiff:
		before, after := "", ""
		if p.Before != nil {
			before = *p.Before
		}
		if p.After != nil {
			after = *p.After
		}
		return "--- before ---\n" + before + "\n\n+++ after +++\n" + after, true
	case gact.PartTypeError:
		text := "Error: " + firstNonEmpty(p.Code, "error")
		if strings.TrimSpace(p.Message) != "" {
			text += "\n" + strings.TrimSpace(p.Message)
		}
		return cleanCopiedSemanticText(text), true
	default:
		text := strings.TrimSpace(partDetailText(p))
		return cleanCopiedSemanticText(text), text != ""
	}
	return "", false
}

func expertHandoffCopyText(p gact.Part) string {
	md := p.Metadata
	agent := firstNonEmpty(stringValue(md["agent_id"]), stringValue(md["expert"]), "expert")
	parent := firstNonEmpty(stringValue(md["parent_id"]), stringValue(md["parent"]))
	stage := firstNonEmpty(stringValue(md["stage"]), stringValue(md["dispatch_target"]))
	status := firstNonEmpty(stringValue(md["status"]), "observed")
	head := plainExpertHandoffNarrative(parent, agent, stage, status)
	if selected := stringValue(md["selected_agent"]); selected != "" && strings.Contains(strings.ToLower(stage), "agent.invocation.completed") {
		head = agent + " selected " + selected
	}
	meta := []string{}
	if status != "" {
		meta = append(meta, status)
	}
	if stageLabel := expertHandoffStageLabel(stage); stageLabel != "" {
		meta = append(meta, stageLabel)
	}
	if duration, ok := floatValue(md["duration_ms"]); ok && duration > 0 {
		meta = append(meta, fmt.Sprintf("%.0fms", duration))
	}
	if len(meta) > 0 {
		head += " - " + strings.Join(meta, " - ")
	}
	output := summarizeExpertHandoffOutput(expertHandoffOutputSummary(p))
	if strings.TrimSpace(output) == "" {
		return cleanCopiedSemanticText(head)
	}
	return cleanCopiedSemanticText(head + "\n" + output)
}

func plainExpertHandoffNarrative(parent, agent, stage, status string) string {
	stage = strings.ToLower(strings.TrimSpace(stage))
	status = strings.ToLower(strings.TrimSpace(status))
	switch {
	case status == "failed" || status == "failure" || status == "error":
		if parent != "" && agent != "" {
			return agent + " failed while returning to " + parent
		}
		return agent + " failed"
	case strings.Contains(stage, "started"):
		if parent != "" && agent != "" {
			return parent + " handed work to " + agent
		}
		return agent + " started"
	case strings.Contains(stage, "completed"):
		if parent != "" && agent != "" {
			return agent + " returned evidence to " + parent
		}
		return agent + " returned evidence"
	case strings.Contains(stage, "parent.resumed") || strings.Contains(stage, "parent_resumed"):
		if parent != "" && agent != "" {
			return parent + " resumed after " + agent
		}
		return agent + " resumed"
	default:
		if parent != "" && agent != "" {
			return parent + " -> " + agent
		}
		return agent
	}
}

func toolCallCopyText(p gact.Part) string {
	name := toolDisplayName(p.ToolName)
	summary := toolCallSummary(p)
	rows := []string{"Tool call: " + name}
	if strings.TrimSpace(p.ToolName) != "" && strings.TrimSpace(p.ToolName) != name {
		rows = append(rows, "tool: "+strings.TrimSpace(p.ToolName))
	}
	if strings.TrimSpace(summary) == "" {
		return cleanCopiedSemanticText(strings.Join(rows, "\n"))
	}
	rows = append(rows, "Args: "+summary)
	return cleanCopiedSemanticText(strings.Join(rows, "\n"))
}

func toolResultCopyText(p gact.Part) string {
	raw := strings.TrimSpace(flattenToolResult(p))
	if raw == "" {
		return ""
	}
	if summary := summarizeToolResultText(p.ToolName, raw); summary != "" {
		raw = summary
	}
	return cleanCopiedSemanticText(raw)
}

func cleanCopiedSemanticText(text string) string {
	text = strings.ReplaceAll(text, "\u00a0", " ")
	text = strings.ReplaceAll(text, "\u202f", " ")
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t")
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func matchingToolResultForCall(msgs []gact.Message, msgIdx int, callID string) (gact.Part, bool) {
	if callID == "" || msgIdx < 0 || msgIdx >= len(msgs) {
		return gact.Part{}, false
	}
	for _, p := range msgs[msgIdx].Parts {
		if p.Type == gact.PartTypeToolResult && p.CallID == callID {
			return p, true
		}
	}
	for i := msgIdx + 1; i < len(msgs); i++ {
		m := msgs[i]
		if m.Role != gact.RoleTool {
			break
		}
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeToolResult && p.CallID == callID {
				return p, true
			}
		}
	}
	return gact.Part{}, false
}

// fullConversationText concatenates every message's text into a
// single role-prefixed transcript, suitable for pasting into a
// bug report, another LLM, or a teammate. Each message opens with
// `## user:` / `## assistant:` / `## tool:` etc. so the blocks are
// grammatically separable. Messages with no copyable text are
// skipped silently (e.g. assistant turns that were pure tool_call).
// Returns ("", false) when nothing is copyable. (PPPPPPPP1)
func fullConversationText(msgs []gact.Message) (string, bool) {
	var b strings.Builder
	for i, m := range msgs {
		txt, ok := messageTranscriptText(msgs, i)
		if !ok {
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		role := string(m.Role)
		if role == "" {
			role = "message"
		}
		b.WriteString("## ")
		b.WriteString(role)
		b.WriteString(":\n")
		b.WriteString(txt)
	}
	if b.Len() == 0 {
		return "", false
	}
	return b.String(), true
}

// lastUserText walks msgs in reverse and returns the concatenated
// text of the newest user message. Multiple text parts are joined
// with blank-line separators; non-text parts are skipped because the
// retry payload is a plain-text resend (the backend will re-run any
// tool calls itself).
//
// Returns ("", false) when there is no user message, so the caller
// can surface "no user message to retry" rather than posting "".
func lastUserText(msgs []gact.Message) (string, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		if m.Role != gact.RoleUser {
			continue
		}
		var b strings.Builder
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeText || p.Text == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n\n")
			}
			b.WriteString(p.Text)
		}
		if b.Len() == 0 {
			// User message with no text (e.g. only an image) —
			// not retryable as a plain-text resend.
			return "", false
		}
		return b.String(), true
	}
	return "", false
}

// lastAssistantText walks msgs in reverse order and returns the
// concatenated plain text of the newest assistant message. Multiple
// text/thinking parts are joined with blank lines to preserve para
// structure; tool_call and tool_result parts are omitted because
// they rarely carry copy-worthy free text.
//
// Returns ("", false) when there is no assistant message in the
// slice so the caller can surface a useful "nothing to copy" hint
// rather than silently putting an empty string on the clipboard.
func lastAssistantText(msgs []gact.Message) (string, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		if m.Role != gact.RoleAssistant {
			continue
		}
		var b strings.Builder
		for _, p := range m.Parts {
			var chunk string
			switch p.Type {
			case gact.PartTypeText:
				chunk = p.Text
			case gact.PartTypeThinking:
				// Thinking is fenced so the recipient can strip or
				// keep it depending on what they're doing with the
				// copied text.
				if p.Thinking == "" {
					continue
				}
				chunk = "<thinking>\n" + p.Thinking + "\n</thinking>"
			default:
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n\n")
			}
			b.WriteString(chunk)
		}
		if b.Len() == 0 {
			// Assistant message exists but carries no text content
			// (e.g. only tool calls). Treat as "no copyable text".
			return "", false
		}
		return b.String(), true
	}
	return "", false
}
