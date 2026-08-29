---
name: clio-agent-dev-setup
description: Start, restart, clean, and verify one local CLIO development backend and React UI on Windows. Use for CLIO dev mode, recurring ARC/CTE startup errors, stale endpoints, provider/model mismatches, bundled marketplace installation, or preparing a clean environment before a live run.
---

# CLIO agent development setup

Use the scripts in `scripts/` instead of rebuilding the environment from memory. The contract is one backend, one clio-core daemon, one web server, one dedicated state root, and no demo submission until preflight passes.

## Start or restart

Run from this skill directory:

```powershell
.\scripts\Start-ClioDev.ps1 -ResetState
```

`-ResetState` deletes only the dedicated runtime at `D:\Libraries\Documents\projects\clio_develop_workspace\runtime\clio-agent-dev`. It does not touch canonical NDP/SPOTTER evidence or repository worktrees. Omit it when saved dev sessions must survive.

Defaults:

- backend: `D:\Libraries\Documents\projects\.codex-campaign-clio-agent`
- web repository: `D:\Libraries\Documents\projects\gact-tui-node-revamp`
- backend/UI: `http://127.0.0.1:8787` and `http://127.0.0.1:5174`
- provider/model: Claude Code SDK and Sonnet
- ARC: CTE only, 8 GB cold tier, 1 GB RAM bound
- SPOTTER: the installed blueprint implementation and a generated native-provider YAML are exported to the backend as `SPOTTER_IMPL_DIR` and `SPOTTER_CLIO_CONFIG`

Override paths, ports, provider, model, or CTE capacities with script parameters when the task requires a different exact head.

## Mandatory preflight

`Start-ClioDev.ps1` calls `Test-ClioDevPreflight.ps1` after startup. Run it again before every live qualification:

```powershell
.\scripts\Test-ClioDevPreflight.ps1
```

It fails when:

- the API is not `ready`;
- ARC is not backed by the live clio-core/CTE daemon;
- the configured provider, model, or transport differs from the requested values;
- the expected bundled blueprints are absent or invalid;
- the SPOTTER implementation or its explicit native-provider configuration is missing;
- the required `geo`, `ndp`, `pandas`, and `plot` MCP namespaces do not finish cold startup and report `ready` with their real tool catalogs;
- the backend or UI port is not owned by exactly one process;
- the UI is not reachable.

The MCP handshake is intentionally a warm-up gate, not a catalog-presence check. A newly installed namespace can require more than one handshake while its isolated environment is created. Preflight retries the live handshake and fails with each unresolved namespace and server-reported reason; do not submit a qualification prompt until this completes.

Warnings remain warnings only when the service reports an explicit degraded capability, such as the unverified Windows sandbox. The CTE capacity diagnostic is also surfaced: a preallocated `storage.bin` can make the current doctor report 100% even on an empty store, so do not treat that specific number as used-byte evidence.

## Environment ownership

The start script owns one canonical environment derived from the selected backend checkout. It runs `uv sync --frozen` before launch, verifies the current schema, `psutil`, and `iowarp-core` imports, and then launches with `uv run --frozen --no-sync`. Do not borrow another checkout's `.venv`, add an overlay to `PYTHONPATH`, or repair only one missing wheel in place. A server that cannot reproduce the lock is not ready.

For Linux qualification hosts, first verify that the host glibc satisfies every locked native wheel. If it does not, use a clean container built from the exact checkout or upgrade the host; never omit `iowarp-core` or switch the qualification to LocalFS. Initialize the checkout's pinned submodules before installing its bundled marketplace. Qualification drivers must use fail-fast HTTP calls and must stop on any failed/error session state.

## Browser check before a run

Open the visible connection flow at `http://127.0.0.1:5174/?intent=connect`. Do not inspect or mutate browser storage directly.

1. Select or enter `http://127.0.0.1:8787`.
2. Confirm the page says the service is ready.
3. Create an empty disposable session.
4. Confirm the empty-session welcome renders and the model picker shows the requested provider/model.
5. Confirm the blueprint catalog contains the expected bundled marketplace entries.
6. Do not submit a demo prompt as part of setup.

If the page opens a dead remembered endpoint, treat that as a failed preflight and repair it through the connection UI. A healthy backend alone is not a usable environment.

## Stop

```powershell
.\scripts\Stop-ClioDev.ps1
```

The stop script targets only PIDs recorded in the dedicated dev runtime plus listeners on the configured CLIO ports. It does not kill unrelated Python, Node, or Rust processes.

## Clean-space policy

The allocated `clio_develop_workspace` is disposable infrastructure. Keep only the active runtime, current qualification workspaces, current diagnostic logs, and small configuration or manifests required to reproduce retained evidence. Remove failed sessions, stale demo outputs, superseded relay harnesses, stale runtime trees, duplicate worktrees, caches, copied repositories, and misleading generated artifacts. Prefer the Recycle Bin for recoverability. Quarantine ACL-locked paths with a `.delete-pending-acl-*` prefix and report that elevated deletion remains.

## Non-negotiable behavior

- Never fall back from CTE to LocalFS.
- Never switch providers silently.
- Never start the old flat NDP demo as a setup substitute.
- Never interpret installed catalog entries as runtime-ready without querying the live backend.
- Never run a demo automatically; setup ends at an empty verified session.
- Preserve server-reported degradation and provenance instead of fabricating green status.
