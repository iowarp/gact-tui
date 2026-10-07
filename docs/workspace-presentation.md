# Workspace presentation

The conversation and canvas share 40px headers. In Desktop, workspace navigation
and actions occupy the native title bar, leaving the conversation directly below
it. Browser routes keep their own header. Controls retain their route and sidebar
context when placed in the title bar, and fall back to the route header when no
native host is available.

Artifact viewers share one 36px toolbar. Preview, Versions, and Lineage remain
direct tabs. A document's format, revision, and complete content hash are in
Document information; reading, raw Markdown, reviews, and safety use the same
toolbar. Images keep zoom, fit, download, and fullscreen beside those tabs.
At pane widths below 480px, secondary controls use labelled menus. The breakpoint
follows the viewer width rather than the application window, so narrow split panes
remain usable on large displays. Document menus mark the current view.

Icon buttons have accessible names and hover/focus tooltips. Supporting text uses
12px type; activity headings and action rows use 13px; conversation titles use
14px. Output cards use readable format names and retain exact MIME types on hover.

Activity disclosure arrows sit beside their labels. Adjacent recorded Markdown
headings have visible separators in the summary. Expanding a step retains its
original thinking text, tool input, output, timing, status, and routed interactions.
Collapsed details occupy no empty vertical space. These are rendering changes;
provider records and tool semantics remain intact.

`workspace-presentation.spec.ts` checks header alignment, narrow-pane overflow,
keyboard-focus labels, zoom, image download, version history, lineage, and toolbar
accessibility. Office preview checks exercise Word, PowerPoint, and Excel. The
desktop-dark and mobile-light visual baselines cover the shared layout.
