# Shared dialog polish review

The overnight review on 2026-10-07 reproduced a long heading reaching under the
corner close control and a 700px selector menu extending beyond a 390px window.
The shared dialog now reserves close-control space on its title only; long
titles and descriptions wrap without changing the dialog's top anchor. Shared
selector menus use the available width and keep long option labels readable.
Confirmation dialogs also retain a 16px margin in windows narrower than 320px.

`ResultDialogContent` uses the common title clearance instead of reserving its
own header padding. Create and Share copy describes the user's action without
workspace-root or server-ownership terminology.

## Rendered evidence

| Capture | Evidence |
| --- | --- |
| `before-select-phone.jpg` | Labelled component fixture, 390x640, original clipped menu and heading collision. |
| `after-select-phone.jpg` | The same synthetic input in real shared components, 390x640, light theme. |
| `dialog-dark-desktop.jpg` | Labelled component fixture, 1280x720, complete long title and separate close control. |
| `confirmation-narrow.jpg` | Labelled component fixture, 280x440, complete filename, margins and reachable Cancel. |
| `create-light-desktop.jpg` | Actual isolated application at 5198, real Create dialog with advanced controls; creation was not submitted. |

These screenshots establish layout and interaction review, not fresh provider
inference or native Desktop acceptance. The fixtures live under `web/tests/review`
and mount the real shared components; production code has no simulated services.
Original captures and selected source/log files are archived under
`D:/Libraries/Videos/clio_recordings/2026-10-07-ui-polish` with SHA-256 hashes.

## Focused validation

Three new browser cases passed individually with one worker: title clearance and
stable expansion, complete selector labels with nested keyboard focus, and narrow
confirmation bounds. Existing built-production Create and shared Markdown result
cases also passed individually. Two shared-dialog unit cases and the existing
creation behavior case passed separately. TypeScript, scoped lint/formatting,
all six shared frontend guards, and online/offline builds passed.

The shared-component browser configuration is now
`web/playwright.components.config.ts`, preserving the existing result checks and
adding dialog checks as a mandatory CI step. Built production routes remain a
separate mandatory path. The first standalone typecheck hit its 1 GB heap cap;
compilation subsequently passed inside the sequential 2 GB builds. No full local
suite or parallel test batch was run, and no limit or baseline was weakened.
