# Prototype Conformance Map

Source: 9 element-level conformance JSON files in `docs/p5/conformance/` (`panels`,
`settings`, `icons-and-buttons`, `transcript-parts`, `composer-pill`, `fresh-session`,
`observability`, `menus-grammar`, `rail-and-topbar`). Every count below is a literal
tally of the `status` field across all 188 items in those 9 files — not an estimate.
Statuses: `match` / `deviates` / `missing` / `not-wired` / `unbacked`.

**State: post-grind-pass-2, independently audited (2026-08-05).** The 8 pass-2 grind
commits (`34bf95da`..`4d0079f2`) rewrote code and JSONs; an independent audit then
re-measured every pass-2 status change (15) plus 3+ spot-checks per surface against the
rebuilt preview (:4191), the live backend (127.0.0.1:17900, read-only), fresh
side-by-side composites (`apps/web/screenshots/side-by-side/audit2-*.png`), live wire
probes, and the source tree — and corrected 6 wrong statuses (see §3). Item count went
186 → 188 (the combined queued-tray item split in two; the collapsed-rail brand mark was
found and added). The pass-1 audited state (186 items, 142 match, 76.3%) is preserved in
git at `8c0267c6`; the original measurement (185 items, 49 match, 26.5%) at `d1498ed5`.

**Headline: 188 items measured, 150 match (79.8% implemented-and-aligned), 38 non-match,
of which 37 count as remaining work** (1 unbacked item — the composer attach button —
carries the agreed visible-degraded marker and is excluded per the audit rule).

---

## 1. Coverage scoreboard

Sorted worst-aligned first. Literal tallies of the corrected JSONs.

| Surface | Total | Match | Deviates | Missing | Not-wired | Unbacked | % aligned |
|---|---:|---:|---:|---:|---:|---:|---:|
| transcript-parts | 20 | 13 | 2 | 5 | 0 | 0 | 65.0% |
| composer-pill | 17 | 12 | 3 | 1 | 0 | 1 | 70.6% |
| menus-grammar | 16 | 12 | 3 | 0 | 1 | 0 | 75.0% |
| observability | 18 | 14 | 4 | 0 | 0 | 0 | 77.8% |
| icons-and-buttons | 15 | 12 | 2 | 0 | 1 | 0 | 80.0% |
| settings | 47 | 38 | 9 | 0 | 0 | 0 | 80.9% |
| rail-and-topbar | 19 | 16 | 1 | 1 | 1 | 0 | 84.2% |
| panels | 13 | 11 | 1 | 1 | 0 | 0 | 84.6% |
| fresh-session | 23 | 22 | 1 | 0 | 0 | 0 | 95.7% |
| **TOTAL** | **188** | **150** | **26** | **8** | **3** | **1** | **79.8%** |

Movement since the pass-1 audit: 76.3% → 79.8% aligned. Pass 2 genuinely closed the two
`"dir"`/`'directory'` wire defects (files-layer tree + `@` picker, both re-verified
live), the queue-tray geometry, the detail-slot collapse-to-strip, the prose-font
labels, the picker resize handles, and landed a real Settings > Relays page against the
newly-shipped `GET /v1/relay/status`. `not-wired` went 0 → 3 — not because controls
died, but because the audit found two live backend routes the JSONs wrongly recorded as
nonexistent (see §3): honest-degraded markers over real routes are dead controls, and
they count as remaining work.

---

## 2. Remaining items (37)

One row per item whose corrected status is not `match`, excluding the 1 unbacked item
carrying the visible-degraded marker (composer attach button). Grouped by surface,
worst first.

### transcript-parts (7)
| Item | Status | Gap |
|---|---|---|
| expert_handoff Call card | deviates | full isTask grammar (handle pill, arrow, clamp rules) is E9 |
| Child-card click → focused transcript | missing | destination pane does not exist (E9) |
| Artifact chips inline | deviates | meta line shows description/mime — size/row-count not on `resource_link` (E7 grounds it in ArtifactRecord) |
| HITL 'ask' card | missing | backend does not emit the part kind (documented P3 gap) |
| HITL 'permission required' card | missing | same |
| a2ui / mcp-ui live widget | missing | tracked gact-tui#324; honest placeholder renders today |
| Streaming text cursor | missing | no part-level still-streaming flag reaches the transcript renderer |

### composer-pill (4)
| Item | Status | Gap |
|---|---|---|
| Async chip ("async N") | deviates | popover real + wired, but not pixel-verified (no live in-flight async task at capture time) |
| Steering-context panel | missing | the focused/finished-child view it docks under does not exist (E9); split out of the queued-tray item, which is now a verified match |
| Model selector and its menu | deviates | **audit correction §3.1:** per-provider "default ⌄" silently omitted; two-line rows vs one-line; thinking row scrolls out of view; "model not set / model not set" doubled placeholder |
| Shift+Tab expand | deviates | owner-approved intentional addition beyond the prototype (not a gap to fix) |

### menus-grammar (4)
| Item | Status | Gap |
|---|---|---|
| Provider/model picker popover | deviates | per-provider "default ⌄" config sub-picker + sampling editor unbuilt (mutation-scope is a product call; sampling store has no wire) |
| Rail footer "agents N" cell | deviates | deliberate documented divergence: connection switcher instead of Settings navigation |
| Rail footer "relay" cell | not-wired | **audit correction §3.5:** `GET /v1/relay/status` is live and `relayStatus()` shipped — the cell still claims no wire surface exists |
| Capture-fixture mislabel note | deviates | data-integrity note about `proto-composer-menus.json`, not an app defect |

### observability (4)
| Item | Status | Gap |
|---|---|---|
| Pop-out (↗) header button | deviates | desktop-only; disabled + flagged (prototype's own button is inert too) |
| Row click-to-navigate | deviates | 4 of 5 surfaces navigate; artifact rows await a viewer (E7) |
| Artifacts tab row click-to-open | deviates | structural button present, disabled + flagged until a viewer exists (E7) — note the export route itself is live (§3.3) |
| Context tab "LIVE NOW" panel | deviates | honest in-session substitute; cross-session feed has no backend surface |

### icons-and-buttons (3)
| Item | Status | Gap |
|---|---|---|
| Detail-panel Download button/menu | not-wired | **audit correction §3.3:** `GET /v1/artifacts/{id}/export` has existed since #973 and serves bytes on the live backend — the disabled control and its "no route" title are wrong |
| Settings sub-pages rollup (13 pages) | deviates | rollup of settings.json's own statuses (7 of the named 13 deviate) |
| Settings Relays/Plugins/Data&backups rollup | deviates | Relays pane deviates (singleton vs registry); Plugins + Data & backups match |

### settings (9)
| Item | Status | Gap |
|---|---|---|
| Backends pane | deviates | Refresh real only for the active connection; add/connect-others disabled (gact-tui#338) |
| Providers pane | deviates | multi-config UI + editable NAME/ENDPOINT/key-save have no backend analog |
| Models pane | deviates | 'router lm' role does not exist on the wire; rows not yet expandable pickers |
| Agents pane | deviates | detach/disconnect unbacked (no such wire concept) |
| Relays pane | deviates | real singleton reachability row (live `GET /v1/relay/status`); the prototype's multi-host registry (add/remove, per-host latency) has no registry route |
| Agent blueprints pane | deviates | children/files counts not in the summary wire shape |
| Policies pane | deviates | PUT deliberately unwired (whole-document replace unsafe against shared backend) |
| Memory pane | deviates | real cache stats instead of the prototype's false "no memory capability" claim |
| Metrics pane | deviates | tool-calls/child-tasks rows have no source at this layer; real global metrics instead |

### rail-and-topbar (3)
| Item | Status | Gap |
|---|---|---|
| Rail footer "agents N" cell | deviates | same divergence menus-grammar records — click opens switcher, never navigates (dot color fixed pass 2, verified) |
| Rail footer "relay" cell | not-wired | **audit correction §3.5:** same as menus-grammar — live route, dead cell, now-false tooltip |
| Hierarchy ribbon | missing | hardcoded `['main']`; needs the E9 focus-stack + view-swap model |

### panels (2)
| Item | Status | Gap |
|---|---|---|
| Detail slot reachability | missing | nothing in the live transcript opens DetailSlot (E7) |
| Detail slot chrome | deviates | **audit correction §3.4:** chrome is real, but the download button's honest-degraded story is false — the export route exists; menu is client work now |

### fresh-session (1)
| Item | Status | Gap |
|---|---|---|
| Composer model selector, fresh state | deviates | **audit correction §3.2:** renders "model not set / model not set" (doubled placeholder) once model options load — `SessionView.tsx:1058` + `ProviderModelPicker.tsx:105-107` |

---

## 3. Audit corrections (what the pass-2 independent audit changed)

Six statuses in the pass-2 JSONs were wrong and were corrected in place (each JSON row
carries an `audit_correction` field with the full evidence). The two route findings are
the significant ones: both "honest-degraded" stories were built on wire claims that a
one-call live probe disproves.

1. **composer-pill / Model selector: match → deviates.** The pass-2 fixes are real
   (resize handle, plain eyebrows, the anchoring regression genuinely fixed —
   re-verified on `audit2-model.png`), but the item contradicted menus-grammar's
   `deviates` for the same control, silently omits the prototype's per-provider
   "default ⌄" sub-picker, renders two-line provider rows (pushing the thinking row
   behind scroll on the live catalogue), and shows a doubled "model not set / model not
   set" trigger label.
2. **fresh-session / Composer model selector: match → deviates.** Same doubled-label
   defect, visible on `audit2-fresh.png`: the synthetic placeholder row
   (`SessionView.tsx:1058`) is formatted as `{group} / {model}` with both halves the
   placeholder (`ProviderModelPicker.tsx:105-107`).
3. **icons-and-buttons / Download button: unbacked → not-wired.** The recorded claim
   "no artifact-content/download route confirmed on clio-agent" is false — clio-agent
   has served `GET /v1/artifacts/{artifact_id}/export` (hash-verified bytes,
   `routes/artifact_export.py`) since 2026-07-22 (#973). Probed live this audit: a real
   artifact id returned 200 with 5,282 bytes. A disabled control over a live route is a
   dead control, not an agreed degraded treatment.
4. **panels / Detail slot chrome: match → deviates.** Consequence of §3.3: the single
   disabled download button was justified by "no endpoint exists"; the endpoint exists,
   so the prototype's 3-item menu is (mostly) backable today and the item deviates.
5. **rail-and-topbar + menus-grammar / relay cell: unbacked → not-wired (both files).**
   clio-agent#1179 landed `GET /v1/relay/status` (probed live: 200, `reachable:true`),
   and the settings pass-2 commit (`62a732ce`) shipped `Client.relayStatus()` plus a
   working Settings > Relays page consuming it — *before* the rail pass-2 commit
   (`4d0079f2`) re-affirmed the cell as "unbacked". `Rail.tsx` still renders a disabled
   cell titled "relay reachability has no wire surface yet (clio-agent#1179)" — a
   now-false claim shown to users. Fix: drive the dot/label from `relayStatus()` and
   restore click-through to Settings > Relays.
6. **icons-and-buttons / settings rollups: evidence refreshed (statuses unchanged).**
   Both rollup rows cited a pre-`62a732ce` settings.json (Relays "missing"/"unbacked",
   36/9/1/1 tallies); text updated to the current 38-match/9-deviates reality.

Everything else re-measured held up. Verified pass-2 wins, confirmed by code + tests +
fresh composites: the mainQ queue tray (`audit2-queue.png` — header string, per-row
hints, ↑↓✎✕, pill-then-tray geometry), the files-layer real folder tree against the
live workspace (`audit2-files.png`), the `@`-picker `"dir"` filter fix (failing-first
test with the real wire spelling), prose-font display names + per-face previews
(`audit2-appearance.png`), the Relays nav item + pane (`audit2-relays.png`), timeline
thread connectors (live brackets on the anchor session, `audit2-obs-anchor-app.png`),
the collapsed-rail brand mark (`audit2-collapsed-rail-app.png`), the detail-slot
collapse-to-strip (code + 3 tests), and the MODE popover / new-dialog / fresh-state /
gantt spot-checks (`audit2-exec/newdialog/fresh/gantt-anchor*.png`). Suite green at
41 files / 478 tests; build green.

Tooling notes, disclosed: the `console` composite still cannot be captured (the
`isTauri` spoof crashes the boot probe — tracked in panels.json). The side-by-side
`fresh` setup creates a real session on the live backend each run (it drives the +new
dialog's CREATE SESSION for real) — this audit's run added one more "untitled session"
to the store, as every prior grind run did; cleanup is already a tracked task, but the
setup should be reworked before the store cleanup lands or it will re-pollute it.

---

## 4. Wire-gap ledger — prototype semantics with no clio-agent surface

Every unbacked prototype semantic, with the clio-agent surface it would need. These are
the candidate clio-agent issues; items marked *(desktop)* are Tauri-shell gaps, not
clio-agent routes. Two entries from the pass-1 ledger are **deleted because the routes
exist** (relay reachability — #1179 shipped; artifact download — #973 shipped): those
are now client wiring work, not wire gaps.

| # | Prototype semantic | Surface(s) | clio-agent surface needed |
|---|---|---|---|
| 1 | Composer attach ("+") upload flow | composer-pill, fresh-session | file-upload endpoint (e.g. `POST /v1/sessions/{id}/attachments` or workspace upload) |
| 2 | Relay REGISTRY (named hosts, add/remove, per-host latency) + Settings Relays parity | settings, rail-and-topbar, menus-grammar | relay-registry route (list/add/remove + per-host probe); reachability itself is live (`GET /v1/relay/status`, #1179) |
| 3 | Console dock — live shell REPL | panels | session/workspace-scoped shell-execution (PTY) route |
| 4 | "Open storage location" row of the artifact download menu | icons-and-buttons, panels | *(desktop)* OS reveal-in-folder — download-file/copy-link are backable today via `GET /v1/artifacts/{id}/export` (#973) |
| 5 | Files layer SAVE | panels | workspace file-write endpoint (`/v1/workspaces/{id}/files` write — verified absent: only GET `/files` + `/files/read` exist) |
| 6 | Files layer "browse…" above the workspace root | panels, fresh-session | filesystem browse route above the registered root *(or desktop OS picker — no surface on either side today)* |
| 7 | Per-model sampling-parameter editor (picker gear) | menus-grammar, composer-pill | per-model sampling-override store (nothing populates PATCH `model.variant`) |
| 8 | Per-provider "default ⌄" config picked per session | menus-grammar, composer-pill | per-session provider-config selection (only global `PUT /v1/providers/lm` exists; presets[] data is already there) |
| 9 | Provider NAME/ENDPOINT edit + API-key save | settings | provider-config write route + credential-bearing auth (current authenticate call carries no credential body) |
| 10 | Context tab relay-latency + thinking-tokens tiles | observability, panels | new fields on `GET /v1/sessions/{id}/context/state` (or a relay-metrics route); thinking-token count also absent per-part (#1177) |
| 11 | "LIVE NOW" cross-session running-jobs feed | observability | active-runs-across-sessions endpoint, or a running-status filter on `GET /v1/sessions` |
| 12 | Streaming cursor on in-progress text | transcript-parts | part/message-level "still streaming" indicator consumable by the transcript (SSE part exists; no flag reaches the renderer) |
| 13 | HITL ask + permission-required cards | transcript-parts | backend emission of the HITL ask/permission part kinds (documented P3 gap) |
| 14 | Models page "router lm" default role | settings | a router-lm role in the LM config wire (`LmConfigSnapshot` is a single global pair) |
| 15 | Observability pop-out window | observability, icons-and-buttons | *(desktop)* Tauri open-window API — not a clio-agent route; prototype's own button is inert |
| 16 | Steering-context panel state (live/reawaken/warning) | composer-pill | child-session live-state feed consumable by a focused-child view (E9 client work first; wire shape TBD with it) |

Already-correct visible-degraded treatments (no action needed until a surface ships):
composer attach button, console dock marker, new-dialog browse…, per-model gear,
files-layer SAVE/browse. **No longer on this list** (routes exist — wire the client):
rail relay cell, Settings Relays add/remove *(registry still needed for parity)*,
detail-slot/artifacts download button.

---

## Return summary

- **Total items measured:** 188 (across 9 surfaces)
- **Overall alignment:** 150/188 match = **79.8%** (pass-1 audit: 142/186 = 76.3%;
  original: 49/185 = 26.5%)
- **Non-match breakdown:** 26 deviates, 8 missing, 3 not-wired, 1 unbacked (sums to 38)
- **Remaining work items:** **37** (38 non-match minus the 1 visible-degraded unbacked)
- **Scoreboard (worst → best):** transcript-parts 65.0% · composer-pill 70.6% ·
  menus-grammar 75.0% · observability 77.8% · icons-and-buttons 80.0% · settings 80.9% ·
  rail-and-topbar 84.2% · panels 84.6% · fresh-session 95.7%
- **Audit corrections:** 6 statuses fixed. 2 findings are live-probe route
  discoveries — `GET /v1/artifacts/{id}/export` (#973) and `GET /v1/relay/status`
  (#1179) both exist while the JSONs claimed otherwise — plus 1 new visible defect
  (the doubled "model not set / model not set" label) and cross-file consistency on the
  model picker.
