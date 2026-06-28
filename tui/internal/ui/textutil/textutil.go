// Package textutil holds pure text-primitive helpers — truncation, wrapping
// and human-readable formatting — with no dependency on the ui App or Theme.
// It is a clean leaf sub-package shared by the ui package and reusable on its
// own.
package textutil

import (
	"fmt"
	"strings"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

// Truncate clips s to max display cells, appending an ellipsis when it does
// not fit. ANSI-safe: it never slices through an escape sequence.
func Truncate(s string, max int) string {
	if max < 1 {
		return ""
	}
	if lipgloss.Width(s) <= max {
		return s
	}
	if max <= 1 {
		return "…"
	}
	return ansi.Truncate(s, max, "…")
}

// Wrap wraps s to width cells. Word-aware where possible. Newlines preserved.
func Wrap(s string, width int) string {
	if width <= 0 {
		return s
	}
	var out strings.Builder
	for _, line := range strings.Split(s, "\n") {
		if lipgloss.Width(line) <= width {
			out.WriteString(line)
			out.WriteString("\n")
			continue
		}
		prefix, text := splitLeadingWhitespace(line)
		prefixW := lipgloss.Width(prefix)
		lineWidth := width
		if prefixW > 0 && prefixW < width {
			lineWidth = width - prefixW
		}
		// naive word-wrap
		words := strings.Fields(text)
		cur := ""
		for _, w := range words {
			if lipgloss.Width(w) > lineWidth {
				if cur != "" {
					out.WriteString(prefix + cur)
					out.WriteString("\n")
					cur = ""
				}
				chunks := hardWrapWord(w, lineWidth)
				for i, chunk := range chunks {
					if i == len(chunks)-1 {
						cur = chunk
					} else {
						out.WriteString(prefix + chunk)
						out.WriteString("\n")
					}
				}
				continue
			}
			if lipgloss.Width(cur)+lipgloss.Width(w)+1 > lineWidth {
				if cur != "" {
					out.WriteString(prefix + cur)
					out.WriteString("\n")
				}
				cur = w
			} else {
				if cur == "" {
					cur = w
				} else {
					cur += " " + w
				}
			}
		}
		if cur != "" {
			out.WriteString(prefix + cur)
			out.WriteString("\n")
		}
	}
	return strings.TrimRight(out.String(), "\n")
}

func splitLeadingWhitespace(line string) (string, string) {
	idx := 0
	for idx < len(line) {
		switch line[idx] {
		case ' ', '\t':
			idx++
		default:
			return line[:idx], line[idx:]
		}
	}
	return line, ""
}

func hardWrapWord(word string, width int) []string {
	if width <= 0 || lipgloss.Width(word) <= width {
		return []string{word}
	}
	var chunks []string
	var cur strings.Builder
	curW := 0
	for _, r := range word {
		rw := lipgloss.Width(string(r))
		if curW > 0 && curW+rw > width {
			chunks = append(chunks, cur.String())
			cur.Reset()
			curW = 0
		}
		cur.WriteRune(r)
		curW += rw
	}
	if cur.Len() > 0 {
		chunks = append(chunks, cur.String())
	}
	return chunks
}

// WrapPlainRows wraps plain (non-ANSI) text to width cells, returning the
// rendered rows. Continuation rows are prefixed with indent.
func WrapPlainRows(text string, width int, indent string) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	if width <= 0 {
		return []string{text}
	}
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	rows := []string{}
	line := ""
	for _, word := range words {
		prefix := ""
		if len(rows) > 0 {
			prefix = indent
		}
		candidate := word
		if line != "" {
			candidate = line + " " + word
		}
		if lipgloss.Width(prefix+candidate) <= width {
			line = candidate
			continue
		}
		if line != "" {
			rows = append(rows, prefix+line)
			line = word
			continue
		}
		for lipgloss.Width(prefix+word) > width && width > lipgloss.Width(prefix) {
			limit := width - lipgloss.Width(prefix)
			chunk, rest := splitPlainToken(word, limit)
			rows = append(rows, prefix+chunk)
			if rest == "" {
				word = ""
				break
			}
			word = rest
		}
		line = word
	}
	if line != "" {
		prefix := ""
		if len(rows) > 0 {
			prefix = indent
		}
		rows = append(rows, prefix+line)
	}
	return rows
}

func splitPlainToken(s string, maxWidth int) (string, string) {
	if maxWidth <= 0 || s == "" {
		return "", s
	}
	runes := []rune(s)
	for i := 1; i <= len(runes); i++ {
		chunk := string(runes[:i])
		if lipgloss.Width(chunk) > maxWidth {
			if i == 1 {
				return chunk, string(runes[i:])
			}
			return string(runes[:i-1]), string(runes[i-1:])
		}
	}
	return s, ""
}

// PadRight pads s (using lipgloss-aware width) so columns line up.
func PadRight(s string, width int) string {
	w := lipgloss.Width(s)
	if w >= width {
		return s
	}
	return s + strings.Repeat(" ", width-w)
}

// FormatUptime turns seconds into a compact human string.
//
//	< 60s    -> "42s"
//	< 1h     -> "5m 12s"
//	otherwise-> "2h 14m"
func FormatUptime(sec int) string {
	if sec < 60 {
		return fmt.Sprintf("%ds", sec)
	}
	if sec < 3600 {
		return fmt.Sprintf("%dm %ds", sec/60, sec%60)
	}
	return fmt.Sprintf("%dh %dm", sec/3600, (sec%3600)/60)
}

// HumanBytes formats a byte count using binary (1024) units.
func HumanBytes(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	value := float64(size)
	for _, suffix := range []string{"KiB", "MiB", "GiB", "TiB"} {
		value /= unit
		if value < unit {
			return fmt.Sprintf("%.1f %s", value, suffix)
		}
	}
	return fmt.Sprintf("%.1f PiB", value/unit)
}

// HumanTokens formats a token count for the footer: raw digits below
// 1000, "1.2K" in the thousands, "1.2M" in the millions. Keeps the
// right-hand side of the footer compact when conversations grow.
//
// Two examples of the shape:
//
//	HumanTokens(942)     => "942"
//	HumanTokens(1500)    => "1.5K"
//	HumanTokens(15000)   => "15K"
//	HumanTokens(150000)  => "150K"
//	HumanTokens(1500000) => "1.5M"
//
// Fractional trimming rule: below 10 of a unit we keep one decimal
// place (so 1.5K is distinct from 2K); above that we drop the decimal
// entirely because it's noise at that magnitude. Same convention
// Kubernetes uses for resource quotas.
func HumanTokens(n int) string {
	switch {
	case n >= 1_000_000:
		if n >= 10_000_000 {
			return fmt.Sprintf("%dM", n/1_000_000)
		}
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	case n >= 1_000:
		if n >= 10_000 {
			return fmt.Sprintf("%dK", n/1_000)
		}
		return fmt.Sprintf("%.1fK", float64(n)/1_000)
	default:
		return fmt.Sprintf("%d", n)
	}
}

// HumanAgeShort renders a duration as a compact age stamp for
// per-session "updated Nm ago" suffixes. Negative durations clamp
// to "now" so clock skew does not print confusing "-5m ago".
func HumanAgeShort(d time.Duration) string {
	if d < 0 {
		return "now"
	}
	if d < time.Minute {
		return fmt.Sprintf("%ds ago", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	}
	return fmt.Sprintf("%dd ago", int(d.Hours()/24))
}
