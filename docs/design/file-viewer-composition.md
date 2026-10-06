# File viewer composition

Images, PDFs, Office outputs, uploaded resources and workspace files use the
same canvas shell. File custody determines how bytes are read; file format
determines how content is rendered. Do not create another filename header,
toolbar or original-file download implementation inside a format renderer.

## Shared responsibilities

`FileViewerShell` owns the full-height layout, capability tabs, one toolbar,
fullscreen root and renderer action registry. `FileViewerActions` owns original
download, file information, copy to another workspace and resource removal.
The canvas tab supplies the filename; details belong in File information.

`FileViewerSource` describes one of three read contracts:

| Source             | Original download         | Copy to another workspace                       |
| ------------------ | ------------------------- | ----------------------------------------------- |
| Generated artifact | Registered artifact bytes | Upload original bytes through resumable custody |
| Uploaded resource  | Custody content           | Agent-side resource copy                        |
| Workspace file     | Workspace file bytes      | Upload original bytes through resumable custody |

Copy creates an independent file on the same connected agent. It does not
synchronize subsequent edits or transfer artifact version history. A failed
upload retry reuses its operation ID; a new completed copy gets a new ID.
Removal is a resource capability, retains its confirmation dialog and never
appears for a generated artifact merely because both use the same shell.

## Renderer contributions

- Render the content in the shell's active panel. Preserve existing bounded
  reads, conversion failures and unavailable states.
- Use `ViewerToolbarContent` for format controls and `ViewerZoomControls` for
  zoom. Narrow panes keep the percentage in the toolbar and expose zoom actions
  in the shared File actions menu.
- Register additional menu capabilities with `useFileViewerActions`, using a
  memoized action array. The shell renders those actions inside its menu; do
  not portal Radix menu items out of a different menu context.
- Supply format-specific metadata through `FileViewerInformation`. It joins
  the shell's information dialog, with a standalone fallback for other hosts.
- Keep dialogs, menus, tooltips and selects in `OverlayContainer` during native
  browser fullscreen so they remain visible and interactive.

Image previews use explicit zoom and ordinary scrolling. The image is not
draggable, and the main attachment carousel does not drag its content. Arrow,
thumbnail and keyboard navigation remain available. Document PDFs use continuous
scrolling, with page count below the content and zoom in the common toolbar.

## Review

Check the actual shared shell at narrow, intermediate and maximized widths,
including an uploaded image and generated Word/PowerPoint files. Inspect the
rendered view and its open menus, not only DOM dimensions. Original-download
checks compare bytes; copy tests exercise custody resume and failure retry.
Test dialog placement in fullscreen and retain keyboard navigation, unavailable
states and removal confirmation. Run individual important local cases with
one worker; leave broad suites to CI.
