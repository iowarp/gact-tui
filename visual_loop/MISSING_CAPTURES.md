# Missing Visual Captures

This is a generated operator backlog derived from `visual_loop/COVERAGE.md`.
Keep the source ledger there authoritative, and regenerate this file after
changing capture priorities or missing-state rows.

## Summary

- source: `visual_loop/COVERAGE.md`
- deferred captures: `7`
- priorities: High=3, Medium=4

## Backlog

### High - Copy and selection

- Missing capture: Live terminal permutations for drag copy, native selection, clipboard failures, and detail-modal copy across mouse modes (#150)
- Why it matters: Deterministic copy success, native-selection toggle, and forced clipboard-failure guidance are covered; `check_copy_selection_readiness.py` now keeps that deterministic proof separate from the real terminal checklist, which still needs live-terminal evidence across the supported local environment

### High - Diagnostics

- Missing capture: Real CLIO doctor output with partial capability gaps and long-running benchmark metrics during active stream (#151)
- Why it matters: Deterministic fixtures, maintained `gact diag` clipboard/terminal report, and preserved live memory-pressure evidence are covered; operators still need real CLIO doctor partial-gap and active-stream metrics captures

### High - Scientific demos

- Missing capture: Remaining real NDP demo gap: all four cases have preserved real TUI screenshots, but none has the required short GIF plus live-run streaming proof manifest under the current standard (#149)
- Why it matters: Deterministic fixtures prove rendering, and real runs prove artifact-producing operability for all four cases; all four cases need short GIF recordings plus a JSON receipt from the capture helper proving live semantic events on an owned backend. San Diego/EarthScope and wildfire need manifests, and California NWS plus Fresno CIMIS need manifests without the streaming limitation flag

### Medium - Agent and blueprint hierarchy

- Missing capture: Real marketplace-source lifecycle against current CLIO registry semantics, including successful source install/update/remove and backend registry refresh outcomes (#128/#143)
- Why it matters: Deterministic tapes now cover large blueprint/agent trees with long names, active markers, nested children, invalid sources, and disabled activation states; `check_agent_blueprint_marketplace_readiness.py` now keeps that proof separate from real marketplace-source lifecycle proof, which still needs owned-backend evidence for demo operator confidence

### Medium - Prompts and expert packs

- Missing capture: Successful provider-specific prompt save against a live backend, empty active-blueprint state with a non-empty prompt registry, and successful expert-pack install/update/delete against a real source (#153)
- Why it matters: These surfaces decide what CLIO will run; deterministic tapes now cover packaged blueprint prompt variants, scoped session overrides, provider-specific edit failure, validation errors, empty prompt registry, and expert-pack failure/lifecycle structure; `check_live_lifecycle_readiness.py` keeps real prompt/expert-pack lifecycle success deferred until owned-backend captures exist

### Medium - Runtime catalogs

- Missing capture: Large live mixed tools/MCP/source catalog, registry-backed MCP install/remove, and successful lifecycle outcomes across source types (#152)
- Why it matters: Representative unified catalog states now cover built-in, recipe, MCP, disconnected/repair-needed, unavailable, empty, reconnect-failure, and detail variants; `check_live_lifecycle_readiness.py` now separates live catalog breadth from real registry-backed MCP/source lifecycle success, both of which still need owned-backend proof

### Medium - Settings and provider setup

- Missing capture: Real ALCF provider failure/recovery and retry override warning (#154)
- Why it matters: Deterministic provider tapes prove unavailable model/auth failure, warning-cleared-after-auth, retry-warning UI, and narrow layout; `check_provider_recovery_readiness.py` now keeps real owned-backend failure/recovery proof deferred until the guarded provider capture manifest and screenshots exist
