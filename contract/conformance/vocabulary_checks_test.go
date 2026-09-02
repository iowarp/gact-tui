package conformance

import (
	"path/filepath"
	"testing"
)

func specPathForTest(t *testing.T) string {
	t.Helper()
	p, err := filepath.Abs("../SPEC.md")
	if err != nil {
		t.Fatalf("resolve SPEC.md: %v", err)
	}
	return p
}

// The two normative blocks must both parse, and each must carry the types its
// own dialect uses. The 0.3 block is what the client's negotiated dialect is
// judged against — before it was reachable, every §7.8 type read as drift.
func TestLoadEventVocabulary_BothBlocks(t *testing.T) {
	spec := specPathForTest(t)

	v02, err := loadEventVocabulary(spec, vocabularyV02)
	if err != nil {
		t.Fatalf("load §7.7: %v", err)
	}
	v03, err := loadEventVocabulary(spec, vocabularyV03)
	if err != nil {
		t.Fatalf("load §7.8: %v", err)
	}

	for _, typ := range []string{"message.part.delta", "server.connected", "turn.started"} {
		if !v02[typ] {
			t.Errorf("§7.7 vocabulary is missing %q", typ)
		}
	}
	for _, typ := range []string{"stream.live", "message.upserted", "a2ui.surface.upserted", "tool.upserted"} {
		if !v03[typ] {
			t.Errorf("§7.8 vocabulary is missing %q", typ)
		}
		if v02[typ] && typ != "message.completed" {
			t.Errorf("%q must not be in the §7.7 block — the blocks are distinct dialects", typ)
		}
	}
	// §7.8 opens with a ```ts envelope block; the loader must skip it and read
	// the tagged vocabulary block instead.
	if v03["GactV3Envelope"] || len(v03) < 10 {
		t.Fatalf("§7.8 loader picked up the wrong fenced block: %d entries", len(v03))
	}
}

// The block that governs an event is chosen from the version the envelope
// itself declares, never from a client guess.
func TestVocabularyForProtocol(t *testing.T) {
	for _, tc := range []struct {
		protocolVersion string
		want            string
	}{
		{"0.3", "§7.8"},
		{"0.2", "§7.7"},
		{"", "§7.7"},
		{"9.9", "§7.7"},
	} {
		if got := vocabularyForProtocol(tc.protocolVersion).section; got != tc.want {
			t.Errorf("vocabularyForProtocol(%q) = %s, want %s", tc.protocolVersion, got, tc.want)
		}
	}
}

// A 0.3 envelope carries its protocol_version through the SSE parser, which is
// what makes the dialect-correct vocabulary reachable.
func TestParseDriftEvent_CarriesProtocolVersion(t *testing.T) {
	v3, ok := parseDriftEvent(`data: {"protocol_version":"0.3","type":"stream.live","payload":{}}`)
	if !ok {
		t.Fatal("0.3 envelope did not parse")
	}
	if v3.ProtocolVersion != "0.3" || v3.Type != "stream.live" {
		t.Fatalf("parsed %+v", v3)
	}
	v2, ok := parseDriftEvent(`data: {"type":"server.connected","payload":{}}`)
	if !ok {
		t.Fatal("0.2 envelope did not parse")
	}
	if v2.ProtocolVersion != "" {
		t.Fatalf("0.2 envelope reported protocol_version %q, want empty", v2.ProtocolVersion)
	}
}
