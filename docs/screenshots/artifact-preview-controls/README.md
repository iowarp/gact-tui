# Artifact preview controls review

The running OPAL workspace was reviewed in the browser on 2026-10-06. The
three-page Word report and eleven-slide PowerPoint deck are real saved artifacts
with PDF renditions. Their contents were not modified during this UI review.

- `powerpoint-open-menu.png`: maximized canvas, one upper toolbar, visible and
  usable Open in menu, continuous slides, and page count at the bottom.
- `word-document-info.png`: full-height report and its information popover above
  the maximized canvas.
- `refresh-pending-fixture.png`: production UI with a held test-fixture response.
  The focused browser case checks the rotating icon's computed transform across
  frames, the busy accessible state, duplicate-click prevention, and completion.
  This is browser fixture evidence, not a live backend latency measurement.

The narrow pane, scrolling, zoom, Copy path label, and unconfigured editor choices
were also reviewed in the real browser. All originals and SHA-256 records are
archived in `D:/Libraries/Videos/clio_recordings/2026-10-06-artifact-preview-refresh`.

Individual local checks ran with one worker: refresh completion/failure, installed
Word menu selection, editor-health recheck, launch-failure cleanup, confined copy
creation, continuous PDF toolbar behavior, and long-document page windowing. The
native routing test rejects mismatched file types without launching Office. The
focused Word and PowerPoint browser cases check saved previews, rendering density,
available height, continuous navigation and refresh feedback. The final PowerPoint
case also clicks the PDF menu item while maximized to detect overlay occlusion.

Native Desktop visual acceptance is still pending. Automatic approval review
previously rejected launching the isolated Desktop with `blocked by policy`; the
launch has not been retried. Builds and browser evidence do not establish native
visual acceptance or actual Microsoft Office launch acceptance.
