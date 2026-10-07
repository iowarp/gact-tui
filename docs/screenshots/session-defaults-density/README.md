# Session defaults layout review

October 7, 2026. These are browser fixtures rendered by the production Settings routes, using the repository fixture service on port 18858 and a built preview on port 4188. They demonstrate layout and interaction; they do not demonstrate fresh provider inference or native Desktop acceptance. The user's 5196/8141 stack was untouched.

Session defaults now uses Appearance's content width and full-width row dividers. Desktop controls share a right edge; stacked tablet and phone controls align with their labels. The model control stays on one line, including its reset action when pinned. Inherited-model details remain in the label's information tooltip. Reasoning uses `Default (Medium)` for the reported inherited level. Save and connection ownership are one left-aligned footer row.

- `defaults-dark-desktop.png` and `defaults-light-desktop.png`: 1280px inherited-model layouts.
- `defaults-dark-phone.png` and `defaults-light-phone.png`: 390px stacked layouts.
- `appearance-dark-desktop.png`: the shared layout used for comparison.
- `defaults-dark-pinned.png`: pinning the inherited model exposes the inline reset without increasing the row height.

Two browser cases passed separately, sequentially, with one worker. Each checks Appearance, General and Session defaults at 1280, 768 and 390px in one theme. They verify matching content bounds, full-width dividers, equal defaults-row heights, control alignment, no overflow, the shared searchable model picker, hidden-provider management, pinning and resetting inheritance. All six geometry records contain zero settings writes; no browser errors were recorded. The existing Appearance geometry regression also passed individually.

The fixture overlay supplies null starting effort and the canonical Codex provider ID. Its legacy LM fixture only reports `provider`; the first attempt without the canonical field is retained as rejected evidence. Captures before the final shared control alignment are retained as superseded evidence.

Six focused component cases passed individually with one worker. Final frontend lint, scoped formatting, six ownership/presentation guards, TypeScript and online/offline builds passed. Existing offline pdfjs `import.meta` warnings remain.

Original captures, geometry, review sources and validation logs are preserved in `D:/Libraries/Videos/clio_recordings/2026-10-07-session-defaults-density`. Published PNGs are byte-identical to their accepted originals; the archive includes a verified SHA-256 manifest.
