# Model refresh and provider setup review

These are actual Chromium captures of the real picker and shared settings
components at 1280 × 900 and 390 × 844. Provider replies are **simulated test
fixtures**. This review makes no account, client, inference or user-default
writes; it does not prove fresh provider inference or native Desktop acceptance.

- `codex-client-update-desktop-fixture.png`: direct Codex offers its managed
  component update even though its transport runs no CLI and has no CLI badge.
- `claude-client-gap-desktop-fixture.png`: a current client with a catalogued
  model requiring a newer client reports information, rather than an error.
- `local-server-url-mobile-fixture.png`: stopped server URL editing stays inside
  the picker at phone width. Saving checks that address through the same owner
  as Settings; it does not bind a new default model.
- `attention-sound-mobile-fixture.png`: the shared segmented labels remain
  readable without breaking inside “background”.

The interaction check also exercises settings navigation, dialog dismissal,
focus on the requested provider's real settings card, and viewport containment.
It found and fixed a focus race: ordinary picker dismissal restores the trigger;
navigation to settings leaves focus with the requested settings control.

Reproduce with `pnpm --dir web exec vite --config tests/review/vite.config.ts`
and, from `web`, `node tests/review/provider-picker-check.mjs`. The fixture page
is `tests/review/provider-picker.html`. The review JSON and captures are written
to `web/test-results/provider-picker`, or `CLIO_REVIEW_OUTPUT` if set.
The check requires the actual Inter font to load. Its review-only server config
allows shared dependency assets when the checkout uses a node_modules junction.

Separately, a live read of the same Codex account using an actual isolated
0.161.0 client distribution returned `gpt-6.1-sol`; the 0.157.1 distribution's
read did not. That temporary probe was uninstalled after preserving its receipt.
It did not upgrade the user's installed Desktop. Claude's maintained catalog
and official minimum-client requirements are validated by the paired core PR.
