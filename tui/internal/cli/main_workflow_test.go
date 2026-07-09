package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCLI_Voice covers PPP1: feed an audio file to gact voice,
// verify the transcribed text comes back non-empty.
func TestCLI_Voice(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "voice-target")

	// Drop a non-empty file (content doesn't matter - emulator
	// returns canned text regardless of input).
	dir := t.TempDir()
	audio := filepath.Join(dir, "clip.wav")
	if err := os.WriteFile(audio, []byte("not real wav data"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"voice", sid, audio)
	if code != 0 {
		t.Fatalf("voice: exit %d", code)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("voice: expected non-empty transcription, got %q", stdout)
	}

	// Empty file -> exit 2.
	empty := filepath.Join(dir, "empty.wav")
	if err := os.WriteFile(empty, []byte{}, 0o644); err != nil {
		t.Fatalf("write empty: %v", err)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"voice", sid, empty); code != 2 {
		t.Errorf("empty audio: expected exit 2, got %d", code)
	}
}

// TestCLI_Replay covers CCCC1: export a session, replay the file,
// assert the imported session has the same messages (re-IDed but
// content preserved).
func TestCLI_Replay(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	srcSid := createSession(t, url, "replay-source")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", srcSid, "the marker token is REPLAY_MARKER_42"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", srcSid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	dir := t.TempDir()
	exportFile := filepath.Join(dir, "export.json")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"export", srcSid, "-o", exportFile); code != 0 {
		t.Fatalf("export: exit %d", code)
	}

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"replay", exportFile)
	if code != 0 {
		t.Fatalf("replay: exit %d (stderr=%q)", code, stderr)
	}
	newSid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(newSid, "sess_") {
		t.Fatalf("replay should print new sid, got %q", stdout)
	}
	if newSid == srcSid {
		t.Errorf("imported session should have a fresh id, got same as src: %q", newSid)
	}

	// Log of the imported session should contain the marker token.
	logOut, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", newSid, "--limit", "100")
	if !strings.Contains(logOut, "REPLAY_MARKER_42") {
		t.Errorf("imported log missing marker: %q", logOut)
	}
}

// TestCLI_Summarize covers LL1: triggers /summarize and prints the
// updated session.summary. The emulator stamps a placeholder string
// so we just check it lands non-empty on stdout.
func TestCLI_Summarize(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "summarize-target")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"summarize", sid)
	if code != 0 {
		t.Fatalf("summarize: exit %d", code)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("summarize returned empty stdout")
	}

	// MMM6: --instructions round-trips into the resulting summary
	// (emulator echoes the prompt; real backends would feed it to
	// the summarizer). Use a fresh session so the placeholder doesn't
	// stick around from the first call.
	sid2 := createSession(t, url, "summarize-with-instr")
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"summarize", sid2, "--instructions", "tldr in 3 words")
	if code != 0 {
		t.Fatalf("summarize --instructions: exit %d", code)
	}
	if !strings.Contains(stdout, "tldr in 3 words") {
		t.Errorf("expected instructions echoed in summary, got %q", stdout)
	}
}

// TestCLI_Quick covers KK1: one-shot create + ask + delete chain.
// The session count before and after should be identical because
// quick cleans up the scratch session it creates.
func TestCLI_Quick(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	preList, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	preCount := strings.Count(preList, "\n")

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"quick", "--timeout", "30s", "please read main.go")
	if code != 0 {
		t.Fatalf("quick: exit %d, stderr=%q", code, stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Fatalf("quick returned empty stdout")
	}

	postList, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	postCount := strings.Count(postList, "\n")
	if postCount != preCount {
		t.Errorf("session count changed: pre=%d post=%d (cleanup didn't run?)", preCount, postCount)
	}
}
