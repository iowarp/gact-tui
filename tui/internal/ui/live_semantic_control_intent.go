package ui

// live_semantic_control_intent.go parses and summarizes workflow control-intent from semantic event payloads.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

type semanticControlIntent struct {
	nextExpert string
	nextAction string
	blocker    string
}

func semanticControlIntentSummary(payload map[string]any, eventType string, rawSummary string) string {
	if !strings.HasPrefix(eventType, "blueprint.delegation.") && !strings.HasPrefix(eventType, "agent.invocation.") {
		return ""
	}
	nested := mapValue(payload["payload"])
	intent := parseSemanticControlIntent(rawSummary)
	intent.nextExpert = firstNonEmpty(
		intent.nextExpert,
		stringValue(nested["next_expert"]),
		stringValue(payload["next_expert"]),
	)
	intent.nextAction = firstNonEmpty(
		intent.nextAction,
		stringValue(nested["next_action"]),
		stringValue(payload["next_action"]),
	)
	intent.blocker = firstNonEmpty(
		intent.blocker,
		stringValue(nested["blocker"]),
		stringValue(payload["blocker"]),
	)
	if contract := mapValue(nested["continuation_contract"]); len(contract) > 0 {
		intent.nextExpert = firstNonEmpty(intent.nextExpert, stringValue(contract["next_expert"]))
		intent.nextAction = firstNonEmpty(intent.nextAction, stringValue(contract["next_action"]))
	}
	if contract := mapValue(payload["continuation_contract"]); len(contract) > 0 {
		intent.nextExpert = firstNonEmpty(intent.nextExpert, stringValue(contract["next_expert"]))
		intent.nextAction = firstNonEmpty(intent.nextAction, stringValue(contract["next_action"]))
	}
	if blocker := normalizeSemanticControlValue(intent.blocker, 140); blocker != "" {
		return "blocked: " + blocker
	}
	action := normalizeSemanticControlValue(intent.nextAction, 120)
	expert := strings.TrimSpace(intent.nextExpert)
	if action == "" && expert == "" {
		return ""
	}
	if action != "" && expert != "" {
		return "next: " + expert + " - " + action
	}
	if action != "" {
		return "next: " + action
	}
	return "next: " + expert
}

func appendSemanticControlIntent(summary, intent string) string {
	summary = strings.TrimSpace(summary)
	intent = strings.TrimSpace(intent)
	if intent == "" {
		return summary
	}
	if summary == "" {
		return intent
	}
	if strings.Contains(strings.ToLower(summary), strings.ToLower(intent)) {
		return summary
	}
	if looksLikeMarkdownBlock(expandInlineMarkdownTables(summary)) {
		return summary + "\n\n_" + intent + "_"
	}
	return strings.TrimRight(summary, ".") + " · " + intent
}

func parseSemanticControlIntent(text string) semanticControlIntent {
	return semanticControlIntent{
		nextExpert: semanticControlField(text, "NEXT_EXPERT:"),
		nextAction: semanticControlField(text, "NEXT_ACTION:"),
		blocker:    semanticControlField(text, "BLOCKER:"),
	}
}

func semanticControlField(text, marker string) string {
	text = strings.TrimSpace(strings.Join(strings.Fields(text), " "))
	if text == "" {
		return ""
	}
	upper := strings.ToUpper(text)
	idx := strings.Index(upper, marker)
	if idx < 0 {
		return ""
	}
	rest := strings.TrimSpace(text[idx+len(marker):])
	if rest == "" {
		return ""
	}
	upperRest := strings.ToUpper(rest)
	end := len(rest)
	for _, nextMarker := range []string{
		" NEXT_EXPERT:",
		" NEXT_ACTION:",
		" BLOCKER:",
		" DO_NOT_",
		" CONTINUATION_CONTRACT=",
		" RESOURCE URL:",
		" RESOURCE ...",
	} {
		if strings.TrimSpace(nextMarker) == marker {
			continue
		}
		if nextIdx := strings.Index(upperRest, nextMarker); nextIdx >= 0 && nextIdx < end {
			end = nextIdx
		}
	}
	return strings.TrimSpace(rest[:end])
}

func normalizeSemanticControlValue(text string, limit int) string {
	text = strings.TrimSpace(strings.Join(strings.Fields(text), " "))
	if text == "" {
		return ""
	}
	for _, cut := range []string{"; otherwise ", " otherwise ", " DO_NOT_", " continuation_contract="} {
		if idx := strings.Index(strings.ToLower(text), strings.ToLower(cut)); idx >= 0 {
			text = strings.TrimSpace(text[:idx])
		}
	}
	parts := strings.Fields(text)
	if len(parts) > 1 && strings.Contains(parts[0], "_") && semanticControlArgIsPath(parts[1]) {
		parts = parts[:1]
		text = strings.Join(parts, " ")
	}
	if len(parts) > 0 && strings.Contains(parts[0], "_") && !strings.Contains(parts[0], "/") {
		parts[0] = strings.ReplaceAll(parts[0], "_", " ")
		text = strings.Join(parts, " ")
	}
	text = shortenKnownPaths(text)
	replacements := map[string]string{
		"sac":   "SAC",
		"ndp":   "NDP",
		"nws":   "NWS",
		"cimis": "CIMIS",
		"id":    "ID",
	}
	words := strings.Fields(text)
	for i, word := range words {
		key := strings.ToLower(strings.Trim(word, ".,;:"))
		if repl, ok := replacements[key]; ok {
			words[i] = strings.Replace(word, strings.Trim(word, ".,;:"), repl, 1)
		}
	}
	text = strings.Join(words, " ")
	if limit <= 0 {
		limit = 120
	}
	return textutil.Truncate(text, limit)
}

func semanticControlArgIsPath(text string) bool {
	text = strings.TrimSpace(text)
	return strings.HasPrefix(text, "/") ||
		strings.HasPrefix(text, "~/") ||
		strings.HasPrefix(text, "./") ||
		strings.HasPrefix(text, "../") ||
		strings.Contains(text, "://")
}
