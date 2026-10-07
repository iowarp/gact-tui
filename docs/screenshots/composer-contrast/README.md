# Composer contrast review

These are unedited browser captures of the production session route with the
repository's controlled EarthScope fixture. They demonstrate the composer, not
a new provider conversation or native Desktop acceptance.

The composer now uses an opaque, neutral grey surface in dark mode and a pale
surface in light mode, with a restrained border. Editor focus keeps cyan but
reduces the outer ring from 3px at 50% opacity to 2px at 15%, with a 65% border.
Disabled footer buttons no longer tint the entire input group.

The selected Chromium cases in `web/e2e/composer-surface.spec.ts` passed
individually, sequentially, with one worker at 1280x900 and 390x900 in both themes.
They check surface separation, placeholder contrast, stable focus geometry,
horizontal overflow, unchanged background when a draft enables actions, and
keyboard model-picker opening/closing without losing the draft. The fixture's
messages are loaded before capturing.

Measured placeholder contrast was 5.36:1 in dark mode and 5.98:1 in light mode.
Surface/background separation was 1.43:1 and 1.09:1 respectively; these surface
values are design measurements, not claims about WCAG text requirements.

The existing composer draft/attachments reconciliation case passed individually.
Frontend lint, formatting, all six frontend guards, TypeScript, and both online
and offline builds passed. No user service or native application was restarted.

| Capture                             | Purpose                                        |
| ----------------------------------- | ---------------------------------------------- |
| `dark-desktop-fixture.png`          | Loaded transcript and idle composer in context |
| `dark-idle-composer-fixture.png`    | Neutral grey surface and subtle border         |
| `dark-focused-composer-fixture.png` | Softer cyan editor focus                       |
| `light-idle-composer-fixture.png`   | Light-theme surface and border                 |
| `dark-phone-fixture.png`            | Focused composer at 390px                      |
| `light-phone-fixture.png`           | Focused light composer at 390px                |

Original overview/detail captures, selected test logs, metrics, test source,
review notes, and SHA-256 hashes are retained under
`D:/Libraries/Videos/clio_recordings/2026-10-07-composer-contrast`.
Initial keyboard-label/hit-target assumptions, the inherited disabled-surface
diagnostic, and the first light desktop capture during session loading are
retained separately and are not published as accepted evidence.
