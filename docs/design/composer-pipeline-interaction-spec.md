# Composer pipeline interaction specification

This specification is the visual and behavioral contract for the composer, queued messages,
resources, model selection, and transcript navigation campaign. Backend truth remains
authoritative; UI state may be optimistic only where the corresponding identity and revision are
preserved for reconciliation.

## Reuse provenance

| Surface | Reused foundation | CLIO-owned adaptation |
| --- | --- | --- |
| Composer | AI Elements `PromptInput`, ReUI/shadcn `ButtonGroup` | Delivery intent, behavior capture, route binding |
| Attachments | AI Elements `Attachments` | Workspace custody, upload progress, resource identity |
| Queued messages | AI Elements `Queue` | Persistence, revisions, promotion, conflict recovery |
| Model picker | AI Elements `ModelSelector`, ReUI Cascader two-column composition | Live catalog normalization and provider configuration link |
| Transcript minimap | ReUI `Scrollspy`, TanStack Virtual, shadcn `HoverCard` | Semantic landmark types and virtualized transcript jumps |

No CLIO component recreates the interaction machinery supplied by those foundations. Domain
adapters translate GACT state into their public props and events.

## Composer states

| State | Composer behavior | Queue/resources | Motion and focus |
| --- | --- | --- | --- |
| Idle | Enter and Ctrl/Cmd+Enter start a turn | Attachments upload on submit | Welcome composer docks without losing draft or focus |
| Running | Enter creates a queued message; Ctrl/Cmd+Enter steers | Queue is visible immediately above the composer | Pending steer is the human message with a dashed border; consumption removes only the dash |
| Waiting | Submit answers the active interaction before normal turn actions | Existing queued messages remain editable | Focus returns to the unanswered control |
| Offline | Submit creates a durable queued message | Uploads that have not completed remain local and retryable | No false sent or delivered state |
| Uploading | Composer remains stable and reports byte progress | Files can be removed before acceptance | No indefinite spatial animation; progress is determinate when total bytes are known |

The docked composer targets 720–896 px, a 44 px minimum interactive row, and a single compact
control group. Queued rows are one line above it, with edit/delete/promote actions on the left and
the drag handle on the right. Attachment tiles use a compact preview with name, media type, size,
progress, and removal.

## Model picker

The dialog keeps search and selection separate from configuration. Providers occupy the left
column and models the right. Search matches provider display name, provider ID, model display name,
and model ID globally. Provider health, freshness, and endpoint are supplemental; the provider
settings action remains directly reachable. At narrow widths the two columns become a staged
provider-then-model flow with an explicit Back action rather than horizontally compressed text.

## Transcript minimap

The minimap occupies a narrow conversation gutter and uses 8–12 px strokes for user, assistant,
activity, approval/question, error, A2UI, and artifact landmarks. ReUI Scrollspy observes mounted
sections with URL history disabled. TanStack Virtual owns the normalized index and every jump.
Hover and keyboard focus open the same shadcn HoverCard preview. A narrow conversation replaces the
rail with one outline button. Reduced motion uses immediate jumps and opacity-only feedback.

## Required visible walkthroughs

Review desktop, tablet, and mobile widths in light, dark, and reduced-motion modes. Exercise pointer,
keyboard, and touch for model selection, provider configuration, file add/drop/remove, queued-message
edit/reorder/promote/delete, live steering, disconnect/reconnect, minimap previews, and normalized
jumps. Capture idle, running, waiting, offline, upload-processing, narrow, and touch screenshots
before treating broad automated gates as acceptance evidence.
