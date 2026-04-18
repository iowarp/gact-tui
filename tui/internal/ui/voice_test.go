package ui

import (
	"strings"
	"testing"
)

func TestCaptureVoice_EmptyCmdReturnsPlaceholder(t *testing.T) {
	got, err := captureVoice("")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if string(got) != "placeholder audio" {
		t.Errorf("got %q, want placeholder", got)
	}
}

func TestCaptureVoice_SuccessfulShellCmd(t *testing.T) {
	got, err := captureVoice(`printf 'RIFF$\x00\x00\x00WAVEfake'`)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.HasPrefix(string(got), "RIFF") {
		t.Errorf("expected WAV header, got %q", got)
	}
}

func TestCaptureVoice_NonZeroExitSurfaceStderr(t *testing.T) {
	_, err := captureVoice(`echo "boom" >&2; exit 7`)
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "boom") {
		t.Errorf("expected stderr 'boom' in error, got %v", err)
	}
}

func TestCaptureVoice_EmptyOutputIsError(t *testing.T) {
	_, err := captureVoice("true")
	if err == nil {
		t.Fatal("expected error on empty audio")
	}
	if !strings.Contains(err.Error(), "no audio") {
		t.Errorf("err = %v", err)
	}
}
