# Session showcases

The **Conversation rail** button sits in the session header next to the
workspace-canvas opener (shortcut Ctrl .). It opens one popover for this
conversation. Context usage is at the top, then **Now** (running work and All
runs), then **In this conversation** (files, artifacts, tool calls and the other
inventories that have entries). Sections fold independently. **Customize rail**
chooses which sections appear, and **Open full view** moves the inventory into the
workspace canvas. The popover overlays the transcript rather than narrowing it,
and dismissing it keeps the composer draft.

This rail replaces the earlier four-state Top/Bottom dock. That dock's description
and validation are kept below as history.

## Release refresh (2026-11-11)

Recaptured from the develop build at `96dbbd2e1` with the same labelled fixture
(`web/tests/review/session-showcase.html`), in light mode. Records are still
simulated, and the fixture keeps its "Simulated records" label and unavailable
model chip.

| Capture | Viewport | Shows |
| --- | --- | --- |
| [wide-top.jpg](wide-top.jpg) | 1920 × 900 | Rail open beside the transcript with a composer draft |
| [wide-both.jpg](wide-both.jpg) | 1920 × 900 | Rail with Files and Artifacts expanded |
| [narrow-hidden.jpg](narrow-hidden.jpg) | 1280 × 900 | Rail closed; draft preserved |
| [narrow-flyout.jpg](narrow-flyout.jpg) | 1280 × 900 | Rail open over a narrower transcript |
| [phone-flyout-accepted.jpg](phone-flyout-accepted.jpg) | 390 × 900 | Rail on a phone; header controls and composer stay reachable |

## Earlier dock review (history)

The four-state toggle sat in the session's top toolbar immediately before the
right workspace-canvas opener. Left-click cycled None, Bottom, Top, Both; right-click
reversed the cycle. Top held context, connected sources, files and artifacts;
Bottom held tasks, agents, tool activity, plans, todos and schedules. The dock used
only a measured free right gutter and fell back to a temporary flyout in a tight
window.

These were labelled browser fixtures using the shipped shell, conversation,
composer and evidence components. Their records were simulated; no provider call
or document generation took place during that review.

Captured through the in-app browser in light mode. Originals are preserved at
`D:/Libraries/Videos/clio_recordings/2026-10-07-session-showcases`; SHA-256 verifies
every published copy. The earlier `phone-flyout.jpg` is rejected because its
fixture navigation did not use the shared responsive Sidebar. It is retained
only in the archive.

The production-route Playwright case in `web/e2e/composer-evidence.spec.ts` runs
the same three widths. It checks header placement, inventory separation,
gutter bounds, composer/draft stability, forward/reverse cycling, arrows,
Escape, outside-click focus and automatic hiding on resize. Five selected unit
cases check inventory sources, section contents, placement and canvas handoff.
Scoped lint, six frontend guards and online/offline builds pass. Existing
offline `import.meta` warnings remain. Full CI is checked separately.

To repeat the visual review, serve `web/tests/review/session-showcase.html` with
the owned Vite development server. Keep the fixture label visible and use the
real toolbar controls; do not describe its records as live agent output.
