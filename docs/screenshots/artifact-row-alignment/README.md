# Artifact row alignment

The shared artifact card used a floating toolbar despite having a header row.
Actual generated Word and PowerPoint outputs reproduced a 12px horizontal
overlap with Output and a menu positioned 6.5px above the header center.

The header now uses the existing inline SurfaceToolbar layout. The menu and
relation badge reserve their own space, with a 10px gap and vertically aligned
centers. Hover and keyboard focus reveal the menu without moving the row.
This shared card serves transcript attachments, artifact browsing and evidence.

These screenshots show the actual generated Office artifacts in the isolated
8152 service through UI 5198, using light desktop and dark phone views. The
browser review opened each More menu and verified Download was available;
it did not generate another document or change the selected model.

The individual `artifact-row-layout.spec.ts` browser case passed with one worker
at 1280px and 390px. It checks the PNG output row's icon, metadata, badge and menu
centers; non-overlap; stable hover/focus geometry; keyboard access; and Download.
Its fixture framing reserves trailing scroll room above the composer without
changing the artifact header. TypeScript and online/offline builds, scoped lint,
formatting and frontend guards passed. The offline build retains its existing
PDF import.meta warning.

Original before/after captures, measured geometry, browser helper and selected
logs are archived with verified SHA-256 hashes at
`D:/Libraries/Videos/clio_recordings/2026-10-06-artifact-row-alignment`.
This browser review is separate from native Desktop acceptance.
