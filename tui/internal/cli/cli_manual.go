package cli

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func runMan(args []string) int {
	fs := flag.NewFlagSet("man", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	format := fs.String("format", "text", "output format: text or roff")
	install := fs.Bool("install", false, "install shell-native man integration for this user")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintln(os.Stderr, "usage: gact man [--format text|roff] [--install]")
		return 2
	}
	if *install {
		return installManIntegration()
	}
	switch strings.ToLower(*format) {
	case "text", "":
		fmt.Print(manualText())
	case "roff", "man":
		fmt.Print(manualRoff())
	default:
		fmt.Fprintf(os.Stderr, "gact man: unsupported format %q (expected text or roff)\n", *format)
		return 2
	}
	return 0
}

func installManIntegration() int {
	if runtime.GOOS == "windows" {
		return installPowerShellManShim()
	}
	return installUnixManPage()
}

func installUnixManPage() int {
	base := os.Getenv("XDG_DATA_HOME")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact man --install: resolve home: %v\n", err)
			return 1
		}
		base = filepath.Join(home, ".local", "share")
	}
	dir := filepath.Join(base, "man", "man1")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "gact man --install: create %s: %v\n", dir, err)
		return 1
	}
	target := filepath.Join(dir, "gact.1")
	if err := os.WriteFile(target, []byte(manualRoff()), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "gact man --install: write %s: %v\n", target, err)
		return 1
	}
	fmt.Printf("installed %s\n", target)
	fmt.Println("try: man gact")
	fmt.Println("if your man(1) cannot find it, add this to your shell profile:")
	fmt.Printf("  export MANPATH=\"%s:${MANPATH}\"\n", filepath.Join(base, "man"))
	return 0
}

func installPowerShellManShim() int {
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact man --install: resolve executable: %v\n", err)
		return 1
	}
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact man --install: resolve home: %v\n", err)
		return 1
	}
	profiles := []string{
		filepath.Join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
		filepath.Join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
	}
	escapedExe := strings.ReplaceAll(exe, "'", "''")
	shim := "\n# >>> gact man shim >>>\n" +
		"function man {\n" +
		"    param(\n" +
		"        [Parameter(Position=0)] [string] $Name,\n" +
		"        [Parameter(ValueFromRemainingArguments=$true)] [string[]] $RemainingArgs\n" +
		"    )\n" +
		"    if ($Name -eq 'gact') { & '" + escapedExe + "' man @RemainingArgs; return }\n" +
		"    Get-Help $Name @RemainingArgs | more\n" +
		"}\n" +
		"# <<< gact man shim <<<\n"

	installed := 0
	for _, profile := range profiles {
		if err := os.MkdirAll(filepath.Dir(profile), 0o755); err != nil {
			fmt.Fprintf(os.Stderr, "gact man --install: create %s: %v\n", filepath.Dir(profile), err)
			continue
		}
		contentBytes, _ := os.ReadFile(profile)
		content := string(contentBytes)
		if strings.Contains(content, "# >>> gact man shim >>>") {
			fmt.Printf("already installed in %s\n", profile)
			installed++
			continue
		}
		if strings.Contains(content, "function man") {
			fmt.Printf("skipped %s: profile already defines function man\n", profile)
			continue
		}
		f, err := os.OpenFile(profile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact man --install: open %s: %v\n", profile, err)
			continue
		}
		_, writeErr := f.WriteString(shim)
		closeErr := f.Close()
		if writeErr != nil || closeErr != nil {
			if writeErr != nil {
				fmt.Fprintf(os.Stderr, "gact man --install: write %s: %v\n", profile, writeErr)
			}
			if closeErr != nil {
				fmt.Fprintf(os.Stderr, "gact man --install: close %s: %v\n", profile, closeErr)
			}
			continue
		}
		fmt.Printf("installed PowerShell man shim in %s\n", profile)
		installed++
	}
	if installed == 0 {
		fmt.Fprintln(os.Stderr, "gact man --install: no PowerShell profile was updated")
		return 1
	}
	fmt.Println("restart PowerShell, then run: man gact")
	return 0
}
