package clio

// Placeholder — subprocess supervisor for `clio-agent-api`.
//
// Mirrors adapters/claudecode/subprocess.go: spawn Python child with
// detached process group, pipe stdout/stderr for logging, probe
// readiness via GET /health, propagate SIGTERM on parent shutdown.
//
// TODO (CLIO-BBBBBBBBBB Phase 1):
//   - type ChildProcess struct { cmd *exec.Cmd; endpoint string; logger *log.Logger }
//   - func SpawnClioAPI(ctx, bin, host string, port int, env []string) (*ChildProcess, error)
//     · bin defaults to "clio-agent-api" on PATH; falls back to
//       "uv run --project <dir> python -m clio_agent.ui.api".
//     · env forwards CLIO_LM_*, CLIO_ALLOWED_ROOTS, OPENAI_API_KEY,
//       ANTHROPIC_API_KEY verbatim.
//   - ReadinessProbe: tight-loop GET /health until 200 or 10s timeout
//     (CLIO startup can be slow if the LM model has to load from disk).
//   - Shutdown: SIGTERM -> Wait(5s) -> SIGKILL as fallback.
//
// Stretch (not Phase 1): supervise Meridian alongside CLIO when
// CLIO_LM_API_BASE points at localhost and --auto-meridian is set.
