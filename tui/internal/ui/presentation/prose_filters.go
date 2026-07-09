package presentation

// prose_filters.go is the ONE home for the TUI's transitional prose
// presentation filters — the Go port of the web client's
// apps/web/src/components/presentationFilters.ts + the cleanProse chain in
// transcriptDelegationModel.ts. Behaviour is intended to be behaviorally faithful
// to the web so the two clients render the same wire the same way (gact-tui #233
// parity). One known cosmetic difference: the state-blob splice trims the ASCII
// whitespace set (" \t\r\n"), not the full ECMAScript trimEnd/trimStart set
// (\f, \v, NBSP, U+2028/9), so a stray Unicode-space char adjacent to a stripped
// "typed workflow state:" blob may survive where the web trims it.
//
// Like the web module, these are DELIBERATELY transitional: each strips backend
// orchestration chrome the server still leaks onto the stream (clio #832). Per the
// "server owns the clean stream" rule they are format-based (whole-line status
// parentheticals, balanced JSON state blobs, section markers) — never a match on a
// backend's protocol vocabulary by key name — and are meant to be deleted, not
// weakened, once the server stops emitting the chrome. Do not add domain-specific
// keyword heuristics here.
//
// This lives in the presentation subpackage (not the flat ui package) per the
// #234 no-accretion freeze: new ui logic lands in an extracted subpackage.

import (
	"regexp"
	"strings"
)

// Ports of the web regex family (presentationFilters.ts:25-44). Go RE2 flags:
// (?i) case-insensitive, (?m) multi-line ^/$. JS `\b` word boundaries are RE2.
var (
	// A whole line that is only a status parenthetical the backend injected,
	// e.g. "(Delegating to the data expert …)", "(Awaiting synthesis …)".
	statusParenRE = regexp.MustCompile(`(?i)^\(\s*(?:initiat|rout|delegat|dispatch|await|synthesi[sz]|in progress|orchestrat|invoking|preparing|continuing|resuming|finaliz|coordinat|gathering|querying)[a-z]*\b[^)]*\)\s*$`)
	// Inline "(In progress …)" / "(awaiting …)" placeholders anywhere on a line.
	inProgressRE           = regexp.MustCompile(`(?i)\(\s*(?:in progress|awaiting)\b[^)]*\)`)
	bareInProgressLineRE   = regexp.MustCompile(`(?im)^\s*(?:in progress|awaiting)\s*:[^\n]*(?:\n|$)`)
	noUserFacingAnswerRE   = regexp.MustCompile(`(?im)^\s*\(\s*no user-facing answer yet\b[^)]*\)\s*(?:\n|$)`)
	stateCaptionLineRE     = regexp.MustCompile(`(?im)^\s*[^\n{}]{0,80}?\btyped workflow state\b[^\n{}]{0,40}:\s*$`)
	retainedEvidenceLineRE = regexp.MustCompile(`(?im)^\s*(?:\[\.\.\.delegation output truncated; exact evidence retained below\.\.\.\]|\[exact retained evidence index\])\s*$`)
	// A ChatAdapter section marker `[[ ## field ## ]]`, optionally backtick-wrapped.
	sectionMarkerRE = regexp.MustCompile("`?\\s*\\[\\[\\s*##\\s*[A-Za-z0-9_]+\\s*##\\s*\\]\\]\\s*`?")
	// Caption introducing a display-only typed-state JSON blob (no /m: ^ = string start).
	stateCaptionRE = regexp.MustCompile(`(?i)(^|\n)\s*[^\n{}]{0,80}?\btyped workflow state\b[^\n{}]{0,40}:\s*\n?\s*\{`)

	statusPrefixHeadRE = regexp.MustCompile(`^\s*\S+\s*->\s*\S+\s*\|`)
	trailingSpaceNLRE  = regexp.MustCompile(`[ \t]+\n`)
	tripleNLRE         = regexp.MustCompile(`\n{3,}`)
)

// findBalancedJsonEnd returns the index of the closing brace/bracket that balances
// the opener at start, or -1. Port of presentationUtils.ts:findBalancedJsonEnd
// (string-aware, escape-aware). Indexing is by byte, matching the caller which
// operates on byte offsets from the Go regexp match.
func findBalancedJsonEnd(text string, start int) int {
	if start < 0 || start >= len(text) {
		return -1
	}
	open := text[start]
	var close byte = '}'
	if open == '[' {
		close = ']'
	}
	depth := 0
	inString := false
	escaped := false
	for i := start; i < len(text); i++ {
		ch := text[i]
		if escaped {
			escaped = false
			continue
		}
		if ch == '\\' {
			escaped = inString
			continue
		}
		if ch == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		if ch == open {
			depth++
		}
		if ch == close {
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}

// StripClioScaffolding removes CLIO-generated status chrome glued into model
// answer/reasoning text — port of presentationFilters.ts:stripClioScaffolding.
// Format-based and conservative: only whole-line status parentheticals, a
// balanced "typed workflow state: {…}" blob, and leaked section markers.
func StripClioScaffolding(text string) string {
	if text == "" {
		return ""
	}
	out := text

	// 0) Strip leaked `[[ ## field ## ]]` section markers.
	out = sectionMarkerRE.ReplaceAllString(out, " ")

	// 1) Remove a `… typed workflow state: { … }` blob (caption + balanced JSON).
	for guard := 0; guard < 6; guard++ {
		loc := stateCaptionRE.FindStringSubmatchIndex(out)
		if loc == nil {
			break
		}
		matchStart := loc[0]
		// group 1 = (^|\n): loc[2]..loc[3]; empty when it matched string start.
		g1Len := 0
		if loc[2] >= 0 {
			g1Len = loc[3] - loc[2]
		}
		braceIdx := strings.IndexByte(out[matchStart:], '{')
		if braceIdx < 0 {
			break
		}
		braceIdx += matchStart
		end := findBalancedJsonEnd(out, braceIdx)
		if end < 0 {
			break
		}
		cut := matchStart + g1Len
		out = strings.TrimSpace(strings.TrimRight(out[:cut], " \t\r\n") + "\n" + strings.TrimLeft(out[end+1:], " \t\r\n"))
	}

	// 2) Drop inline `(In progress…)` / `(awaiting…)` / no-user-facing-answer lines.
	out = inProgressRE.ReplaceAllString(out, "")
	out = bareInProgressLineRE.ReplaceAllString(out, "")
	out = noUserFacingAnswerRE.ReplaceAllString(out, "")
	out = stateCaptionLineRE.ReplaceAllString(out, "")
	out = retainedEvidenceLineRE.ReplaceAllString(out, "")

	// 3) Drop whole-line status parentheticals.
	lines := strings.Split(out, "\n")
	kept := lines[:0]
	for _, line := range lines {
		if statusParenRE.MatchString(strings.TrimSpace(line)) {
			continue
		}
		kept = append(kept, line)
	}
	out = strings.Join(kept, "\n")

	// Final whitespace normalization (matches the web tail).
	out = trailingSpaceNLRE.ReplaceAllString(out, "\n")
	out = tripleNLRE.ReplaceAllString(out, "\n\n")
	return strings.TrimSpace(out)
}

// StripStatusPrefix strips a leading "A -> B | status | <stage> | <prose>" head —
// port of transcriptDelegationModel.ts:stripStatusPrefix. Structural (arrow head +
// short pipe segments), never a status-word match; never eats a markdown table row.
func StripStatusPrefix(text string) string {
	nl := strings.IndexByte(text, '\n')
	head := text
	if nl >= 0 {
		head = text[:nl]
	}
	if !statusPrefixHeadRE.MatchString(head) {
		return text
	}
	lastPipe := strings.LastIndexByte(head, '|')
	if lastPipe < 0 {
		return text
	}
	for _, seg := range strings.Split(head[:lastPipe], "|") {
		if len(strings.TrimSpace(seg)) > 40 {
			return text
		}
	}
	rest := strings.TrimLeft(head[lastPipe+1:], " \t")
	if nl >= 0 {
		return rest + text[nl:]
	}
	return rest
}

// CleanProse is the web's cleanProse (transcriptDelegationModel.ts:190): strip the
// scaffolding, then the status prefix, then trim. Prose that cleans to empty was
// pure orchestration chrome and the caller drops the row (web parity).
func CleanProse(text string) string {
	return strings.TrimSpace(StripStatusPrefix(StripClioScaffolding(text)))
}
