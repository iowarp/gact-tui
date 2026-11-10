# Composer pipeline interaction specification

This specification is the visual and behavioral contract for the composer, queued messages,
resources, model selection, and transcript navigation campaign. Backend truth remains
authoritative; UI state may be optimistic only where the corresponding identity and revision are
preserved for reconciliation.

## Reuse provenance

| Surface            | Reused foundation                                                 | CLIO-owned adaptation                                      |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Composer           | AI Elements `PromptInput`, CLIO `IconButton`/`MenuRow` primitives | Delivery intent, behavior capture, route binding           |
| Attachments        | AI Elements `Attachments`                                         | Workspace custody, upload progress, resource identity      |
| Queued messages    | CLIO one-line queue rows, dnd-kit reorder                         | Persistence, revisions, promotion, conflict recovery       |
| Model picker       | AI Elements `ModelSelector`, ReUI Cascader two-column composition | Live catalog normalization and provider configuration link |
| Transcript outline | TanStack Virtual, shadcn `HoverCard`                              | Marked-message filter and virtualized transcript jumps     |

No CLIO component recreates the interaction machinery supplied by those foundations. Domain
adapters translate GACT state into their public props and events.

## Composer states

| State     | Composer behavior                                                | Queue/resources                                            | Motion and focus                                                                           |
| --------- | ---------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Idle      | Enter and Ctrl/Cmd+Enter start a turn                            | Attachments upload on submit                               | Welcome composer docks without losing draft or focus                                       |
| Running   | Enter creates a queued message; Ctrl/Cmd+Enter steers            | Queue is visible immediately above the composer            | Pending steer is the human message with a dashed border; consumption removes only the dash |
| Waiting   | Submit answers the active interaction before normal turn actions | Existing queued messages remain editable                   | Focus returns to the unanswered control                                                    |
| Offline   | Submit creates a durable queued message                          | Uploads that have not completed remain local and retryable | No false sent or delivered state                                                           |
| Uploading | Composer remains stable and reports byte progress                | Files can be removed before acceptance                     | No indefinite spatial animation; progress is determinate when total bytes are known        |

The docked composer targets 720–896 px: the editor on top, then one toolbar row that never wraps
(attach, reference, confirmation policy and reasoning icons on the left; model text, mode word and a
28 px Send/Queue/Stop on the right; container queries shrink the model and mode first). Queued rows
are one line above it, with the drag handle on the left and send-now/edit/delete actions on the
right. Attachment tiles use a compact preview with name, media type, size,
progress, and removal.

The queued-message viewport carries its own height bound rather than inheriting one from the
conversation area: it shows four compact rows and scrolls beyond that, at every viewport size and
every queue length. The bound lives in `web/src/lib/runtime-limits.ts` as
`COMPOSER_QUEUE_VIEWPORT_MAX_HEIGHT_PX`, derived from `COMPOSER_QUEUE_ROW_HEIGHT_PX`. The pending
responses stack above it scrolls the same way and is expanded on arrival, because the agent is
blocked until one of its controls is used; its collapse toggle only ever gives room back.

## Model picker

The dialog keeps search and selection separate from configuration. Providers occupy the left
column and models the right. Search matches provider display name, provider ID, model display name,
and model ID globally. Provider health, freshness, and endpoint are supplemental; the provider
settings action remains directly reachable. At narrow widths the two columns become a staged
provider-then-model flow with an explicit Back action rather than horizontally compressed text.

## Transcript outline

The v24 conversation spec has no landmark strip beside the transcript, so the transcript's index
is one outline button at its top left. It opens a virtualized list with one 28 px line per message
and a Marked filter. TanStack Virtual owns the normalized index, the active line, and every jump:
the transcript's own virtualizer reports which message is in view, so the active line can be one
the transcript has not mounted, and no scroll-spy observer takes part. Hover and keyboard focus
open a shadcn HoverCard preview, showing a bounded projection of the message rather than its full
text. Reduced motion uses immediate jumps.

## Required visible walkthroughs

Review desktop, tablet, and mobile widths in light, dark, and reduced-motion modes. Exercise pointer,
keyboard, and touch for model selection, provider configuration, file add/drop/remove, queued-message
edit/reorder/promote/delete, live steering, disconnect/reconnect, outline previews, and normalized
jumps. Capture idle, running, waiting, offline, upload-processing, narrow, and touch screenshots
before treating broad automated gates as acceptance evidence.
