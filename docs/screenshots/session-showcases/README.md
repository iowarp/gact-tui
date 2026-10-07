# Session showcases

The four-state toggle sits in the session's top toolbar immediately before the
right workspace-canvas opener. Left-click cycles None, Bottom, Top, Both; right-click
reverses the cycle. Arrow keys provide the same operation.

Top contains context, connected sources, files and artifacts. Bottom contains
tasks, agents, tool activity, plans, todos and schedules. Compact artifact rows
keep their generation owner in a tooltip instead of repeating a subtitle.

The dock occupies only a measured free right gutter beside both the transcript
column and composer form. It never narrows either surface. A shrinking gutter
closes the dock. In a tight window, explicitly pressing the toolbar button opens
a temporary flyout below it, above the composer. Clicking outside dismisses it
and preserves the draft and the clicked input's focus.

## Review evidence

These are labelled browser fixtures using the shipped shell, conversation,
composer and evidence components. Their records are simulated; no provider call
or document generation took place during this review. They demonstrate layout
and interaction, not a successful inference or document-authoring run.

| Capture | Viewport | Review |
| --- | --- | --- |
| [wide-top.jpg](wide-top.jpg) | 1920 × 900 | Top inventory beside the transcript; toggle next to canvas opener |
| [wide-both.jpg](wide-both.jpg) | 1920 × 900 | Separate data and work inventories, with collapsible categories and independent scrolling |
| [narrow-hidden.jpg](narrow-hidden.jpg) | 1280 × 900 | Dock hidden after losing its gutter; draft preserved |
| [narrow-flyout.jpg](narrow-flyout.jpg) | 1280 × 900 | Explicit temporary flyout clears the composer |
| [phone-flyout-accepted.jpg](phone-flyout-accepted.jpg) | 390 × 900 | Shared responsive sidebar; toggle and composer remain reachable |

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
