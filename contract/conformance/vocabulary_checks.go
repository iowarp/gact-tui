package conformance

// CLIO-232 (Slice B): the wire-event-vocabulary drift class. The SPEC's two
// normative event-`type` blocks are the source of truth — §7.7 for GACT 0.2
// and §7.8 for GACT 0.3. This section parses both from a SPEC file and asserts
// every event type observed on a live session stream is in the block for the
// version that event's own envelope declares (`protocol_version`); custom
// `x.{vendor}.*` types (SPEC §8.4) are exempt. The conformance client
// negotiates 0.3 via `X-GACT-Version` (§3.2.2), so a 0.3-capable backend is
// checked against §7.8 while a 0.2-only backend, which ignores the header and
// keeps emitting bare 0.2 envelopes, is still checked against §7.7.
//
// Set-equality of the 0.3 block against the client's own decoder is a separate
// gate: packages/core/src/v3/spec_vocabulary.test.ts.
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

// vocabLineRe is the shared line grammar of both blocks, identical to the TS
// parser's regex: `<event.type> <implemented|spec-only>`.
var vocabLineRe = regexp.MustCompile(`^([a-z][a-z0-9_.]*) (implemented|spec-only)$`)

var vocabNextHeadingRe = regexp.MustCompile(`^#+\s`)

// specVocabulary locates one normative vocabulary block in the SPEC: the
// section label used in failure messages, the heading anchor, and the fenced
// block's info string (which distinguishes §7.8's vocabulary block from the
// `ts` envelope block that precedes it).
type specVocabulary struct {
	section  string
	heading  *regexp.Regexp
	fenceTag string
}

var (
	// vocabularyV02 is SPEC §7.7 — the GACT 0.2 bus vocabulary.
	vocabularyV02 = specVocabulary{
		section:  "§7.7",
		heading:  regexp.MustCompile(`^#+\s.*§7\.7\b`),
		fenceTag: "wire-vocabulary",
	}
	// vocabularyV03 is SPEC §7.8 — the GACT 0.3 scoped-event vocabulary the
	// conformance client negotiates.
	vocabularyV03 = specVocabulary{
		section:  "§7.8",
		heading:  regexp.MustCompile(`^#+\s.*§7\.8\b`),
		fenceTag: "wire-vocabulary-v3",
	}
)

// loadEventVocabulary parses one normative fenced block from the SPEC file at
// specPath into the set of allowed wire event-type names. It fails on a
// missing section, a missing/unclosed block, or any non-matching non-blank,
// non-comment line — the same strictness as the TS gate.
func loadEventVocabulary(specPath string, want specVocabulary) (map[string]bool, error) {
	f, err := os.Open(specPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	vocab := map[string]bool{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)

	fenceOpen := "```" + want.fenceTag
	foundSection := false
	inSection := false
	inBlock := false
	for sc.Scan() {
		line := sc.Text()
		switch {
		case !inSection:
			if want.heading.MatchString(line) {
				inSection = true
				foundSection = true
			}
		case !inBlock:
			if strings.TrimSpace(line) == fenceOpen {
				inBlock = true
			} else if vocabNextHeadingRe.MatchString(line) {
				// Next heading reached before the tagged fenced block.
				return nil, fmt.Errorf("SPEC %s %s block not found in %s", want.section, fenceOpen, specPath)
			}
		default: // inside the fenced block
			if strings.HasPrefix(line, "```") {
				// Block closed — stop scanning.
				if len(vocab) == 0 {
					return nil, fmt.Errorf("SPEC %s vocabulary block is empty in %s", want.section, specPath)
				}
				return vocab, nil
			}
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			m := vocabLineRe.FindStringSubmatch(trimmed)
			if m == nil {
				return nil, fmt.Errorf("SPEC %s line does not match the grammar: %q", want.section, line)
			}
			if vocab[m[1]] {
				return nil, fmt.Errorf("SPEC %s lists %q more than once", want.section, m[1])
			}
			vocab[m[1]] = true
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if !foundSection {
		return nil, fmt.Errorf("SPEC %s heading not found in %s", want.section, specPath)
	}
	return nil, fmt.Errorf("SPEC %s vocabulary block is not closed in %s", want.section, specPath)
}

// isCustomVendorType reports whether a type is a namespaced custom event
// (SPEC §8.4: `x.{vendor}.{event}`), which is exempt from the vocabulary.
func isCustomVendorType(typ string) bool {
	return strings.HasPrefix(typ, "x.")
}

// vocabularyForProtocol picks the normative block that governs an event, using
// the version the event's own envelope declares — never a client guess. GACT
// 0.3 envelopes carry `protocol_version: "0.3"` (§7.8); a 0.2 envelope has no
// such field (§7.2), so an absent or unrecognised value means 0.2.
func vocabularyForProtocol(protocolVersion string) specVocabulary {
	if protocolVersion == "0.3" {
		return vocabularyV03
	}
	return vocabularyV02
}

// checkEventVocabulary provokes session traffic, then asserts every observed
// live SSE `data.type` is present in the SPEC vocabulary block for the protocol
// version that event declares — §7.8 for the 0.3 dialect the client negotiates
// (§3.2.2), §7.7 for a 0.2-only backend that ignores the header (custom
// `x.{vendor}.*` types exempt). Emitted-but-unspecified is the drift class this
// locks out: a backend that starts emitting a type the contract never declared
// fails here.
func checkEventVocabulary(t Reporter, c *conformClient, sid, wsID, specPath string, budget time.Duration) {
	t.Helper()

	vocabs := map[string]map[string]bool{}
	for _, want := range []specVocabulary{vocabularyV02, vocabularyV03} {
		vocab, err := loadEventVocabulary(specPath, want)
		if err != nil {
			t.Fatalf("load SPEC %s vocabulary: %v", want.section, err)
		}
		vocabs[want.section] = vocab
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
		t.Fatalf("no SSE events observed within %s — cannot assert the wire vocabulary", budget)
	}

	reported := map[string]bool{}
	for _, ev := range events {
		if ev.Type == "" || isCustomVendorType(ev.Type) {
			continue
		}
		want := vocabularyForProtocol(ev.ProtocolVersion)
		key := want.section + " " + ev.Type
		if !vocabs[want.section][ev.Type] && !reported[key] {
			reported[key] = true
			t.Errorf("observed SSE event type %q is not in the SPEC %s wire vocabulary (and is not a custom x.{vendor}.* type, §8.4) — the emitted event set has drifted from the contract", ev.Type, want.section)
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
