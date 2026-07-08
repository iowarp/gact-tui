// Package valuefmt provides stateless value-formatting helpers for the TUI:
// value coercion, JSON/text compaction, label humanization, and path shortening.
//
// It is a leaf package: it depends only on the standard library and must not
// import the ui package or any stateful/framework package.
package valuefmt

import (
	"encoding/json"
	"fmt"
	"strings"
)

// CompactJSON renders v as a compact one-line string. Strings are returned
// trimmed; other values are JSON-marshaled, falling back to fmt.Sprint on error.
func CompactJSON(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprint(v)
	}
	return string(b)
}

// StringValue returns v as a string when it is one, else the empty string.
func StringValue(v any) string {
	s, _ := v.(string)
	return s
}

// FloatValue coerces common numeric kinds to float64, reporting whether v was numeric.
func FloatValue(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}

// MapValue returns v as a map[string]any when it is one, else nil.
func MapValue(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return nil
}

// FirstNonEmpty returns the first value whose trimmed form is non-empty, else "".
func FirstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// MinInt returns the smaller of a and b.
func MinInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

// CompactCatalogText collapses runs of whitespace in text to single spaces.
func CompactCatalogText(text string) string {
	return strings.Join(strings.Fields(text), " ")
}

// FirstNumericValue returns the first numeric value found in result under the
// given keys, reporting whether any was numeric.
func FirstNumericValue(result map[string]any, keys ...string) (float64, bool) {
	for _, key := range keys {
		if value, ok := FloatValue(result[key]); ok {
			return value, true
		}
	}
	return 0, false
}

// HumanizeAgentLabel turns an identifier-style label into spaced, collapsed words.
func HumanizeAgentLabel(label string) string {
	label = strings.TrimSpace(label)
	label = strings.ReplaceAll(label, "_", " ")
	label = strings.ReplaceAll(label, "-", " ")
	return strings.Join(strings.Fields(label), " ")
}

// PluralizeCount formats count with noun, appending "s" for non-singular counts.
func PluralizeCount(count int, noun string) string {
	if count == 1 {
		return fmt.Sprintf("1 %s", noun)
	}
	return fmt.Sprintf("%d %ss", count, noun)
}

// ShortenKnownPaths shortens long slash-separated path-like fields within text.
func ShortenKnownPaths(text string) string {
	fields := strings.Fields(text)
	for i, field := range fields {
		trimmed := strings.Trim(field, ".,;:)]}")
		if strings.Contains(trimmed, "/") && len(trimmed) > 60 {
			fields[i] = strings.Replace(field, trimmed, ShortenPathForInline(trimmed), 1)
		}
	}
	return strings.Join(fields, " ")
}

// ShortenPathForInline collapses a long path to ".../parent/tail" for inline display.
func ShortenPathForInline(path string) string {
	path = strings.TrimSpace(path)
	if path == "" || len(path) <= 54 || !strings.Contains(path, "/") {
		return path
	}
	parts := strings.Split(path, "/")
	if len(parts) <= 2 {
		return path
	}
	tail := parts[len(parts)-1]
	parent := parts[len(parts)-2]
	if parent == "" {
		return "..." + "/" + tail
	}
	return ".../" + parent + "/" + tail
}

// SplitSummarySegments splits an output string into up to three display segments.
func SplitSummarySegments(output string) []string {
	var segments []string
	for _, raw := range strings.Split(output, " - ") {
		text := strings.TrimSpace(raw)
		if text == "" {
			continue
		}
		if (strings.Contains(text, "member=") || strings.Contains(text, ".SAC")) && len(segments) > 0 {
			continue
		}
		if strings.Contains(text, ": ") && len(text) > 120 {
			parts := strings.Split(text, ". ")
			for _, part := range parts {
				part = strings.TrimSpace(part)
				if part != "" {
					segments = append(segments, part)
				}
				if len(segments) >= 3 {
					return segments
				}
			}
			continue
		}
		segments = append(segments, text)
		if len(segments) >= 3 {
			break
		}
	}
	return segments
}
