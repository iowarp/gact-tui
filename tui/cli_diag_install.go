package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func diagWriteInstallProbe(w io.Writer) {
	exe, exeResolved, exeErr := currentExecutablePaths()
	if exe != "" {
		fmt.Fprintf(w, "  binary_path: %s\n", exe)
	}
	if exeResolved != "" && exeResolved != exe {
		fmt.Fprintf(w, "  binary_resolved: %s\n", exeResolved)
	}
	if exeErr != nil {
		fmt.Fprintf(w, "  binary_status: unreadable (%v)\n", exeErr)
	}
	writeGactPathProbe(w, "path_gact", lookPathGact(), exeResolved)
	writeGactPathProbe(w, "clio_gact", clioGactInstallPath(), exeResolved)
}

func currentExecutablePaths() (path, resolved string, err error) {
	path, err = os.Executable()
	if err != nil {
		return "", "", err
	}
	resolved, err = resolveInstallPath(path)
	if err != nil {
		return path, "", err
	}
	return path, resolved, nil
}

func lookPathGact() string {
	path, err := exec.LookPath("gact")
	if err != nil {
		return ""
	}
	return path
}

func clioGactInstallPath() string {
	if override := strings.TrimSpace(os.Getenv("GACT_CLIO_GACT_BIN")); override != "" {
		return override
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join("~", ".local", "share", "clio", "gact")
	}
	return filepath.Join(home, ".local", "share", "clio", "gact")
}

func writeGactPathProbe(w io.Writer, label, path, runningResolved string) {
	if strings.TrimSpace(path) == "" {
		fmt.Fprintf(w, "  %s: (not found)\n", label)
		fmt.Fprintf(w, "  %s_status: missing\n", label)
		return
	}
	fmt.Fprintf(w, "  %s: %s\n", label, path)
	resolved, err := resolveInstallPath(path)
	if err != nil {
		fmt.Fprintf(w, "  %s_status: unreadable (%v)\n", label, err)
		return
	}
	if resolved != path {
		fmt.Fprintf(w, "  %s_resolved: %s\n", label, resolved)
	}
	if runningResolved == "" {
		fmt.Fprintf(w, "  %s_status: unknown (running binary unresolved)\n", label)
		return
	}
	if sameInstallPath(resolved, runningResolved) {
		fmt.Fprintf(w, "  %s_status: matches running binary\n", label)
		return
	}
	fmt.Fprintf(w, "  %s_status: stale (does not match running binary)\n", label)
}

func resolveInstallPath(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		abs = resolved
	}
	if _, err := os.Stat(abs); err != nil {
		return abs, err
	}
	return abs, nil
}

func sameInstallPath(a, b string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return filepath.Clean(a) == filepath.Clean(b)
}
