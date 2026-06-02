package ui

import (
	"runtime"
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
	cmd := `printf 'RIFF$\x00\x00\x00WAVEfake'`
	if runtime.GOOS == "windows" {
		cmd = "echo RIFF-WAVEfake"
	}
	got, err := captureVoice(cmd)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.HasPrefix(string(got), "RIFF") {
		t.Errorf("expected WAV header, got %q", got)
	}
}

func TestCaptureVoice_NonZeroExitSurfaceStderr(t *testing.T) {
	cmd := `echo "boom" >&2; exit 7`
	if runtime.GOOS == "windows" {
		cmd = "echo boom 1>&2 && exit /b 7"
	}
	_, err := captureVoice(cmd)
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "boom") {
		t.Errorf("expected stderr 'boom' in error, got %v", err)
	}
}

func TestCaptureVoice_EmptyOutputIsError(t *testing.T) {
	cmd := "true"
	if runtime.GOOS == "windows" {
		cmd = "cd ."
	}
	_, err := captureVoice(cmd)
	if err == nil {
		t.Fatal("expected error on empty audio")
	}
	if !strings.Contains(err.Error(), "no audio") {
		t.Errorf("err = %v", err)
	}
}
