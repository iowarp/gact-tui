# Prototype Conformance Map

Source: 9 element-level conformance JSON files in `docs/p5/conformance/` (`panels`,
`settings`, `icons-and-buttons`, `transcript-parts`, `composer-pill`, `fresh-session`,
`observability`, `menus-grammar`, `rail-and-topbar`). Every count below is a literal
tally of the `status` field across all 191 items in those 9 files — not an estimate.
Statuses: `match` / `deviates` / `missing` / `not-wired` / `unbacked`.

**State: post-grind-pass-3, independently audited (2026-08-05).** The 9 pass-3 grind
commits (`23aa7afd`..`fae44587`) rewrote code and JSONs; an independent audit then
re-measured every pass-3 status change (9 changed + 1 new item, all upgrades to
`match`) plus 3+ spot-checks per surface against the rebuilt preview (:4191), the live
backend (127.0.0.1:17900, read-only — note the store was rebuilt today: ndp/materio
demo workspaces, sessions mid-recreation), fresh side-by-side composites
(`apps/web/screenshots/side-by-side/audit3-*.png`), live wire probes, DOM bounding-box
probes, and the source tree. Result: **7 of the 10 pass-3 upgrades held; 3 statuses
were corrected back** (see §3), and the audit's spot-checks surfaced **2 previously
un-inventoried deviations** now added as items (settings nav typography; observability
log-row duration placement). Item count went 188 → 191. Prior states preserved in git:
pass-2 audit (188 items, 150 match, 79.8%) at `90647b38`; pass-1 audit (186, 142,
76.3%) at `8c0267c6`; original measurement (185, 49, 26.5%) at `d1498ed5`.

**Headline: 191 items measured, 157 match (82.2% implemented-and-aligned), 34
non-match, of which 33 count as remaining work** (1 unbacked item — the composer attach
button — carries the agreed visible-degraded marker and is excluded per the audit
rule).

---

## 1. Coverage scoreboard

Sorted worst-aligned first. Literal tallies of the corrected JSONs.

| Surface | Total | Match | Deviates | Missing | Not-wired | Unbacked | % aligned |
|---|---:|---:|---:|---:|---:|---:|---:|
| transcript-parts | 20 | 13 | 2 | 5 | 0 | 0 | 65.0% |
| observability | 19 | 14 | 5 | 0 | 0 | 0 | 73.7% |
| composer-pill | 17 | 13 | 2 | 1 | 0 | 1 | 76.5% |
| settings | 48 | 39 | 9 | 0 | 0 | 0 | 81.3% |
| menus-grammar | 17 | 14 | 3 | 0 | 0 | 0 | 82.4% |
| panels | 13 | 11 | 1 | 1 | 0 | 0 | 84.6% |
| icons-and-buttons | 15 | 13 | 2 | 0 | 0 | 0 | 86.7% |
| rail-and-topbar | 19 | 17 | 1 | 1 | 0 | 0 | 89.5% |
| fresh-session | 23 | 23 | 0 | 0 | 0 | 0 | 100.0% |
| **TOTAL** | **191** | **157** | **25** | **8** | **0** | **1** | **82.2%** |

Movement since the pass-2 audit: 79.8% → 82.2% aligned. Pass 3 genuinely closed the
async-runs popover (new sanctioned `async` capture setup, canned-route technique, no
server mutation), the artifact Download menu end-to-end (`Client.exportArtifact()`
against the real `GET /v1/artifacts/{id}/export` — re-probed this audit: 200,
`application/zip`, 21,569 bytes on a real materio artifact), both rail relay cells
(dot driven by the live `GET /v1/relay/status`, click-through to Settings > Relays —
re-verified in code and on `audit3-session.png`), the doubled "model not set / model
not set" trigger (single label re-probed live on a real model-less session), the
picker panes' max-height clip (DOM-probed: 240px row track, thinking row fully
in-viewport), and a real per-session Metrics pane (`audit3-metrics.png`). `not-wired`
went 3 → 0 — all three dead-controls-over-live-routes from the pass-2 audit are now
genuinely wired. The three walk-backs and two new items are §3.

---

## 2. Remaining items (33)

One row per item whose corrected status is not `match`, excluding the 1 unbacked item
carrying the visible-degraded marker (composer attach button). Grouped by surface,
worst first.

### transcript-parts (7)
| Item | Status | Gap |
|---|---|---|
| expert_handoff Call card | deviates | full isTask grammar (arrow, clamp rules) is E9; pass 3 added the real run-handle pill |
| Child-card click → focused transcript | missing | destination pane does not exist (E9) |
| Artifact chips inline | deviates | pass 3 grounded size via `metadata.size_bytes` where present; full grounding in ArtifactRecord is E7 |
| HITL 'ask' card | missing | backend does not emit the part kind (documented P3 gap) |
| HITL 'permission required' card | missing | same |
| a2ui / mcp-ui live widget | missing | tracked gact-tui#324; honest placeholder renders today |
| Streaming text cursor | missing | no part-level still-streaming flag reaches the transcript renderer |

### observability (5)
| Item | Status | Gap |
|---|---|---|
| Pop-out (↗) header button | deviates | desktop-only; disabled + flagged (prototype's own button is inert too) |
| Row click-to-navigate | deviates | 4 of 5 surfaces navigate; artifact rows await a viewer (E7) |
| Artifacts tab row click-to-open | deviates | structural button present, disabled + flagged until a viewer exists (E7); export route itself is live |
| Context tab "LIVE NOW" panel | deviates | honest in-session substitute; cross-session feed has no backend surface |
| Log-row duration placement | deviates | **audit-added §3.4:** app renders duration as a 5th right-aligned grid column; prototype puts it inline in the action text |

### composer-pill (3)
| Item | Status | Gap |
|---|---|---|
| Model selector and its menu | deviates | **audit correction §3.1:** the per-provider "default ⌄" badge is crushed to ≤4px (invisible) on 8 of 10 real provider rows — still a silent omission on the live catalogue |
| Steering-context panel | missing | the focused/finished-child view it docks under does not exist (E9) |
| Shift+Tab expand | deviates | owner-approved intentional addition beyond the prototype (not a gap to fix) |

### settings (9)
| Item | Status | Gap |
|---|---|---|
| Nav page-item rows typography | deviates | **audit-added §3.3:** mono-12px/cyan-active/180px rail vs the prototype's prose-14px/`--t-hd`-active/218px |
| Backends pane | deviates | Refresh real only for the active connection; add/connect-others disabled (gact-tui#338) |
| Providers pane | deviates | multi-config UI + editable NAME/ENDPOINT/key-save have no backend analog |
| Models pane | deviates | 'router lm' role does not exist on the wire; rows not yet expandable pickers |
| Agents pane | deviates | detach/disconnect unbacked (no such wire concept) |
| Relays pane | deviates | real singleton reachability row (live `GET /v1/relay/status`); the prototype's multi-host registry has no registry route |
| Agent blueprints pane | deviates | children/files counts not in the summary wire shape |
| Policies pane | deviates | PUT deliberately unwired (whole-document replace unsafe against shared backend) |
| Memory pane | deviates | real cache stats instead of the prototype's false "no memory capability" claim |

### menus-grammar (3)
| Item | Status | Gap |
|---|---|---|
| Provider/model picker popover | deviates | **audit correction §3.1** (same defect as composer-pill's model selector); per-session config mutation + sampling store remain wire gaps |
| Rail footer "agents N" cell | deviates | deliberate documented divergence: connection switcher instead of Settings navigation |
| Capture-fixture mislabel note | deviates | data-integrity note about `proto-composer-menus.json`, not an app defect |

### panels (2)
| Item | Status | Gap |
|---|---|---|
| Detail slot reachability | missing | nothing in the live transcript opens DetailSlot (E7) |
| Detail slot chrome | deviates | **audit correction §3.2:** sub-tab row paints lowercase where the prototype's own artTab buttons are `text-transform:uppercase`; everything else in the item (menu, breadcrumb, export wiring) verified real |

### icons-and-buttons (2)
| Item | Status | Gap |
|---|---|---|
| Settings sub-pages rollup (13 pages) | deviates | rollup of settings.json's own statuses (6 of the named 13 deviate) |
| Settings Relays/Plugins/Data&backups rollup | deviates | Relays pane deviates (singleton vs registry); Plugins + Data & backups match |

### rail-and-topbar (2)
| Item | Status | Gap |
|---|---|---|
| Rail footer "agents N" cell | deviates | same divergence menus-grammar records — click opens switcher, never navigates |
| Hierarchy ribbon | missing | hardcoded `['main']`; needs the E9 focus-stack + view-swap model |

### fresh-session (0)
All 23 items match — the surface is fully aligned (the doubled model-chip label was
fixed at the root in pass 3 and re-verified here on a real model-less session).

---

## 3. Audit findings (what the pass-3 independent audit changed)

Ten pass-3 status changes were re-measured. Seven held: async chip (`audit3-async.png`
— bolt rows, right-aligned elapsed, ✓ finished row with dismiss, lowercase
'run history ↗'), download button/menu (`audit3-detail.png` + live export probe + code
in `apps/core/src/client/artifact_export.ts` / `DetailSlot.tsx`), both relay cells
(`Rail.tsx:195-215,546-561` honesty rule + click-through; `GET /v1/relay/status`
probed live: `reachable:true`; green dot on `audit3-session.png`), the fresh-state
model chip (root guard in `ProviderModelPicker.tsx` + `fresh-session-pass3.png` +
locked test), the new panes max-height item (DOM probe: 240px clip, no overlap), and
Metrics (`audit3-metrics.png`: real context/tool-calls/child-tasks/artifacts rows in
the prototype's exact 4-row grammar). Three did not survive, and two new items were
added:

1. **composer-pill / Model selector: match → deviates.** The claim that the
   per-provider "default ⌄" indicator "now renders visible, disabled, and flagged"
   fails on the real catalogue: a Playwright bounding-box probe of the rebuilt preview
   measured `.provider-model-picker__cfg` at ≤4px wide — invisible — on 8 of 10
   provider rows (all but Anthropic API and OpenRouter). The row grid
   (`minmax(0,auto) minmax(0,1fr) minmax(0,72px)`) hands the badge the leftover 1fr,
   and real provider names consume the 210px column. The jsdom lock can't see it (no
   layout) — the same trap pass 3 itself documented for the status-text blowout it did
   catch and fix. The rest of the pass-3 work on this control is real and verified
   (one-line 28px rows, names never swallowed, clipped status with title, single
   trigger label).
2. **menus-grammar / Provider/model picker popover: match → deviates.** Same evidence;
   its reclassification rested on "none [of the grammar] is silently absent", which
   the invisible badge disproves. Its second pass-3 fix (the panes row-track clip) is
   genuinely fixed and keeps its own item's `match`.
3. **panels / Detail slot chrome: match → deviates.** The ARTIFACT/PROVENANCE/RECREATE
   sub-tab row paints lowercase: the prototype's own artTab buttons carry inline
   `text-transform:uppercase; letter-spacing:.08em` (verified byte-level), while the
   app's kit Tabs css has no text-transform — visible on `audit3-detail.png`. All
   other pass-3 claims in the item verified real (download menu + live export route,
   '›' breadcrumb, clickable first crumb, maximize/collapse).
4. **Two audit-added items (spot-check finds, both `deviates`):**
   **settings / Nav page-item rows** — the prototype's settings nav rows are prose
   14px, idle `--t-tx`, active `--t-hd` in a 218px rail; the app's MasterDetail rows
   are mono 12px, idle `--t-mu`, active cyan, 180px (visible on every settings
   composite; no prior item owned nav typography — items 2-21 are presence/order
   claims). **observability / Log-row duration placement** — the app renders
   durations as a separate right-aligned `auto` grid column
   (`Observability.tsx:622`, `observability.css:262`); the prototype's durations are
   inline in the action text (`'tool call (2.8s)'`), visible on `audit3-obs.png`.
5. **icons-and-buttons / settings rollup: evidence refreshed (status unchanged).**
   The 13-page rollup cited the pre-pass-3 settings tallies (Metrics still counted as
   deviating); text updated to the current 39-match/9-deviates reality (6 of its named
   13 deviate).

Tooling notes, disclosed: the audit did NOT run the `fresh` side-by-side setup — it
creates a real session on the live backend each run and the store was just rebuilt
(ndp/materio demo redo in flight); the fresh-state item was verified from the
checked-in pass-3 composite, the root-cause code, its locked test, and a live probe of
a real model-less session instead. The `console` composite remains uncapturable per
panels.json's standing note. Suite green at 41 files / 521 tests; build green.

---

## 4. Wire-gap ledger — prototype semantics with no clio-agent surface

Every unbacked prototype semantic, with the clio-agent surface it would need. These
are the candidate clio-agent issues; items marked *(desktop)* are Tauri-shell gaps,
not clio-agent routes. One entry is new this audit (#17, disclosed by pass 3's own
async work). Previously-deleted entries stay deleted (relay reachability #1179 and
artifact export #973 shipped and are now consumed end-to-end).

| # | Prototype semantic | Surface(s) | clio-agent surface needed |
|---|---|---|---|
| 1 | Composer attach ("+") upload flow | composer-pill, fresh-session | file-upload endpoint (e.g. `POST /v1/sessions/{id}/attachments` or workspace upload) |
| 2 | Relay REGISTRY (named hosts, add/remove, per-host latency) + Settings Relays parity | settings, rail-and-topbar, menus-grammar | relay-registry route (list/add/remove + per-host probe); reachability itself is live (`GET /v1/relay/status`, #1179) and consumed |
| 3 | Console dock — live shell REPL | panels | session/workspace-scoped shell-execution (PTY) route |
| 4 | "Open storage location" row of the artifact download menu | icons-and-buttons, panels | *(desktop)* OS reveal-in-folder — download-file/copy-link are live via `GET /v1/artifacts/{id}/export` (#973) |
| 5 | Files layer SAVE | panels | workspace file-write endpoint (`/v1/workspaces/{id}/files` write — verified absent: only GET `/files` + `/files/read` exist) |
| 6 | Files layer "browse…" above the workspace root | panels, fresh-session | filesystem browse route above the registered root *(or desktop OS picker — no surface on either side today)* |
| 7 | Per-model sampling-parameter editor (picker gear) | menus-grammar, composer-pill | per-model sampling-override store (nothing populates PATCH `model.variant`) |
| 8 | Per-provider "default ⌄" config picked per session | menus-grammar, composer-pill | per-session provider-config selection (only global `PUT /v1/providers/lm` exists; presets[] data is already there). NOTE: the client-side badge also has a rendering defect (§3.1) — fixing the badge does not close this wire gap, and vice versa |
| 9 | Provider NAME/ENDPOINT edit + API-key save | settings | provider-config write route + credential-bearing auth (current authenticate call carries no credential body) |
| 10 | Context tab relay-latency + thinking-tokens tiles | observability, panels | new fields on `GET /v1/sessions/{id}/context/state` (or a relay-metrics route); thinking-token count also absent per-part (#1177) |
| 11 | "LIVE NOW" cross-session running-jobs feed | observability | active-runs-across-sessions endpoint, or a running-status filter on `GET /v1/sessions` |
| 12 | Streaming cursor on in-progress text | transcript-parts | part/message-level "still streaming" indicator consumable by the transcript (SSE part exists; no flag reaches the renderer) |
| 13 | HITL ask + permission-required cards | transcript-parts | backend emission of the HITL ask/permission part kinds (documented P3 gap) |
| 14 | Models page "router lm" default role | settings | a router-lm role in the LM config wire (`LmConfigSnapshot` is a single global pair) |
| 15 | Observability pop-out window | observability, icons-and-buttons | *(desktop)* Tauri open-window API — not a clio-agent route; prototype's own button is inert |
| 16 | Steering-context panel state (live/reawaken/warning) | composer-pill | child-session live-state feed consumable by a focused-child view (E9 client work first; wire shape TBD with it) |
| 17 | Async runs popover per-row live progress ticker ('watching 155 in-region stations · sampling hourly') + finished-row meta ('awaiting review · 1 artifact') | composer-pill | progress/status-text (and artifact-count) fields on `GET /v1/sessions/{id}/agent-tasks`, or a live task-progress feed — today the rows carry only status/label/host/timestamps |

Already-correct visible-degraded treatments (no action needed until a surface ships):
composer attach button, console dock marker, new-dialog browse…, per-model gear,
files-layer SAVE/browse, download menu's "open storage location" row.

---

## Return summary

- **Total items measured:** 191 (across 9 surfaces)
- **Overall alignment:** 157/191 match = **82.2%** (pass-2 audit: 150/188 = 79.8%;
  pass-1 audit: 142/186 = 76.3%; original: 49/185 = 26.5%)
- **Non-match breakdown:** 25 deviates, 8 missing, 0 not-wired, 1 unbacked (sums to 34)
- **Remaining work items:** **33** (34 non-match minus the 1 visible-degraded unbacked)
- **Scoreboard (worst → best):** transcript-parts 65.0% · observability 73.7% ·
  composer-pill 76.5% · settings 81.3% · menus-grammar 82.4% · panels 84.6% ·
  icons-and-buttons 86.7% · rail-and-topbar 89.5% · fresh-session 100.0%
- **Audit outcome:** 7 of 10 pass-3 upgrades confirmed; 3 corrected back (invisible
  cfg badge ×2 files, lowercase sub-tabs); 2 new deviations inventoried (settings nav
  typography, obs duration column); 1 new wire-gap ledger entry (#17, async task
  progress fields).
