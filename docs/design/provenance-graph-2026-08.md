# Provenance view rework — design spec (2026-08-06)

Owner direction (2026-08-05/06): the prototype's provenance view was basic and
we can do a lot more. The current implementation wastes the panel: the
mechanism/designation/evidence/custody table, the VERSION RECORD and TRANSFORM
RECORD folds are largely REDUNDANT with the identity header and the graph
itself, and column-width rectangle nodes make the graph hard to parse. This
spec replaces all of it. The implementer MUST verify the built view against the
ASCII mockups below (structure, line composition, one-line-per-node rule,
cluster grammar) — they are the contract, not an illustration.

## What dies (space reclaimed)

- The 4-row `mechanism / designation / evidence / custody` KvGrid → ONE compact
  line (two only if it wraps at 320px): `model · agent-proposed ·
  hashed-at-use · workspace-referenced` — muted mono, dot-separated, directly
  under the tab strip.
- The `▸ VERSION RECORD` fold → DELETED. Its rows are already carried by the
  identity header (artifact id, sha, size, kind) and the provenance line
  (mechanism, designation, evidence, custody). Nothing is lost.
- The `▸ TRANSFORM RECORD` fold → DELETED. The instrument (tool) renders ON the
  graph as the activity node; reproducible/re-runnable/gap status renders as a
  small pill on the activity node's line. The Recreate tab keeps the full
  transform detail — that is its job.

## The graph: one line per node, connector rail, session clusters

Rules:

1. **A node is ONE line.** Glyph + name + inline muted sub-info. Never a
   bordered rectangle spanning the column.
   - `◆` artifact — `◆ name vN · size` (self node: highlighted name + `· you
     are here` marker or brighter glyph; clickable when not self → opens that
     artifact in the panel, pushing the stack).
   - `⚙` activity — `⚙ tool · duration` + status pill when not plain-ok
     (`reproducible` / `re-runnable` / `gap`).
   - `▢` gap — `▢ gap · <reason>` muted.
2. **Edges are connector lines** on a left rail (elbow glyphs), each carrying
   `verb → evidence` in teal on its own indented line:
   `╰ generated → hashed-at-use`. A used edge joining INTO a node from
   elsewhere renders `╰ used → authority-asserted ╮` with the join drawn to
   the consumer line.
3. **Session clusters.** Nodes group under the session that produced them.
   - The viewing session's cluster has no header (it is the default context).
   - A FOREIGN session's nodes sit under a one-line cluster header:
     `● sess_9f17… · 05 Aug 12:43 ↗` — dimmed left rail for the whole cluster,
     the header clickable (jumps to that session; the ↗ is the affordance).
     This is the cross-session semantics (gact-tui#355) drawn INTO the graph
     rather than bolted on per node.
4. **Branches** (multi-input activities, once clio-agent#1191 lands
   used-inputs): each input chain renders above the consuming activity,
   connectors merging with `╮`/`╯` elbows into the activity's rail position.
   Depth is indentation only — never nested boxes.
5. Chronology top→bottom (oldest first); the self artifact is normally the
   LAST line. No `route`/`lineage` eyebrow debate: keep the `LINEAGE` caption.

## Mockup 1 — simple local chain (the PNG, all in this session)

```
model · tool-schema · hashed-at-use · workspace-referenced

LINEAGE
◆ MTA1.CI.LY_.30.csv v1 · 50.4 MB
╰ used → hashed-at-use
⚙ plot_plot_timeseries · 7.9s
╰ generated → hashed-at-use
◆ MTA1.CI.LY_.30_position.png v1 · 179 KB · you are here
```

## Mockup 2 — cross-session chain (the CSV was minted by another session)

```
LINEAGE
● sess_9f17… · 05 Aug 12:43 ↗
┆ ⚙ ndp_stage_resource · 1.7s
┆ ╰ generated → hashed-at-use
┆ ◆ MTA1.CI.LY_.30.csv v1 · 50.4 MB
╰ used → hashed-at-use
⚙ plot_plot_timeseries · 7.9s
╰ generated → hashed-at-use
◆ MTA1.CI.LY_.30_position.png v1 · 179 KB · you are here
```

(`┆` = the dimmed foreign rail; the cluster header line is the click target.)

## Mockup 3 — branching multi-input (the report, post-#1191)

```
LINEAGE
◆ MTA1.CI.LY_.30.csv v1 ──────────╮
◆ MTA1.CI.LY_.30_position.png v1 ─┤
◆ earthscope_stations_clean.csv v1┤
                 ╰ used → declared┤
⚙ create_artifact · model  [gap] ─╯
╰ generated → hashed-at-use
◆ MTA1_LA_ground_motion_report.md v1 · 5.7 KB · you are here
```

(Exact elbow art may differ; the CONTRACT is: one line per input artifact,
visible join into the single consuming activity, `[gap]`/status pill on the
activity when its transform is not reproducible.)

## Interaction contract

- Non-self `◆` node click → open that artifact in the panel (push).
- Foreign cluster header click → navigate to that session (center), same
  channel as obs agent-navigation.
- `⚙` node click → open the producing session's transcript at that turn when
  session/turn ids are present (else inert, no fake affordance).
- Hover on any line: subtle row highlight; the whole line is the hit target.

## Sizing

Must read correctly at 320px (panel minimum) — sub-info truncates with
ellipsis before the name does; connectors and glyphs never wrap. At 720px the
lines simply breathe; no layout switch.
