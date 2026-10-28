//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// A backend that exits on SIGTERM is stopped gracefully when the desktop is gone,
// and the crash cleanup still runs after it.
func TestStopAfterDesktopExitStopsTheBackendGracefully(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "terminated")
	cleaned := filepath.Join(t.TempDir(), "cleaned")
	cmd := exec.Command("sh", "-c", "trap 'touch "+marker+"; exit 0' TERM; while :; do sleep 0.1; done")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	waitDone := make(chan error, 1)
	go func() { waitDone <- cmd.Wait() }()
	time.Sleep(200 * time.Millisecond) // let the shell install its trap

	rt := &resolvedRuntime{Argv: []string{"sh", "-c", "touch " + cleaned, "cleanup"}}
	started := time.Now()
	stopAfterDesktopExit(cmd, waitDone, rt)

	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("backend was not asked to stop with SIGTERM: %v", err)
	}
	if elapsed := time.Since(started); elapsed > 10*time.Second {
		t.Fatalf("a backend that stops by itself was waited on for %s", elapsed)
	}
	if _, err := os.Stat(cleaned); err != nil {
		t.Fatalf("crash cleanup did not run after the backend stopped: %v", err)
	}
}

func TestProcessAliveSeesAnExitedProcess(t *testing.T) {
	cmd := exec.Command("true")
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	if processAlive(cmd.Process.Pid) {
		t.Fatalf("pid %d reported alive after it exited and was reaped", cmd.Process.Pid)
	}
	if !processAlive(os.Getpid()) {
		t.Fatal("this process reported not alive")
	}
}

// The real failure: the desktop is killed, its ends of the launcher's stdout and
// stderr pipes close, and the launcher's next progress line must not end it with
// SIGPIPE before it stops the backend.
func TestALauncherSurvivesWritingToADeadDesktopsPipe(t *testing.T) {
	if os.Getenv("LAUNCHER_BROKEN_STDOUT_HELPER") == "1" {
		ignoreBrokenPipe()
		time.Sleep(200 * time.Millisecond) // the parent closes its read end meanwhile
		for i := 0; i < 20; i++ {
			fmt.Fprintln(os.Stdout, "sidecar-progress: desktop exited; starting crash cleanup")
		}
		os.Exit(0)
	}
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(os.Args[0], "-test.run=^TestALauncherSurvivesWritingToADeadDesktopsPipe$")
	cmd.Env = append(os.Environ(), "LAUNCHER_BROKEN_STDOUT_HELPER=1")
	cmd.Stdout = write
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	write.Close()
	read.Close() // the desktop is gone
	if err := cmd.Wait(); err != nil {
		t.Fatalf("the launcher died writing to the dead desktop's pipe: %v", err)
	}
}

func TestCleanupHelpersDoNotWriteToADeadDesktop(t *testing.T) {
	running := make(chan struct{})
	if out, _ := cleanupOutput(running); out != os.Stdout {
		t.Fatal("while the desktop runs, cleanup output goes to the desktop")
	}
	gone := make(chan struct{})
	close(gone)
	if out, errOut := cleanupOutput(gone); out != nil || errOut != nil {
		t.Fatal("after the desktop is gone, a cleanup helper must not inherit its closed pipes")
	}
}
