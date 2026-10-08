# Paused composer queue after Stop

Stop closes the active turn, then the core delivers already submitted feedback
under its accepted message IDs. The explicit future-message queue stays paused
through those follow-up turns. Its header shows **queued messages (paused)**;
the existing **Send queued message now** action remains available. An explicit
idle send resumes automatic queue processing.

These Chromium captures use the production queue component and real appearance
and motion providers with labelled simulated inputs. Desktop (1280x900) and
phone (390x844) checks verify the pause label, viewport containment and explicit
Send now. They verify rendering and interaction, not live model inference or
native Desktop acceptance. No account or user-data writes occur.

- [Desktop capture](paused-queue-desktop-fixture.png)
- [Phone capture](paused-queue-mobile-fixture.png)

The real API regression in core PR1658 verifies old-turn cancellation, two
accepted feedback messages delivered once and in order without an extra send,
unchanged message identities, future-queue retention and explicit promotion.
The pause survives session-store reload; server shutdown still prevents re-drive.

Run the fixture with `pnpm --dir web exec vite --config tests/review/transcript-vite.config.ts`
and `node web/tests/review/paused-composer-queue-check.mjs` from the repository root.
