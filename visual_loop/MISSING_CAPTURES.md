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
- Why it matters: Deterministic copy success, native-selection toggle, and forced clipboard-failure guidance are covered; live recordings still need to preserve exact platform behavior across terminal/clipboard stacks

### High - Diagnostics

- Missing capture: Real CLIO doctor output with partial capability gaps and long-running benchmark metrics during active stream (#151)
- Why it matters: Deterministic fixtures, maintained `gact diag` clipboard/terminal report, and preserved live memory-pressure evidence are covered; operators still need real CLIO doctor partial-gap and active-stream metrics captures

### High - Scientific demos

- Missing capture: Remaining real NDP demo gap: all four cases have preserved real TUI screenshots, but none has the required short GIF plus manifest-backed streaming proof under the current standard
- Why it matters: Deterministic fixtures prove rendering, and real runs prove artifact-producing operability for all four cases; all four cases need short GIF recordings, San Diego/EarthScope and wildfire need capture manifests, and California NWS plus Fresno CIMIS need manifests without the streaming limitation flag

### Medium - Agent and blueprint hierarchy

- Missing capture: Real marketplace-source lifecycle against current CLIO registry semantics, including successful source install/update/remove and backend registry refresh outcomes
- Why it matters: Deterministic tapes now cover large blueprint/agent trees with long names, active markers, nested children, invalid sources, and disabled activation states; real lifecycle proof is still needed for demo operator confidence

### Medium - Prompts and expert packs

- Missing capture: Successful provider-specific prompt save against a live backend, empty active-blueprint state with a non-empty prompt registry, and successful expert-pack install/update/delete against a real source
- Why it matters: These surfaces decide what CLIO will run; deterministic tapes now cover packaged blueprint prompt variants, scoped session overrides, provider-specific edit failure, validation errors, empty prompt registry, and expert-pack failure/lifecycle structure; real success paths still need proof

### Medium - Runtime catalogs

- Missing capture: Large live mixed tools/MCP/source catalog, registry-backed MCP install/remove, and successful lifecycle outcomes across source types
- Why it matters: Representative unified catalog states now cover built-in, recipe, MCP, disconnected/repair-needed, unavailable, empty, reconnect-failure, and detail variants; operators still need live registry-backed breadth and success-path proof

### Medium - Settings and provider setup

- Missing capture: Real ALCF provider failure/recovery and retry override warning
- Why it matters: Deterministic provider tapes prove unavailable model/auth failure, warning-cleared-after-auth, and narrow layout; the Theme tab now exposes import/export in-view with visual proof
