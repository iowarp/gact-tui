package conformance

// CLIO-232 (Slice B): the wire-event-vocabulary drift class. SPEC §7.7
// ("Machine-checked wire event vocabulary") is the normative source of the
// SSE event-`type` set. This section parses that block from a SPEC file and
// asserts every event type observed on a live session stream is in it —
// custom `x.{vendor}.*` types (SPEC §8.4) exempt. The TypeScript half of the
// This Go gate validates the legacy 0.2 vocabulary. The canonical 0.3 state
// vocabulary has an independent set-equality gate in
// packages/core/src/v3/spec_vocabulary.test.ts.
//
// The section is opt-in: it runs only when Options.SpecPath is set, so the
// `gact conformance` CLI and adapter callers that don't ship the SPEC stay
// backward-compatible.

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"
)

// vocabLineRe is the §7.7 line grammar, identical to the TS parser's regex:
// `<event.type> <implemented|spec-only>`.
var vocabLineRe = regexp.MustCompile(`^([a-z][a-z0-9_.]*) (implemented|spec-only)$`)

var (
	vocabHeadingRe     = regexp.MustCompile(`^#+\s.*§7\.7\b`)
	vocabNextHeadingRe = regexp.MustCompile(`^#+\s`)
)

// loadEventVocabulary parses the normative §7.7 fenced block from the SPEC
// file at specPath into the set of allowed wire event-type names. It fails
// on a missing section, a missing/unclosed block, or any non-matching
// non-blank, non-comment line — the same strictness as the TS gate.
func loadEventVocabulary(specPath string) (map[string]bool, error) {
	f, err := os.Open(specPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	vocab := map[string]bool{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)

	foundSection := false
	inSection := false
	inBlock := false
	for sc.Scan() {
		line := sc.Text()
		switch {
		case !inSection:
			if vocabHeadingRe.MatchString(line) {
				inSection = true
				foundSection = true
			}
		case !inBlock:
			if strings.HasPrefix(line, "```") {
				inBlock = true
			} else if vocabNextHeadingRe.MatchString(line) {
				// Next heading reached before any fenced block.
				return nil, fmt.Errorf("SPEC §7.7 fenced block not found in %s", specPath)
			}
		default: // inside the fenced block
			if strings.HasPrefix(line, "```") {
				// Block closed — stop scanning.
				if len(vocab) == 0 {
					return nil, fmt.Errorf("SPEC §7.7 vocabulary block is empty in %s", specPath)
				}
				return vocab, nil
			}
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			m := vocabLineRe.FindStringSubmatch(trimmed)
			if m == nil {
				return nil, fmt.Errorf("SPEC §7.7 line does not match the grammar: %q", line)
			}
			if vocab[m[1]] {
				return nil, fmt.Errorf("SPEC §7.7 lists %q more than once", m[1])
			}
			vocab[m[1]] = true
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if !foundSection {
		return nil, fmt.Errorf("SPEC §7.7 heading not found in %s", specPath)
	}
	return nil, fmt.Errorf("SPEC §7.7 fenced block is not closed in %s", specPath)
}

// isCustomVendorType reports whether a type is a namespaced custom event
// (SPEC §8.4: `x.{vendor}.{event}`), which is exempt from the vocabulary.
func isCustomVendorType(typ string) bool {
	return strings.HasPrefix(typ, "x.")
}

// checkEventVocabulary provokes session traffic, then asserts every observed
// live SSE `data.type` is present in the SPEC §7.7 vocabulary (custom
// `x.{vendor}.*` types exempt). Emitted-but-unspecified is the drift class
// this locks out: a backend that starts emitting a type the contract never
// declared fails here.
func checkEventVocabulary(t Reporter, c *conformClient, sid, wsID, specPath string, budget time.Duration) {
	t.Helper()

	vocab, err := loadEventVocabulary(specPath)
	if err != nil {
		t.Fatalf("load SPEC §7.7 vocabulary: %v", err)
	}

	// Provoke traffic so the replay window carries real events beyond the
	// connection preamble. Best-effort — a backend that rejects the post
	// still gets asserted against whatever history + preamble it replays.
	provokeSessionTraffic(c, sid, wsID)

	events, err := collectSSEEvents(c, sid, "0", budget)
	if err != nil {
		t.Fatalf("SSE vocabulary stream: %v", err)
	}
	if len(events) == 0 {
		t.Fatalf("no SSE events observed within %s — cannot assert the §7.7 vocabulary", budget)
	}

	reported := map[string]bool{}
	for _, ev := range events {
		if ev.Type == "" || isCustomVendorType(ev.Type) {
			continue
		}
		if !vocab[ev.Type] && !reported[ev.Type] {
			reported[ev.Type] = true
			t.Errorf("observed SSE event type %q is not in the SPEC §7.7 wire vocabulary (and is not a custom x.{vendor}.* type, §8.4) — the emitted event set has drifted from the contract", ev.Type)
		}
	}
}

// provokeSessionTraffic posts a throwaway message to nudge the backend into
// emitting a turn's worth of events. Errors are ignored: this is only a best
// -effort nudge, not an assertion.
func provokeSessionTraffic(c *conformClient, sid, wsID string) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	path := "/v1/sessions/" + sid + "/messages"
	if wsID != "" {
		path += "?workspace_id=" + wsID
	}
	body := map[string]any{
		"parts": []map[string]any{
			{"type": "text", "text": "conformance vocabulary probe"},
		},
	}
	if resp, _, err := c.postJSON(ctx, path, body); err == nil {
		_ = resp
	}
}
