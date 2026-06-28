package ui

// render_tool_result_pseudo.go summarizes non-JSON pseudo-structured tool result text.

import "strings"

func summarizeNonJSONToolResultText(toolName string, rawText string) string {
	lowerTool := strings.ToLower(strings.TrimSpace(toolName))
	if strings.Contains(lowerTool, "geo_geocode") || strings.Contains(lowerTool, "geocode") {
		return summarizePseudoGeocodeResult(rawText)
	}
	return ""
}

func summarizePseudoGeocodeResult(rawText string) string {
	name := firstNonEmpty(
		pseudoFieldString(rawText, "display_name"),
		pseudoFieldString(rawText, "name"),
	)
	lat := pseudoFieldNumber(rawText, "lat")
	lon := pseudoFieldNumber(rawText, "lon")
	provenance := pseudoFieldString(rawText, "provenance")
	if name == "" && (lat == "" || lon == "") {
		return ""
	}
	var rows []string
	if name != "" {
		rows = append(rows, name)
	}
	if lat != "" && lon != "" {
		rows = append(rows, "center: "+lat+", "+lon)
	}
	if provenance != "" {
		rows = append(rows, "source: "+provenance)
	}
	return strings.Join(rows, "\n")
}

func pseudoFieldString(rawText, key string) string {
	for _, quote := range []string{"'", `"`} {
		token := quote + key + quote + ":"
		idx := strings.Index(rawText, token)
		if idx < 0 {
			continue
		}
		rest := strings.TrimSpace(rawText[idx+len(token):])
		if rest == "" || (rest[0] != '\'' && rest[0] != '"') {
			continue
		}
		endQuote := rest[0]
		rest = rest[1:]
		end := strings.IndexRune(rest, rune(endQuote))
		if end >= 0 {
			return strings.TrimSpace(rest[:end])
		}
	}
	return ""
}

func pseudoFieldNumber(rawText, key string) string {
	for _, quote := range []string{"'", `"`} {
		token := quote + key + quote + ":"
		idx := strings.Index(rawText, token)
		if idx < 0 {
			continue
		}
		rest := strings.TrimSpace(rawText[idx+len(token):])
		end := 0
		for end < len(rest) {
			ch := rest[end]
			if (ch >= '0' && ch <= '9') || ch == '-' || ch == '+' || ch == '.' {
				end++
				continue
			}
			break
		}
		return strings.TrimSpace(rest[:end])
	}
	return ""
}
