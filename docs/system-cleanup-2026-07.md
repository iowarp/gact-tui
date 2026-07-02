# System Cleanup Program — 2026-07 Audit (gact-tui side)

**Master plan:** `docs/design/system-cleanup-2026-07.md` in
[iowarp/clio-agent](https://github.com/iowarp/clio-agent/blob/develop/docs/design/system-cleanup-2026-07.md) ·
**Tracking:** [umbrella #237](https://github.com/iowarp/gact-tui/issues/237) (this repo),
[umbrella #775](https://github.com/iowarp/clio-agent/issues/775) (clio-agent) ·
all issues labeled `audit-2026-07`.

## Direction decision (owner, 2026-07-01)

The GACT contract (`contract/SPEC.md`) drifted because it was never updated while the
implementation evolved. **Convergence direction: re-reconcile the spec to today's implementation**
(reality leads, spec documents, conformance enforces) — do not regress code to the stale documented
contract. Exception: where the implementation is self-contradictory (`message.created` nesting fork
[#229](https://github.com/iowarp/gact-tui/issues/229), inconsistent error tags, capability flags
that lie), pick the coherent current behavior and codify it. Details: [#232](https://github.com/iowarp/gact-tui/issues/232).

## This repo's issues

**P0 defects:**
[#224](https://github.com/iowarp/gact-tui/issues/224) TUI compact → /summarize 404 ·
[#225](https://github.com/iowarp/gact-tui/issues/225) web ignores session.updated ·
[#226](https://github.com/iowarp/gact-tui/issues/226) stale-snapshot race ·
[#227](https://github.com/iowarp/gact-tui/issues/227) TUI SSE read-error dead end ·
[#228](https://github.com/iowarp/gact-tui/issues/228) desktop supervisor child leak ·
[#229](https://github.com/iowarp/gact-tui/issues/229) message.created nesting fork ·
[#230](https://github.com/iowarp/gact-tui/issues/230) CLI ignores config.json backend_url ·
[#231](https://github.com/iowarp/gact-tui/issues/231) unbounded execution ledger

**Epics:**
[#232](https://github.com/iowarp/gact-tui/issues/232) protocol convergence ·
[#233](https://github.com/iowarp/gact-tui/issues/233) TUI streaming/thinking parity with web ·
[#234](https://github.com/iowarp/gact-tui/issues/234) tui structure (split the 623-file ui package) ·
[#235](https://github.com/iowarp/gact-tui/issues/235) repo hygiene & media policy (669 MB pack → <100 MB) ·
[#236](https://github.com/iowarp/gact-tui/issues/236) apps correctness cluster

**Paired clio-agent issues:** capabilities lie [clio #760](https://github.com/iowarp/clio-agent/issues/760)
(pairs with #224) · single-writer TurnTranscript [clio #767](https://github.com/iowarp/clio-agent/issues/767)
(server-side prerequisite for deleting client-side dedup/prose filters in #232/#233/#236).

## Sequencing note

Server first: clio #767 removes the text/`tool_call.thought` duplication and parent-resume
suppression at the source; only then can the web/TUI prose filters (`dedupToolThought`,
`dedupeRepeatedText`, `clioScaffolding`, the TUI normalization pipeline) be deleted rather than
kept as compensations. #233 (TUI parity) starts after #232 settles which streaming channel is
authoritative.
