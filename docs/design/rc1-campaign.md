# RC1 UI lift-off campaign

Release candidate 1 of the Web and Desktop workspace. Features are largely
complete; this campaign makes the interface match the
[visual language reference](visual-language/README.md), makes it fast and frugal,
and refreshes every screenshot.

## Goal

1. **Lift-off.** Implement the visual-language pages across Web and Desktop.
   `develop` is the functional baseline; the reference pages are the visual
   spec. Later reference pages override earlier ones where they conflict.
2. **Homogenize.** One general component per concept (picker, menu, dialog
   frame, tab, row, status, toolbar), reused on every surface.
3. **Performance and resources.** Every button, menu, picker and dialog
   responds immediately. Memory stays bounded: show the structure first, load
   the tail, fetch the rest on demand. Never load every conversation, index or
   cache into memory to make the interface feel fast.
4. **Screenshots.** A full, deterministic set of every surface and state, in
   light and dark, at several widths, replacing the current documentation
   images and filling pages that have none.

## Workstreams

| ID  | Workstream                                                                    | Depends on |
| --- | ----------------------------------------------------------------------------- | ---------- |
| H   | Harness: performance/resource runner, screenshot pipeline, baseline           | —          |
| F   | Shared component foundation (tokens, picker, menu, dialog, tab, row, toolbar) | H          |
| S1  | Left bar, top bar, composer, transcript                                       | F          |
| S2  | Workbench and right pocket (tabs, frame bar, viewers)                         | F          |
| S3  | Pickers, global search, settings                                              | F          |
| S4  | Connect, infrastructure, runs, attention                                      | F          |

Each surface workstream branches from `rc1/ui-liftoff` and opens its PR against
it. Only the final `rc1/ui-liftoff` → `develop` PR waits for the user.

## Round loop

Every surface workstream repeats until its acceptance criteria hold:

1. **Implement** against the reference page.
2. **Capture** with `pnpm screens` (dark and light, 1680/1280/1024/768/390).
3. **Review** each capture beside the reference preview; write a fix list.
4. **Measure** with `pnpm perf`; compare against [budgets](../../web/perf/budgets.json).
5. **Fix** the list, then repeat from step 2.

The harness, its commands and its outputs are described in
[docs/perf-and-screens.md](../perf-and-screens.md).

## Acceptance criteria

- Each surface matches its reference page at 1680, 1280, 1024 and 768 px, and
  remains usable at 390 px, in dark and light themes. No text wraps where the
  reference uses an ellipsis; no stacked headers or boxes inside boxes.
- Status is never color or a dot alone; workspace names are primary; brand copy
  comes from the selected brand (repository rules in `CLAUDE.md`).
- All `pnpm perf` budgets pass on the fixture scenarios, and no budget
  regresses against the [baseline](../perf/baseline/README.md) without a recorded reason.
- Opening a large conversation reads only its tail; older messages load on
  scroll. No interaction reads a whole conversation, every session or every
  file just to display a page.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and the e2e suites pass.
- The screenshot set is regenerated and the documentation pages listed in the
  baseline inventory are updated (Web docs in this repository and the CLIO site).
