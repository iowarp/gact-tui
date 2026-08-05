# Prototype Conformance Map

Source: 9 element-level conformance JSON files in `docs/p5/conformance/` (`panels`,
`settings`, `icons-and-buttons`, `transcript-parts`, `composer-pill`, `fresh-session`,
`observability`, `menus-grammar`, `rail-and-topbar`). Every count below is a literal
tally of the `status` field across all 186 items in those 9 files — not an estimate.
Statuses: `match` / `deviates` / `missing` / `not-wired` / `unbacked`.

**State: post-grind-pass-1, independently audited (2026-08-04).** The 9 grind commits
(`dddf1a97`..`aa0e309b`) rewrote these JSONs; an independent audit then re-measured every
status-changed item (116) plus per-surface spot-checks against the rebuilt preview
(:4191), the live backend (127.0.0.1:17900, read-only), fresh side-by-side composites
(`apps/web/screenshots/side-by-side/audit-*.png`), and the source tree — and corrected
6 wrong statuses (see §3). The original 2026-08-04 13:30 measurement (185 items, 49
match, 26.5%) is preserved in git at `d1498ed5`.

**Headline: 186 items measured, 142 match (76.3% implemented-and-aligned), 44 non-match,
of which 40 count as remaining work** (4 unbacked items already carry the agreed
visible-degraded marker and are excluded per the audit rule).

---

## 1. Coverage scoreboard

Sorted worst-aligned first. Literal tallies of the corrected JSONs.

| Surface | Total | Match | Deviates | Missing | Not-wired | Unbacked | % aligned |
|---|---:|---:|---:|---:|---:|---:|---:|
| composer-pill | 16 | 10 | 5 | 0 | 0 | 1 | 62.5% |
| transcript-parts | 20 | 13 | 2 | 5 | 0 | 0 | 65.0% |
| icons-and-buttons | 15 | 10 | 5 | 0 | 0 | 0 | 66.7% |
| observability | 18 | 13 | 5 | 0 | 0 | 0 | 72.2% |
| menus-grammar | 16 | 12 | 3 | 0 | 0 | 1 | 75.0% |
| settings | 47 | 36 | 9 | 1 | 0 | 1 | 76.6% |
| panels | 13 | 10 | 2 | 1 | 0 | 0 | 76.9% |
| rail-and-topbar | 18 | 15 | 1 | 1 | 0 | 1 | 83.3% |
| fresh-session | 23 | 23 | 0 | 0 | 0 | 0 | 100.0% |
| **TOTAL** | **186** | **142** | **32** | **8** | **0** | **4** | **76.3%** |

Movement since the original measurement: 26.5% → 76.3% aligned; `not-wired` went 19 → 0
(every dead control now either works or is honestly flagged); `missing` went 69 → 8.
fresh-session went from the worst surface (13.0%) to fully aligned — the idle state,
+new dialog, and pre-session composer were verified live on the audit composites
(`audit-sessmenu.png`, `audit-newdialog.png`) without touching the read-only backend.

---

## 2. Remaining items (40)

One row per item whose corrected status is not `match`, excluding the 4 unbacked items
already carrying the visible-degraded marker (composer attach button, rail relay cell
×2 files, Settings Relays pane). Grouped by surface, worst first.

### composer-pill (5)
| Item | Status | Gap |
|---|---|---|
| Async chip ("async N") | deviates | popover real + wired, but not pixel-verified (no live in-flight async task at capture time) |
| Queued-messages tray / steering panel | deviates | mainQ tray done; the steering-context panel half (focused/finished child) does not exist — E9 |
| Slash `/` and `@` menus | deviates | **audit find:** dir filter `type !== 'directory'` is a no-op against the wire's `type:"dir"` — directories appear in the `@` picker |
| Model selector and its menu | deviates | no resize handles; thinking row can need scroll on the live 10-provider catalogue |
| Shift+Tab expand | deviates | owner-approved intentional addition beyond the prototype (not a gap to fix) |

### transcript-parts (7)
| Item | Status | Gap |
|---|---|---|
| expert_handoff Call card | deviates | full isTask grammar (handle pill, arrow, clamp rules) is E9 |
| Child-card click → focused transcript | missing | destination pane does not exist (E9); card no longer lies about clickability |
| Artifact chips inline | deviates | meta line shows description/mime — size/row-count not on `resource_link` (E7 grounds it in ArtifactRecord) |
| HITL 'ask' card | missing | backend does not emit the part kind (documented P3 gap) |
| HITL 'permission required' card | missing | same |
| a2ui / mcp-ui live widget | missing | tracked gact-tui#324; honest placeholder renders today |
| Streaming text cursor | missing | no part-level still-streaming flag reaches the transcript renderer |

### icons-and-buttons (5)
| Item | Status | Gap |
|---|---|---|
| Send-while-busy message queue | deviates | works for the client's own send round-trip; whole-turn busy needs an always-on session-status feed |
| Detail-panel Download button/menu | deviates | glyph fixed; menu actions need an artifact-content route (E7) |
| Settings sub-pages rollup (13 pages) | deviates | **audit correction:** rollup of settings.json's own statuses (7 of 13 deviate) — was overstated as match |
| Settings Relays/Plugins/Data&backups rollup | deviates | Relays remains unbacked/hidden; Plugins + Data & backups match |
| Panel collapse/expand toggle icon | deviates | rail glyph corrected; detail-panel collapse-to-strip state doesn't exist (separate feature) |

### observability (5)
| Item | Status | Gap |
|---|---|---|
| Pop-out (↗) header button | deviates | desktop-only; disabled + flagged (prototype's own button is inert too) |
| Timeline row markers | deviates | six marker shapes correct; per-row bracket-tree thread connectors not built |
| Row click-to-navigate | deviates | 4 of 5 surfaces navigate; artifact rows await a viewer (E7) |
| Artifacts tab row click-to-open | deviates | structural button present, disabled + flagged until E7 lands a viewer |
| Context tab "LIVE NOW" panel | deviates | honest in-session substitute; cross-session feed has no backend surface |

### menus-grammar (3)
| Item | Status | Gap |
|---|---|---|
| Provider/model picker popover | deviates | per-provider "default ⌄" config sub-picker + sampling editor unbuilt (no wire surface; global-vs-session mutation is a product call) |
| Rail footer "agents N" cell | deviates | deliberate documented divergence: connection switcher instead of Settings navigation |
| Capture-fixture mislabel note | deviates | data-integrity note about `proto-composer-menus.json`, not an app defect |

### settings (10)
| Item | Status | Gap |
|---|---|---|
| Nav item: Relays | missing | genuinely unbacked; ships hidden per policy |
| Backends pane | deviates | Refresh real only for the active connection; add/connect-others disabled (gact-tui#338) |
| Providers pane | deviates | multi-config UI + editable NAME/ENDPOINT/key-save have no backend analog |
| Models pane | deviates | 'router lm' role does not exist on the wire; rows not yet expandable pickers |
| Agents pane | deviates | detach/disconnect unbacked (no such wire concept) |
| Agent blueprints pane | deviates | children/files counts not in the summary wire shape |
| Policies pane | deviates | PUT deliberately unwired (whole-document replace unsafe against shared backend) |
| Memory pane | deviates | real cache stats instead of the prototype's false "no memory capability" claim |
| Metrics pane | deviates | tool-calls/child-tasks rows have no source at this layer; real global metrics instead |
| Appearance — Prose font | deviates | **audit find:** buttons render union keys (`inter`, `source`, …), not the prototype's full font names |

### panels (3)
| Item | Status | Gap |
|---|---|---|
| Files Layer content | deviates | **audit find:** wire types dirs as `"dir"`, FilesLayer tests `!== 'directory'` — dir entries render as file rows, no folder grouping (audit-files.png) |
| Detail slot reachability | missing | nothing in the live transcript opens DetailSlot (E7) |
| Detail slot chrome | deviates | chrome rebuilt; download menu + collapse-to-rail await backing/design |

### rail-and-topbar (2)
| Item | Status | Gap |
|---|---|---|
| Rail footer "agents N" cell | deviates | **audit correction:** same divergence menus-grammar records — click opens switcher, never navigates |
| Hierarchy ribbon | missing | hardcoded `['main']`; needs the E9 focus-stack + view-swap model |

---

## 3. Audit corrections (what the independent pass changed)

Six statuses in the grind-pass JSONs were wrong and were corrected in place (each JSON
row carries an `audit_correction` field with the full evidence):

1. **panels / Files Layer content: match → deviates.** Live probe of
   `GET /v1/workspaces/{id}/files` returns `type:"dir"`; `FilesLayer.tsx:59,64`
   classifies with `file.type !== 'directory'`, so dir entries misrender as files
   (visible on `audit-files.png`). Unit fixtures never used the wire's real spelling.
2. **composer-pill / `@` picker: match → deviates.** Same root cause —
   `SessionView.tsx:486`'s directory filter never matches `"dir"`, so directories are
   listed in the `@` picker.
3. **composer-pill / queued tray + steering panel: match → deviates.** The element names
   the steering panel; it is wholly unimplemented (conceded by the item's own fix_hint).
4. **settings / Appearance Prose font: match → deviates.** Buttons render the ProseFont
   union keys, not the prototype's font names (`theme.ts:15`, no display-label map).
5. **icons-and-buttons / 13-settings-pages rollup: match → deviates.** settings.json —
   its declared source of truth — records 7 of the 13 panes as deviates.
6. **rail-and-topbar / "agents N" cell: match → deviates** (and **relay cell:
   deviates → unbacked**) — cross-file consistency with menus-grammar's statuses for
   the same two controls.

Everything else re-measured held up: 40 unit-test files / 435 tests green, build clean,
and every claim spot-checked (composites `audit-session/ask/exec/model/sessmenu/search/
newdialog/files/artifacts/context/obs*/settings*/runs-anchor` plus direct code reads)
matched the JSONs' evidence. The `console` composite still cannot be captured
(side-by-side.mjs's `isTauri` spoof crashes the boot probe — a disclosed tooling gap,
tracked in panels.json).

---

## 4. Wire-gap ledger — prototype semantics with no clio-agent surface

Every unbacked prototype semantic, with the clio-agent surface it would need. These are
the candidate clio-agent issues; items marked *(desktop)* are Tauri-shell gaps, not
clio-agent routes, and are listed for completeness only.

| # | Prototype semantic | Surface(s) | clio-agent surface needed |
|---|---|---|---|
| 1 | Composer attach ("+") upload flow | composer-pill, fresh-session | file-upload endpoint (e.g. `POST /v1/sessions/{id}/attachments` or workspace upload) |
| 2 | Relay cell (live dot) + Settings Relays page | rail-and-topbar, menus-grammar, settings | relay reachability endpoint (**clio-agent#1179**, filed) + a relay registry list/add/remove route |
| 3 | Console dock — live shell REPL | panels | session/workspace-scoped shell-execution (PTY) route |
| 4 | Artifact download menu (file / storage location / link) | icons-and-buttons, panels | artifact content/download route on the #966 ArtifactRecord surface |
| 5 | Files layer SAVE | panels | workspace file-write endpoint (`/v1/workspaces/{id}/files` write) |
| 6 | Files layer "browse…" above the workspace root | panels, fresh-session | filesystem browse route above the registered root *(or desktop OS picker — no surface on either side today)* |
| 7 | Per-model sampling-parameter editor (picker gear) | menus-grammar, composer-pill | per-model sampling-override store (nothing populates PATCH `model.variant`) |
| 8 | Per-provider "default ⌄" config picked per session | menus-grammar | per-session provider-config selection (only global `PUT /v1/providers/lm` exists; presets[] data is already there) |
| 9 | Provider NAME/ENDPOINT edit + API-key save | settings | provider-config write route + credential-bearing auth (current authenticate call carries no credential body) |
| 10 | Context tab relay-latency + thinking-tokens tiles | observability, panels | new fields on `GET /v1/sessions/{id}/context/state` (or a relay-metrics route); thinking-token count also absent per-part (#1177) |
| 11 | "LIVE NOW" cross-session running-jobs feed | observability | active-runs-across-sessions endpoint, or a running-status filter on `GET /v1/sessions` |
| 12 | Streaming cursor on in-progress text | transcript-parts | part/message-level "still streaming" indicator consumable by the transcript (SSE part exists; no flag reaches the renderer) |
| 13 | HITL ask + permission-required cards | transcript-parts | backend emission of the HITL ask/permission part kinds (documented P3 gap) |
| 14 | Models page "router lm" default role | settings | a router-lm role in the LM config wire (`LmConfigSnapshot` is a single global pair) |
| 15 | Observability pop-out window | observability, icons-and-buttons | *(desktop)* Tauri open-window API — not a clio-agent route; prototype's own button is inert |

Already-correct visible-degraded treatments (no action needed until a surface ships):
composer attach button, rail relay cell, Settings Relays (hidden), console dock marker,
artifacts-tab row buttons, detail-slot download button, new-dialog browse…, per-model
gear, files-layer SAVE/browse.

---

## Return summary

- **Total items measured:** 186 (across 9 surfaces)
- **Overall alignment:** 142/186 match = **76.3%** (was 49/185 = 26.5% pre-grind)
- **Non-match breakdown:** 32 deviates, 8 missing, 0 not-wired, 4 unbacked (sums to 44)
- **Remaining work items:** **40** (44 non-match minus the 4 visible-degraded unbacked)
- **Scoreboard (worst → best):** composer-pill 62.5% · transcript-parts 65.0% ·
  icons-and-buttons 66.7% · observability 72.2% · menus-grammar 75.0% · settings 76.6% ·
  panels 76.9% · rail-and-topbar 83.3% · fresh-session 100.0%
- **Audit corrections:** 6 statuses fixed (2 real code defects found: the `"dir"` vs
  `'directory'` wire mismatch in the files layer and the `@` picker; plus 4
  classification errors)
