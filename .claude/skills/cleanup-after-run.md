# Skill: Clean up after a live run

Tear down cleanly so the next run starts from a known state. Covers stuck turns,
orphaned processes, port conflicts, scratch workspaces, and caches.

## 1. Cancel a stuck / looping turn (do this FIRST)
The EarthScope resolver loops forever on the dead 404 endpoint. Cancel the turn before
killing anything:
```sh
curl -s -X POST http://127.0.0.1:17801/v1/sessions/<SID>/cancel   # -> 204, status becomes "cancelled"
```
Verify: `GET /v1/sessions/<SID>` → `status: cancelled`.

## 2. Kill clio + its children (port 17801)
Windows — match by command line, kill the tree (PowerShell):
```powershell
Get-CimInstance Win32_Process -Filter "Name='clio-agent-gact.exe' OR Name='python.exe'" |
  Where-Object { $_.CommandLine -like '*clio-agent-gact*17801*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# confirm the port is free
if (Get-NetTCPConnection -LocalPort 17801 -State Listen -EA SilentlyContinue) { 'still listening' } else { 'port free' }
```
Also kill leftover MCP/uvx children if present (`clio-kit`, `uv`, `mcp-server`).

## 3. Stop background helpers
Any permission-approver / monitor loops you launched (`run_in_background`) — stop them
with `TaskStop <task_id>` so they don't keep polling a dead backend.

## 4. Scratch workspaces & audit logs
Every `POST /v1/workspaces` from a driver script leaves a workspace registered. They
pile up (seen: many `EarthScope audit` roots under `scratchpad/`). Prefer reusing
`ws_ndp_demo` instead of creating new ones. Audit/SSE logs (`CLIO_STREAM_AUDIT_LOG`)
live in your evidence dir under the session scratchpad — delete the whole
`scratchpad/capture-*` dir when done; they get large (10k–35k JSONL rows per run).

## 5. Web
- Stop the `vite preview` background task (`TaskStop`).
- Playwright: `browser_close` the tab if you opened one for capture.

## 6. Reset demo state (optional, before a fresh demo)
- Keep the **downloaded data** in `ndp-demo-workspace` (MTA1/P475 CSVs + plots) — it's
  the 404 fallback; don't delete it.
- Delete stale generated artifacts in the clio-agent repo root (`MTA1*.png`,
  `MTA1.CI.LY_.30.csv`, `earthscope_*.csv`) if a prior run wrote them there instead of
  the workspace — they show as untracked in `git status` and should not be committed.
- uv cache only if MCP is misbehaving: `uvx --refresh clio-kit@<ver> mcp-server <name>`
  (see memory `clio-kit uvx cache broken`).

## What NOT to delete
- `ndp-demo-workspace` downloaded data (the fallback corpus).
- Committed evidence docs (`DATASET.md`, `FOUR-QUADRANTS.md`) if you moved them into a
  repo intentionally.
