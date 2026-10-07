# Interface size review

Appearance now offers a saved Interface size of 100%, 125% or 150%. Text,
controls and portalled surfaces share the root rem scale. Fixed pixel text in
the transcript, tool details, navigation and artifact metadata uses equivalent
relative sizes, preserving the default appearance. Existing browser zoom and
default font preferences remain available.

Shared Settings choices keep icons beside labels when the control has room and
stack them in narrow controls. A full arrow-key press selects the focused radio
even when Radix defers focus until after keyup.

## Rendered evidence

| Capture | Evidence |
| --- | --- |
| `appearance-light-desktop.jpg` | Actual isolated CLIO web application, 1280x900, 150%. |
| `appearance-light-phone.jpg` | Actual isolated CLIO web application, 390x844, 150%; separate Theme icons and labels. |
| `appearance-dark-ultrawide.png` | Built production Settings route, controlled backend fixture, 3840x1440, 150%. |
| `create-dark-ultrawide.png` | Built production Create dialog, controlled backend fixture, 3840x1600, 150%; expanded controls retain the top anchor. |
| `create-dark-phone.png` | The same dialog at 390x844, with reachable actions. |

The actual application review changed only local Appearance preferences and
restored 100% and Dark afterward. No session, model binding or account state was
written. These captures establish browser layout, not native Desktop acceptance
or acceptance on the user's physical monitor. Screenshot originals are preserved
without pixel editing in
`D:/Libraries/Videos/clio_recordings/2026-10-07-ui-polish` with SHA-256 hashes.

## Focused validation

Two new preference cases and the shared Settings keyboard case passed
individually. The built Settings case covers saved size, reload, quick arrow
keys, text scaling and geometry at 3840/3440/1280/768/390 pixels. The built
composer/Create case covers 3840/1280/390 pixels. The existing Settings alignment
case passed separately. Each browser case ran with one worker. Scoped lint and
formatting, the shared frontend guards and sequential online/offline builds
passed. Broad suites remain on CI.
