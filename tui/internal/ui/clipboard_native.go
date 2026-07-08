package ui

// clipboard_native.go writes text to the OS clipboard via platform clipboard commands.

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"github.com/atotto/clipboard"
)

// clipboardWrite is a package-level indirection so tests can swap the
// backend without touching the OS clipboard. Production tries concrete
// terminal clipboard utilities first, then falls back to atotto/clipboard.
var clipboardWrite = writeNativeClipboard
var clipboardLookPath = exec.LookPath
var clipboardAtottoWrite = clipboard.WriteAll
var clipboardRunCommand = func(name string, args []string, input string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdin = strings.NewReader(input)
	return cmd.Run()
}
var clipboardForcedFailure = func() bool {
	return os.Getenv("GACT_CLIPBOARD_FORCE_FAILURE") == "1"
}
var osc52Write = func(text string) error {
	encoded := base64.StdEncoding.EncodeToString([]byte(text))
	_, err := fmt.Fprintf(os.Stdout, "\x1b]52;c;%s\a", encoded)
	return err
}

type clipboardCommand struct {
	name string
	path string
	args []string
}

var clipboardPreferredCommand *clipboardCommand

func nativeClipboardCommands() []clipboardCommand {
	return []clipboardCommand{
		{name: "wl-copy"},
		{name: "xclip", args: []string{"-selection", "clipboard"}},
		{name: "xsel", args: []string{"--clipboard", "--input"}},
		{name: "pbcopy"},
		{name: "clip.exe"},
		{name: "powershell.exe", args: []string{"-NoProfile", "-Command", "$input | Set-Clipboard"}},
		{name: "termux-clipboard-set"},
	}
}

func writeNativeClipboard(text string) error {
	var tried []string
	var failures []string
	fallbackNames := "wl-copy, xclip, xsel, pbcopy, clip.exe, powershell.exe, termux-clipboard-set, atotto/clipboard"
	if clipboardPreferredCommand != nil {
		cmd := *clipboardPreferredCommand
		path := valuefmt.FirstNonEmpty(cmd.path, cmd.name)
		tried = append(tried, cmd.name)
		if err := clipboardRunCommand(path, cmd.args, text); err == nil {
			return nil
		} else {
			failures = append(failures, cmd.name+": "+err.Error())
			clipboardPreferredCommand = nil
		}
	}
	for _, cmd := range nativeClipboardCommands() {
		if clipboardPreferredCommand != nil && cmd.name == clipboardPreferredCommand.name {
			continue
		}
		path, err := clipboardLookPath(cmd.name)
		if err != nil {
			continue
		}
		tried = append(tried, cmd.name)
		if err := clipboardRunCommand(path, cmd.args, text); err != nil {
			failures = append(failures, cmd.name+": "+err.Error())
			continue
		}
		clipboardPreferredCommand = &clipboardCommand{name: cmd.name, path: path, args: cmd.args}
		return nil
	}
	if err := clipboardAtottoWrite(text); err != nil {
		if len(tried) == 0 {
			return fmt.Errorf("no native clipboard utilities found; fallback order %s; atotto/clipboard: %w", fallbackNames, err)
		}
		return fmt.Errorf("no native clipboard utility succeeded; fallback order %s; installed attempts: %s; failures: %s; atotto/clipboard: %w",
			fallbackNames,
			strings.Join(tried, ", "),
			strings.Join(failures, "; "),
			err,
		)
	}
	return nil
}
