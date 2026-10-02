# A2UI experience reference

This document records the product direction from the owner's Browser reviews of the A2UI campaign. It is a design target for the gallery, the live CLIO workspace, component contracts, and agent guidance. A component is complete only when its real rendered behavior meets this target in the Browser.

## The intended experience

A user asks CLIO an ordinary question. The agent finds or computes the data, chooses a useful visual surface, and explains its judgment briefly. The surface is attractive enough to read immediately and powerful enough to explore without asking the agent to rebuild it for every click. The agent supplies content and data; the renderer supplies consistent interaction. The gallery should demonstrate the same components and behavior that a live agent session uses.

The interface should feel calm and deliberate. Data, the drafted message, the forecast, or the current guide step has visual priority. Titles, units, legends, source, freshness, and status follow a clear reading order. Actions occupy predictable, compact positions and remain discoverable by hover, focus, and accessible names. Avoid repeated card frames, duplicate headings, redundant explanatory prose, crowded toolbars, dark-on-dark or light-on-light marks, awkward text wrapping, and controls that obscure content.

## Renderer-owned behavior

These are ordinary capabilities of a suitable rendered component, not options the agent has to remember to request:

- Charts, maps, tables, and bound lists share selection by dataset and `__row`. A click, Shift-click, or 2D box selects data without silently zooming. Selection from another view is visibly distinct. Empty-map clicks clear map selection, and markers have pointer affordance.
- **Reference this** has an understandable payload: selected rows present in the current filtered view and active filters, or that filtered view when no selected row remains visible. A selection held by a sibling view must not make a table reference claim to include a row its filter removed. Show the selected/view distinction near the action and in the composer. A gallery example should preview the actual reference contents.
- Zoom is deliberate. Offer **Zoom to selection** and a visible **Reset zoom** while zoomed. Let people pan or move within the zoomed view. Ordinary page scrolling must not accidentally zoom a chart, map, diagram, or 3D scene.
- Filtering, sorting, pagination, selected-only mode, exports, full screen, and return from full screen must change the data or view exactly as labelled. Native table filters are present by default. Clicking and Shift-clicking rows must not select page text.
- Region capture is a persistent selection mode. Label boxes S1, S2, and so on; allow comments and edits; leave the labelled boxes in place after Done; keep the mode active until explicitly turned off or the message is sent. The sent image must contain its labels and outlines, with matching comments and structured context. This applies to charts, maps, 3D, raster, SVG, and DOM surfaces when capture is possible.

Use icon-only toolbar actions where labels would crowd the content. Give each action an accurate accessible name and complete tooltip. Hover is for discovery; critical state, such as active selection or zoom, must still be legible without hover. A menu must not hide essential actions several levels deep merely to make a toolbar look empty.

## Component character

- **Message drafts:** one editable version at a time, with labelled alternatives. To, Cc, Subject, and body edits must flow into Copy, Open in Mail, and Use this version. Opening mail offers recognizable Gmail, Outlook work or school, Outlook.com, and default-app destinations. Brand marks and labels should align cleanly and stay on one line. CLIO prepares a draft; it does not send it.

  The present **Open in Mail** links transfer recipients, subject, and body, but do not transfer a CLIO artifact as an attachment. An authorized Gmail or Microsoft Graph integration could create a draft with artifact bytes attached; this is a separate account-connected capability and is not implemented by the current links. Do not add an attachment picker that implies the current menu transfers a file.
- **Weather:** current, hourly, and daily information use supplied data, local times, units, source, and freshness. Hourly and daily strips can contain more items than fit; horizontal scrolling should feel natural by wheel or drag, with a subtle scroll treatment and no bulky native bar or repeated arrow buttons. Conditions and icons must be readable in dark and light themes.
- **Steps and recipes:** steps are checkable; timers and progress survive scrolling and full screen. Measured ingredients are separate from action steps, and quantities scale with samples, batch size, or servings. Keep warnings close to the step they affect.
- **Charts and maps:** legends and category colours are readable; marker colours agree with legend colours. A chart's encoding must match its data shape, so heatmaps, trajectories, spectra, and box plots display meaningful marks rather than empty plots or `NaN`. Map location lists page to the rendered map height, show selected locations first, and use one compact count/page line without duplicate headings.
- **Tables:** headers and cells retain their identity and readability at narrow widths. Filters, sorting, pagination, selection, and exports work on the displayed dataset. IDs, timestamps, integer values, missing values, and stale rows are displayed honestly.
- **Controls and actions:** inputs look interactive. Buttons, action cards, and approvals give a visible result or a precise failure. A control's bound value should actually update the local view it governs.

## Gallery as a truthful tutorial

The gallery is a public-facing, standalone showcase of **all** supported components, not a page for the newest five widgets. It should also show several meaningful combinations, not only the map/chart/table trio. Its examples use real renderer components and local demonstration data so the page does not depend on a running agent or private API. The examples must support the interactions they advertise: selection, native filters, reference preview, zoom, export, full screen, editing, scrolling, timers, and state changes. Component details and optional skill links may explain a capability, but the examples should largely speak for themselves.

Changing shared renderers should appear in both the gallery and live UI; changing gallery samples alone does not teach the agent. The development gallery can hot reload. The built gallery at `:5177` needs a rebuild and browser refresh to reflect source changes.

## Agent enactment

Agent-facing schemas, catalog descriptions, tool results, and the interactive-analysis skill should describe when each component helps, what input shape it accepts, and what the user will see. Do not hardcode one layout or require the user to say “interactive.” Natural requests for weather, message alternatives, a timed recipe, a spatial comparison, or a statistical view should lead to an appropriate surface. The agent should use tools to obtain data, perform a targeted schema lookup when needed, recover from actionable validation errors, and describe the rendered result accurately. It should not narrate an unavailable visualization as if it worked or repeat the entire visible widget in prose.

## Browser acceptance

For each changed behavior, keep a natural prompt, screenshot, interaction, expected result, actual result, and new issue. Inspect dark and light themes, wide and narrow viewports, short and long content, one item and large datasets, loading and failure states, full screen and return, and combined surfaces. Interact with the existing Codex agent in a separate CLIO workspace and use many independent sessions with varied ordinary wording. A static fixture can isolate a failure; it cannot prove the agent chose and built the right surface. Focused automated checks support data contracts and server failures. The rendered Browser interaction is the primary evidence for visual and ergonomic acceptance.

**Completion means the user can perform the intended task comfortably and understand what happened.** A successful build, a passing unit check, or the mere presence of a control is insufficient when the Browser still shows poor hierarchy, invisible marks, ambiguous actions, misleading state, or a broken interaction.
