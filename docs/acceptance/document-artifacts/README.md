# Document workspace browser acceptance

Chromium exercised the production web build against the deterministic mock
backend in `apps/web/tests/visual/document-artifacts.spec.ts`.

The recorded path:

1. Opens a Markdown artifact at immutable version 2.
2. Selects the text `tentative pending quality review`.
3. Opens the contextual floating review composer beside that selection.
4. Sends a review bound to the exact artifact version and hash.
5. Opens Comments and confirms the dispatched review.
6. Opens immutable version 1 from History.
7. Opens Policy and confirms the canonical-source and safety guidance.

Evidence:

- `../../screenshots/document-markdown-review.webm` is the Markdown review
  recording (media files live under `docs/screenshots/` per the CI media
  policy; the evidence text stays here).
- `../../screenshots/document-pdf-review.webm` is the PDF text-layer review
  recording (media files live under `docs/screenshots/` per the CI media
  policy; the evidence text stays here).
- `../../screenshots/document-floating-review.png` captures the selected text,
  floating composer, quote, and proposed comment.
- `../../screenshots/document-history-policy.png` captures immutable version 1
  and the Policy view.
- `../../screenshots/document-pdf-review.png` captures the real rendered PDF
  page, its selectable text layer, page-bound selection, and contextual
  comment.

Visual review found the contextual composer legible and correctly attached to
the document selection. History and Policy remain readable in the narrow
artifact rail, and the provenance/version indicator stays visible. The central
conversation is necessarily compressed in the three-column desktop layout; the
document rail is intended to expand through the existing pane controls for
long-form review.

The PDF run also found and fixed a shipped-browser compatibility failure in
PDF.js (`Uint8Array.toHex`, `Map.getOrInsertComputed`, `Promise.try`, and
`Set.intersection`). The compatibility shim is installed in both the host and
worker realms, and the final Chromium run passed PDF rendering and selection.

The connected in-app browser runtime had no available browser during this run.
This bundle is therefore automated Chromium evidence, not a claim of manual
in-app-browser acceptance. The real Codex/API transcript and immutable artifact
hashes are recorded separately in the `clio-agent` acceptance bundle.
