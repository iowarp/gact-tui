package ui

import (
	"errors"
	"fmt"
	"strings"
	"testing"
)

func withNativeClipboardSpy(t *testing.T, available map[string]bool, failures map[string]error) *[]string {
	t.Helper()
	prevLookPath := clipboardLookPath
	prevRunCommand := clipboardRunCommand
	prevAtotto := clipboardAtottoWrite
	prevPreferred := clipboardPreferredCommand
	attempts := []string{}
	clipboardPreferredCommand = nil
	clipboardLookPath = func(name string) (string, error) {
		if available[name] {
			return "/fake/bin/" + name, nil
		}
		return "", errors.New("not found")
	}
	clipboardRunCommand = func(name string, args []string, input string) error {
		base := name[strings.LastIndex(name, "/")+1:]
		attempts = append(attempts, base+":"+input)
		if err := failures[base]; err != nil {
			return err
		}
		return nil
	}
	clipboardAtottoWrite = func(string) error {
		attempts = append(attempts, "atotto")
		return errors.New("atotto unavailable")
	}
	t.Cleanup(func() {
		clipboardLookPath = prevLookPath
		clipboardRunCommand = prevRunCommand
		clipboardAtottoWrite = prevAtotto
		clipboardPreferredCommand = prevPreferred
	})
	return &attempts
}

func TestWriteNativeClipboardUsesFirstInstalledUtility(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{
		"wl-copy": true,
		"xclip":   true,
	}, nil)

	if err := writeNativeClipboard("payload"); err != nil {
		t.Fatalf("writeNativeClipboard: %v", err)
	}
	if got := strings.Join(*attempts, ","); got != "wl-copy:payload" {
		t.Fatalf("attempts = %q, want wl-copy only", got)
	}
}

func TestWriteNativeClipboardFallsThroughInstalledUtilities(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{
		"wl-copy": true,
		"xclip":   true,
	}, map[string]error{
		"wl-copy": errors.New("wayland denied"),
	})

	if err := writeNativeClipboard("payload"); err != nil {
		t.Fatalf("writeNativeClipboard: %v", err)
	}
	if got := strings.Join(*attempts, ","); got != "wl-copy:payload,xclip:payload" {
		t.Fatalf("attempts = %q, want wl-copy then xclip", got)
	}
}

func TestWriteNativeClipboardReusesSuccessfulUtility(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{
		"wl-copy": true,
		"xclip":   true,
	}, nil)

	if err := writeNativeClipboard("first"); err != nil {
		t.Fatalf("first writeNativeClipboard: %v", err)
	}
	if err := writeNativeClipboard("second"); err != nil {
		t.Fatalf("second writeNativeClipboard: %v", err)
	}
	if got := strings.Join(*attempts, ","); got != "wl-copy:first,wl-copy:second" {
		t.Fatalf("attempts = %q, want cached wl-copy path without probing fallback utilities", got)
	}
}

func TestWriteNativeClipboardUsesPlatformBridgeUtilities(t *testing.T) {
	for _, tc := range []struct {
		name      string
		available map[string]bool
		want      string
	}{
		{name: "macos", available: map[string]bool{"pbcopy": true}, want: "pbcopy:payload"},
		{name: "wsl clip", available: map[string]bool{"clip.exe": true}, want: "clip.exe:payload"},
		{name: "wsl powershell", available: map[string]bool{"powershell.exe": true}, want: "powershell.exe:payload"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			attempts := withNativeClipboardSpy(t, tc.available, nil)
			if err := writeNativeClipboard("payload"); err != nil {
				t.Fatalf("writeNativeClipboard: %v", err)
			}
			if got := strings.Join(*attempts, ","); got != tc.want {
				t.Fatalf("attempts = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestWriteNativeClipboardReportsAllFallbacksWhenUnavailable(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{
		"xsel": true,
	}, map[string]error{
		"xsel": errors.New("display unavailable"),
	})

	err := writeNativeClipboard("payload")
	if err == nil {
		t.Fatal("writeNativeClipboard succeeded unexpectedly")
	}
	for _, want := range []string{"xsel", "display unavailable", "atotto/clipboard", "wl-copy", "xclip", "pbcopy", "clip.exe", "powershell.exe", "termux-clipboard-set"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("error missing %q:\n%v", want, err)
		}
	}
	if got := fmt.Sprint(*attempts); !strings.Contains(got, "xsel:payload") || !strings.Contains(got, "atotto") {
		t.Fatalf("attempts = %v, want xsel and atotto", *attempts)
	}
}

func TestWriteNativeClipboardReportsNoInstalledUtilities(t *testing.T) {
	attempts := withNativeClipboardSpy(t, map[string]bool{}, nil)

	err := writeNativeClipboard("payload")
	if err == nil {
		t.Fatal("writeNativeClipboard succeeded unexpectedly")
	}
	for _, want := range []string{"no native clipboard utilities found", "wl-copy", "xclip", "xsel", "pbcopy", "clip.exe", "powershell.exe", "termux-clipboard-set", "atotto/clipboard", "atotto unavailable"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("error missing %q:\n%v", want, err)
		}
	}
	if got := fmt.Sprint(*attempts); got != "[atotto]" {
		t.Fatalf("attempts = %v, want only atotto fallback", *attempts)
	}
}
