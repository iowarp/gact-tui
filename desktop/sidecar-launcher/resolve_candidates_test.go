package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

// managedVenvBin is the console-script directory of the clio-agent
// environment an installer creates under prefix.
func managedVenvBin(prefix string) string {
	return filepath.Join(prefix, "clio-agent", ".venv", venvScriptDir())
}

func TestManagedInstallWithOnlyFrontDoorStartsServe(t *testing.T) {
	clearResolutionEnv(t)
	home := t.TempDir()
	t.Setenv("CLIO_AGENT_HOME", home)
	agent := filepath.Join(managedVenvBin(filepath.Join(home, "data", "app")), agentBinName())
	touch(t, agent)

	rt, err := resolveRuntime()
	if err != nil {
		t.Fatalf("an install with only clio-agent must resolve, got %v", err)
	}
	if want := []string{agent, "serve"}; !reflect.DeepEqual(rt.Argv, want) {
		t.Fatalf("argv = %v, want %v", rt.Argv, want)
	}
	got := spawnArgv(rt, cliArgs{host: "127.0.0.1", port: 4321})
	want := []string{agent, "serve", "--host", "127.0.0.1", "--port", "4321"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("spawn argv = %v, want %v", got, want)
	}
}

func TestManagedInstallPrefersGactOverServe(t *testing.T) {
	clearResolutionEnv(t)
	home := t.TempDir()
	t.Setenv("CLIO_AGENT_HOME", home)
	bin := managedVenvBin(filepath.Join(home, "data", "app"))
	gact := filepath.Join(bin, gactBinName())
	touch(t, gact)
	touch(t, filepath.Join(bin, agentBinName()))

	rt, err := resolveRuntime()
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{gact}; !reflect.DeepEqual(rt.Argv, want) {
		t.Fatalf("argv = %v, want clio-agent-gact first %v", rt.Argv, want)
	}
}

func TestNewerPrefixFrontDoorBeatsOlderPrefixGact(t *testing.T) {
	clearResolutionEnv(t)
	newer := t.TempDir()
	t.Setenv("CLIO_PREFIX", newer)
	agent := filepath.Join(managedVenvBin(newer), agentBinName())
	touch(t, agent)
	home := t.TempDir()
	t.Setenv("CLIO_AGENT_HOME", home)
	touch(t, filepath.Join(managedVenvBin(filepath.Join(home, "data", "app")), gactBinName()))

	rt, err := resolveRuntime()
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{agent, "serve"}; !reflect.DeepEqual(rt.Argv, want) {
		t.Fatalf("argv = %v, want the higher-priority prefix %v", rt.Argv, want)
	}
}

func TestEmptyManagedEnvironmentStillNeedsInstall(t *testing.T) {
	clearResolutionEnv(t)
	home := t.TempDir()
	t.Setenv("CLIO_AGENT_HOME", home)
	touch(t, filepath.Join(managedVenvBin(filepath.Join(home, "data", "app")), "python"))

	if rt, err := resolveRuntime(); err == nil {
		t.Fatalf("an environment without clio-agent must not resolve; got %v", rt.Argv)
	}
}

func TestServeCrashCleanupRunsGactModuleWithVenvPython(t *testing.T) {
	bin := t.TempDir()
	agent := filepath.Join(bin, agentBinName())
	python := filepath.Join(bin, "python")
	if venvScriptDir() == "Scripts" {
		python = filepath.Join(bin, "python.exe")
	}
	touch(t, agent)
	touch(t, python)

	got := crashCleanupArgv(&resolvedRuntime{Argv: []string{agent, "serve"}})
	want := []string{python, "-m", "clio_agent.gact", "--cleanup-runtime-after-crash"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("argv = %v, want %v", got, want)
	}
}

func TestServeCleanupMappingIgnoresOtherRuntimes(t *testing.T) {
	bin := t.TempDir()
	agent := filepath.Join(bin, agentBinName())
	touch(t, agent)
	for _, argv := range [][]string{
		{agent, "serve"}, // no interpreter beside it
		{agent},
		{filepath.Join(bin, gactBinName()), "serve"},
		{"python", "-m", "clio_agent.gact"},
	} {
		if got, ok := serveCleanupArgv(&resolvedRuntime{Argv: argv}); ok {
			t.Fatalf("serveCleanupArgv(%v) = %v; want no mapping", argv, got)
		}
	}
}
