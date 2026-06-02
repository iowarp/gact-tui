# Screenshots index — v0.3.1 / v0.2.1

Every screenshot below is a real CLIO turn through the gact-tui binary
against the live `clio-agent-gact` server (port 17800 in this repo's
dev setup). No emulator stubs.

| Screenshot | What it proves | Driver tape |
|---|---|---|
| `clio_doctor_health.png` | Doctor → Health tab — every integration (api / sessions / agent / arc / lm) shows ready with detail | `tui/screenshot_clio_doctor_full.tape` |
| `clio_doctor_caps_final.png` | Doctor → Capabilities tab — 28/30 supported scorecard with v0.1 core / v0.1 useful / v0.2 / vendor-specific buckets | `tui/screenshot_clio_doctor_full.tape` |
| `clio_metrics.png` | `/metrics` modal — sessions/messages/tokens/cost rolled up live | `tui/screenshot_clio_metrics.tape` |
| `clio_real_turn.png` | Live cost meter visible in TUI footer (`$X.XXXX  N in / N out`) after a real turn | `tui/screenshot_clio_real_turn.tape` |
| `clio_lm_config.png` | LM provider modal — preset list, model field, temperature + max_tokens knobs | `tui/screenshot_clio_lm_config.tape` |
| `clio_lm_e2e.png` | Auto-popped LM modal → Save → real chat reply — full first-time setup flow | `tui/screenshot_clio_lm_e2e.tape` |
| `clio_e2e.png` | Analysis expert route + real Parquet schema inline | `tui/screenshot_clio_e2e.tape` |
| `clio_claude_live.png` | Multi-turn conversation against live Anthropic Claude | `tui/screenshot_clio_claude.tape` |
| `clio_subagent.png` | Two `analysis_validator subagent` rows indented with `└` under the parent that spawned them via AnalysisExpert's parallel detection (#9) | `tui/screenshot_clio_subagent.tape` |
| `clio_diff.png` | Real CLIO turn produces a unified-diff Part rendered inline; apply/reject paths verified end-to-end via curl + integration test | `tui/screenshot_clio_diff.tape` |
| `clio_mcp_servers.png` | `/mcp` slash command shows fs / hdf5 / parquet (in_process) AND a third-party `everything` server installed via `npx @modelcontextprotocol/server-everything` (#13) | `tui/screenshot_clio_mcp.tape` |

## Re-recording

```sh
# Boot CLIO on port 17800 with an LM configured.
cd clio-agent && uv run --extra api clio-agent-gact --port 17800 &
curl -X PUT http://127.0.0.1:17800/v1/providers/lm -d '{...}'

# Build the TUI binary and put it on PATH for the tape.
cd ../gact-tui/tui && go build -o gact .
cd ..

# Run any tape against the running CLIO.
PATH="$PWD/tui:$PATH" GACT_BACKEND=http://127.0.0.1:17800 vhs tui/screenshot_clio_e2e.tape
```

### Windows VHS

VHS v0.10 hangs with the WinGet `ttyd` 1.7.7 package because that ttyd
frontend initializes xterm's DOM renderer while VHS waits for canvas layers.
Use the helper to pin the compatible ttyd 1.7.2 binary for the current run:

```powershell
cd D:\Libraries\Documents\projects\gact-tui
.\scripts\vhs-windows.ps1 .\tui\screenshot_clio_e2e.tape -Backend http://127.0.0.1:17800
```

The Windows helper also rewrites legacy bash-oriented tapes at runtime:
`Set Shell "bash"` becomes `cmd`, `/tmp/gact` becomes `gact`, and old
absolute screenshot paths are redirected under `screenshots/`.
