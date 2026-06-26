package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui"
)

// writeDiagTo writes the terse diag report to an arbitrary writer.
// Used by dump-bundle (TTTTTTTT1). Use writeDiagToVerbose (runDiag)
// for the stdout path — it adds custom-theme + config-load rows.
//
// IIIIIIIII1: both variants share writeDiagCore so future rows
// (new env vars, new counters) land in one place automatically.
func writeDiagTo(w io.Writer) { writeDiagCore(w, false) }

// writeDiagToVerbose is the stdout variant runDiag uses. Includes
// the config-load error line + the custom-theme probe that
// dump-bundle intentionally omits.
func writeDiagToVerbose(w io.Writer) { writeDiagCore(w, true) }

// writeDiagCore is the single source of truth for diag output.
// verbose=true adds custom-theme probe + config-load error row.
func writeDiagCore(w io.Writer, verbose bool) {
	fmt.Fprintf(w, "gact %s\n", binaryVersion)
	fmt.Fprintf(w, "  contract:   %s\n", contractVersion)
	fmt.Fprintf(w, "  runtime:    %s\n", runtime.Version())
	fmt.Fprintf(w, "  platform:   %s/%s\n", runtime.GOOS, runtime.GOARCH)
	if rev, when, dirty := readVCSInfo(); rev != "" {
		suffix := ""
		if dirty {
			suffix = " (dirty)"
		}
		fmt.Fprintf(w, "  revision:   %s%s\n", rev, suffix)
		if when != "" {
			fmt.Fprintf(w, "  built:      %s\n", when)
		}
	}
	diagWriteInstallProbe(w)
	cfgPath, err := config.DefaultPath()
	if err != nil {
		fmt.Fprintf(w, "  config path: (error: %v)\n", err)
	} else {
		fmt.Fprintf(w, "  config path: %s\n", cfgPath)
	}
	cfg, _, cfgErr := config.Load()
	if verbose && cfgErr != nil {
		fmt.Fprintf(w, "  config load: (error: %v)\n", cfgErr)
	}
	print := func(label string, val *string) {
		if val != nil && *val != "" {
			fmt.Fprintf(w, "  %s: %s\n", label, *val)
		} else {
			fmt.Fprintf(w, "  %s: (unset)\n", label)
		}
	}
	print("backend_url", cfg.BackendURL)
	print("theme      ", cfg.Theme)
	print("locale     ", cfg.Locale)
	print("voice_cmd  ", cfg.VoiceCommand)
	if cfg.CollapseThreshold != nil {
		fmt.Fprintf(w, "  collapse_threshold: %d\n", *cfg.CollapseThreshold)
	}
	if cfg.CostWarnTokens != nil {
		fmt.Fprintf(w, "  cost_warn_tokens:   %d\n", *cfg.CostWarnTokens)
	}
	if cfg.CostDangerTokens != nil {
		fmt.Fprintf(w, "  cost_danger_tokens: %d\n", *cfg.CostDangerTokens)
	}
	diagWriteMouseCaptureProbe(w, cfg.MouseEnabled)
	diagWriteClipboardProbe(w)
	if verbose {
		themePath, _ := ui.CustomThemeDefaultPath()
		if themePath != "" {
			if _, err := os.Stat(themePath); err == nil {
				fmt.Fprintf(w, "  custom theme: %s (present)\n", themePath)
				if _, err := ui.LoadCustomTheme(themePath); err != nil {
					fmt.Fprintf(w, "    parse error: %v\n", err)
				}
			} else {
				fmt.Fprintf(w, "  custom theme: %s (not present)\n", themePath)
			}
		}
	}
	for _, name := range []string{
		"GACT_BACKEND", "GACT_THEME", "GACT_LOCALE", "GACT_VOICE_CMD",
		"GACT_CONFIG", "GACT_THEME_FILE", "GACT_DETACHED_PATH",
		"GACT_INSTALL_PATH", "GACT_TUI_LATENCY_REPORT",
	} {
		if v := os.Getenv(name); v != "" {
			fmt.Fprintf(w, "  env %s: %s\n", name, v)
		}
	}
	// HHHHHHHHH1: one-line summary of the local detached registry
	// (AAAAAAAA1) so bug reports on resume/attach UX carry the
	// state without a separate `gact detached` run.
	if regPath, err := config.DetachedPath(); err == nil {
		fmt.Fprintf(w, "  detached_path: %s\n", regPath)
		if reg, err := config.LoadDetached(regPath); err == nil {
			backends := map[string]bool{}
			for _, r := range reg.Records {
				backends[r.Backend] = true
			}
			fmt.Fprintf(w, "  detached_count: %d record(s) across %d backend(s)\n",
				len(reg.Records), len(backends))
		} else {
			fmt.Fprintf(w, "  detached_count: (unreadable: %v)\n", err)
		}
	}
}

func diagWriteMouseCaptureProbe(w io.Writer, mouseEnabled *bool) {
	state := "enabled"
	source := "default"
	if mouseEnabled != nil {
		source = "config"
		if !*mouseEnabled {
			state = "disabled"
		}
	}
	selection := "terminal selection needs /mouse off or config mouse_enabled=false"
	if state == "disabled" {
		selection = "native terminal selection available; TUI mouse clicks disabled"
	}
	fmt.Fprintf(w, "  mouse_capture: %s (%s); %s\n", state, source, selection)
}

func diagWriteClipboardProbe(w io.Writer) {
	commands := []string{
		"wl-copy",
		"xclip",
		"xsel",
		"pbcopy",
		"clip.exe",
		"powershell.exe",
		"termux-clipboard-set",
	}
	var present []string
	var missing []string
	for _, name := range commands {
		if path, err := exec.LookPath(name); err == nil && path != "" {
			present = append(present, name)
		} else {
			missing = append(missing, name)
		}
	}
	if len(present) == 0 {
		fmt.Fprintln(w, "  clipboard_native: none detected")
	} else {
		fmt.Fprintf(w, "  clipboard_native: %s\n", strings.Join(present, ", "))
	}
	fmt.Fprintf(w, "  clipboard_missing: %s\n", strings.Join(missing, ", "))
	fmt.Fprintf(w, "  clipboard_osc52: terminal-dependent; TERM=%s TERM_PROGRAM=%s COLORTERM=%s\n",
		orUnset(os.Getenv("TERM")),
		orUnset(os.Getenv("TERM_PROGRAM")),
		orUnset(os.Getenv("COLORTERM")),
	)
	fmt.Fprintf(w, "  terminal_selection: use /mouse to toggle TUI mouse capture when verifying terminal text selection; TERM=%s TERM_PROGRAM=%s\n",
		orUnset(os.Getenv("TERM")),
		orUnset(os.Getenv("TERM_PROGRAM")),
	)
}

func orUnset(value string) string {
	if strings.TrimSpace(value) == "" {
		return "(unset)"
	}
	return value
}
