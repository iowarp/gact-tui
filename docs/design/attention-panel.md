# Shared attention panel

Permissions and questions share one panel above the composer. Its header has
previous/next controls and a position/remaining count. Only the selected request
is visible or keyboard-reachable. Answered, cancelled and expired requests leave
the list when the server confirms their state; a failed response remains editable
with its own error. Other requests remain usable while a response is in flight.

Request drafts live in a conversation-owned memory store, including when the
panel is collapsed or a responsive layout remounts the composer. Draft updates
subscribe only the affected controls instead of rerendering the whole transcript.
Transcript and open-question links select and expand the
corresponding page before focusing its controls. Anchored plan reviews and draft
picks retain their dedicated transcript views. Linked visual questions retain
their Go to action and do not move their visual surface into this panel.

The shared boundary composes AI Elements Queue/Collapsible/ScrollArea. The
permission page deliberately replaces its nested Confirmation/Alert with a flat
semantic section and the existing shadcn Button and Select. One Allow action uses
the explicitly selected duration. Only server-offered scopes appear; the initial
scope is Once when offered, and folder grants retain their real workspace scope.
The exact operation, paths, computer, command and broader persistent read/write
grant remain visible. Technical protocol details are a disclosure. This replaces
four competing full-width permission buttons without introducing a custom menu.

Native question bundles are one durable backend question. Each bundle has its own
question pages and drafts, with one Submit all answers action on the final page.
Changing pages never sends an answer. The backend validates every required answer
before settling the bundle or delivering one resume/queued message. Ordinary MCP
forms retain their existing field-map submission contract.

`attention-pager.spec.ts` reviews the production workspace at 1280px and 390px,
in light and dark themes: permission duration selection, one visible request,
bundle navigation, Other text, drafts retained across requests, one complete
submission, shrinking counts, and retained permission scope. Screenshots are
recorded with each case. Focused component tests additionally cover collapse,
response failure/retry, in-flight sibling navigation and linked-page reveal.
