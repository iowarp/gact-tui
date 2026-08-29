---
name: clio-agent-dev-setup
description: Clean, start, restart, and verify one contained CLIO development backend and React UI on Windows. Use for CLIO dev mode, ARC/CTE startup failures, stale endpoints, provider/model mismatches, marketplace installation, disk hygiene, or preparing a reproducible live qualification run.
---

# CLIO agent development setup

Use the scripts in `scripts/`; do not rebuild this workflow from memory. The contract is one disposable development root, one backend, one clio-core daemon, one web server, and no prompt submission until preflight passes.

## Single writable root

All generated CLIO development state belongs under exactly:

```text
D:\Libraries\Documents\projects\clio_develop_workspace
```

This includes runtime source clones, Python environments, Node dependencies, uv/pnpm/npm caches, temporary files, child-agent caches, CTE/ARC state, tools, configuration, logs, run workspaces, screenshots, and qualification output. Source repositories outside this root are read-only inputs. Durable code and documentation leave the root only through an intentional commit in their owning repository.

Never create or reuse `D:\tmp`, `D:\relay-local`, `D:\ws`, `D:\clio-workspace`, a checkout-local `.venv`, a source-repository `node_modules`, a `PYTHONPATH` overlay, or another checkout's environment. The containment audit treats the four legacy roots as failures.

## Hard reset

Run from this skill directory:

```powershell
.\scripts\Reset-ClioDev.ps1 -Confirm:$false
```

Reset stops only the recorded CLIO processes and listeners on the configured CLIO ports, deletes the development root itself, and verifies that it is absent. It never renames, moves, quarantines, or preserves a broken tree. If Windows denies deletion, stop: repair the ACLs in an elevated Windows shell, delete the same exact root, and rerun reset. Do not create a replacement root beside it and do not continue qualification around the residue.

Use `-RecreateRoot` only when the next operation needs an empty root immediately. Do not add deletion targets outside the owned root.

## Start or restart

```powershell
.\scripts\Start-ClioDev.ps1
```

Clean startup is the default. It:

1. deletes and recreates the owned root;
2. clones the exact committed backend and frontend heads into `worktrees` inside it;
3. initializes pinned submodules;
4. reproduces the backend with `uv sync --frozen` inside the runtime clone;
5. installs the frontend with `pnpm install --frozen-lockfile` inside the runtime clone;
6. redirects temp, caches, tool installs, child-process state, logs, workspaces, and CTE data into the owned root;
7. installs the bundled marketplace launcher in the contained tool directory;
8. starts one backend and one UI; and
9. runs mandatory preflight.

Defaults:

- source backend: `D:\Libraries\Documents\projects\.codex-campaign-clio-agent`
- source frontend: `D:\Libraries\Documents\projects\gact-tui-node-revamp`
- backend/UI: `http://127.0.0.1:8787` and `http://127.0.0.1:5174`
- provider/model: Claude Code SDK and Sonnet
- ARC: CTE only, 8 GB cold tier, 1 GB RAM bound

Override source paths, ports, provider, model, or CTE capacity only when the task identifies another exact head or contract. Commit intended source changes before qualification; runtime clones deliberately exclude dirty or uncommitted filesystem state.

`-PreserveState` is only for a short restart of the same known run at the same cloned heads. It must not be used after dependency, branch, provider, marketplace, schema, MCP, ARC/CTE, or startup failures. Those require a hard reset.

## Mandatory preflight

`Start-ClioDev.ps1` calls both the containment audit and live preflight. Run them again before every qualification:

```powershell
.\scripts\Test-ClioDevContainment.ps1
.\scripts\Test-ClioDevPreflight.ps1
```

Containment fails when generated paths escape the owned root or a legacy runtime root exists. Live preflight fails when:

- the API is not `ready`;
- ARC is not backed by the live clio-core/CTE daemon;
- provider, model, or SDK transport differs from the requested values;
- bundled marketplace blueprints are absent, invalid, or merely advertised rather than installed;
- SPOTTER's implementation or native-provider configuration is missing;
- required `geo`, `ndp`, `pandas`, and `plot` MCP namespaces do not complete cold startup with real catalogs;
- an ARC sentinel cannot be written, read, and deleted through CTE;
- a CLIO port has zero or multiple owners; or
- the UI is unreachable.

MCP preparation is a warm-up gate, not a catalog-presence check. Retry only within the bounded preflight. Never submit a qualification prompt while any namespace is unresolved.

Warnings remain warnings only when the service reports an explicit degraded capability. Never reinterpret a sparse CTE file's logical size as allocated disk usage; capacity and disk diagnostics must use physical allocation evidence.

## Browser check before a run

Open `http://127.0.0.1:5174/?intent=connect` through the visible connection flow. Do not mutate browser storage directly.

1. Select `http://127.0.0.1:8787`.
2. Confirm the service reports ready.
3. Create one empty disposable session.
4. Confirm the empty-session welcome and requested provider/model.
5. Confirm the bundled blueprint catalog is installed and usable.
6. Stop setup without submitting a demo prompt.

A dead remembered endpoint, mismatched picker/backend provider, missing implementation, or delayed MCP install is a failed setup—not a reason to switch demos or providers.

## Finish and clean

Default stop removes the complete development root after stopping its processes:

```powershell
.\scripts\Stop-ClioDev.ps1
```

Use `-PreserveState` only while actively diagnosing the same run. After capturing the minimal evidence required by the task, run the default stop and verify:

```powershell
.\scripts\Test-ClioDevContainment.ps1
```

Do not accumulate failed sessions, copied repositories, alternate environments, renamed cleanup trees, stale CAE/child-agent caches, or superseded demo outputs. Reproduction comes from committed heads and lockfiles, not preservation of generated state.

## Non-negotiable behavior

- Never fall back from CTE to LocalFS.
- Never switch providers silently.
- Never start the old flat NDP demo as a setup substitute.
- Never treat catalog presence as runtime readiness.
- Never borrow, patch, or overlay an environment from another checkout.
- Never move failed cleanup state aside; deletion must succeed before work continues.
- Never run a demo automatically; setup ends at an empty verified session.
- Preserve server-reported degradation and provenance instead of fabricating green status.
