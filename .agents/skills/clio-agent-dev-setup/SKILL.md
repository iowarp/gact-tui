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

Each launch uses a unique `generations/<timestamp-pid>` directory inside that root. This includes exact-head clones of `clio-agent`, `gact-tui`, and `clio-web-search`, their isolated environments, transient uv/pnpm/npm caches, temporary files, child-agent caches, CTE/ARC state, tools, logs, run workspaces, screenshots, and qualification output. Large Hugging Face/Docling model assets are the deliberate exception: keep one reusable cache at `cache/huggingface` under the contained CLIO root, never one copy per generation or source checkout. `config/active-generation.json` names the one active generation. Source repositories outside this root are read-only inputs. Durable code and documentation leave the root only through an intentional commit in their owning repository.

Never create or reuse `D:\tmp`, `D:\relay-local`, `D:\ws`, `D:\clio-workspace`, a source-repository `.venv` or `node_modules`, a `PYTHONPATH` overlay, or another checkout's environment. A `.venv` and `node_modules` inside the disposable runtime clones under the owned root are expected. The containment audit treats the four legacy roots as failures.

## Hard reset

Run from this skill directory:

```powershell
.\scripts\Reset-ClioDev.ps1 -Confirm:$false
```

Reset stops the active generation's recorded processes, every process whose executable or command line belongs to that generation, and listeners on the configured CLIO ports. It then attempts to delete the whole owned root. It never renames, moves, or quarantines a broken tree. If Windows retains an ACL-locked inactive path after all owned processes and ports are gone, reset records its exact path in `config\cleanup-residue.json` and starts a unique clean generation beside it. Report that residue at handoff; do not promote it into a blocker for unrelated work.

Use `-RecreateRoot` only when the next operation needs an empty root immediately. Do not add deletion targets outside the owned root.

## Start or restart

```powershell
.\scripts\Start-ClioDev.ps1
```

Clean startup is the default. It:

1. deletes and recreates the owned root;
2. clones the exact committed backend, frontend, and document-processor heads into `worktrees` inside it;
3. initializes pinned submodules;
4. reproduces the backend and document processor from their frozen `uv.lock` files with Python 3.12, adding `--extra claude-code` only when the explicitly selected provider is Claude Code, and uses the backend's pinned official SDK dependency for Codex;
5. installs the frontend with `pnpm install --frozen-lockfile` inside the runtime clone;
6. redirects temp, caches, tool installs, child-process state, logs, workspaces, and CTE data into the owned root, with one root-scoped Hugging Face/Docling cache reused by every contained generation;
7. installs the bundled marketplace launcher in the contained tool directory;
8. starts one document processor, one backend, and one UI;
9. records wall-clock duration for every startup stage in `config\deploy-timing.json`; and
10. runs mandatory preflight.

Defaults:

- source backend: `D:\Libraries\Documents\projects\.codex-campaign-clio-agent`
- source frontend: `D:\Libraries\Documents\projects\gact-tui-node-revamp`
- source document processor: `D:\Libraries\Documents\projects\clio-web-search`
- backend/UI/document processor: `http://127.0.0.1:8787`, `http://127.0.0.1:5174`, and `http://127.0.0.1:8089`
- provider/model: Codex SDK and `gpt-5.6-luna`
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
- an ARC sentinel cannot be written, read, and deleted through CTE;
- a CLIO port has zero or multiple owners; or
- the UI is unreachable; or
- the contained document processor is unreachable or the backend does not advertise it as a configured converter.

The default preflight deliberately does not warm MCP namespaces. A selected session must exercise its blueprint-declared dependencies through the product readiness path so cold-start failures, retries, and progress remain visible. `Test-ClioDevPreflight.ps1 -RequiredMcpNamespaces ...` remains an opt-in diagnostic for a specific session; it is not part of ordinary startup or acceptance evidence.

## MCP lifecycle

Do not describe blueprint MCP declarations as four independent installations:

1. `uv sync` installs `clio-agent`; it does not install the EarthScope MCP namespaces.
2. Setup installs one pinned `clio-kit` tool before backend launch. Its executable already provides the `ndp`, `geo`, `pandas`, and `plot` server subcommands.
3. Installing the marketplace blueprint copies its `mcp_servers` declarations. It starts no server process.
4. Backend launch uses a blueprintless default gateway and starts none of those four servers.
5. Activating an EarthScope session mounts only that blueprint's declared specs, still without eagerly spawning them.
6. When a session first needs a declared namespace, CLIO single-flights discovery, shows launch/connect/retry state above that session's composer, and establishes a persistent workspace-scoped client before releasing the tool call.
7. Later sessions in that workspace reuse the persistent namespace client. Another workspace reuses installed packages and process-wide discovery results but establishes its own live client because cwd and filesystem scope differ.
8. `GET /v1/mcp/handshake` is a throwaway diagnostic for the selected session's declarations. It lists tools and closes; it does not prove the workspace's persistent connection and must not be used to hide first-session readiness.

Never add domain-specific namespace warming to generic dev setup. The installed marketplace defines what a blueprint declares; the selected session owns preparation and the UI owns its session-scoped projection.

Warnings remain warnings only when the service reports an explicit degraded capability. Never reinterpret a sparse CTE file's logical size as allocated disk usage; capacity and disk diagnostics must use physical allocation evidence.

The packaged desktop follows the same ownership rule through Tauri's platform app-cache directory. On Windows this resolves beneath the current user's local application data; macOS and Linux use their platform equivalents. The desktop supervisor exports `HF_HOME`, `HF_HUB_CACHE`, and `HF_XET_CACHE` before launching managed children, so model assets survive upgrades without living beside the executable or inside a workspace.

## Engineering judgment

Classify findings by consequence before acting:

1. Fix immediately when a finding can invalidate the active runtime, user data, protocol truth, security boundary, or qualification evidence.
2. Contain, record, and continue when a real issue threatens later reproducibility but cannot affect the current isolated generation.
3. Record without derailing the task when the finding is unrelated residue, cosmetic drift, or harmless environment noise.
4. Do not spend more time or introduce more risk fixing a low-impact condition than the condition can cause. In particular, never purge shared/global package caches unless evidence shows that cache is corrupt and causally involved.

A failed committed test is a correctness problem and must be investigated. A stale folder is not equivalent to a failed test. Keep the primary objective moving while preserving an exact, honest handoff of every deferred condition.

## Browser check before a run

Open `http://127.0.0.1:5174/` through the visible connection flow. Do not mutate browser storage directly.

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
- Never move failed cleanup state aside. Active runtime residue blocks; unrelated residue is tracked and handed off while work continues.
- Never run a demo automatically; setup ends at an empty verified session.
- Preserve server-reported degradation and provenance instead of fabricating green status.
