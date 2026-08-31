# CLIO Composer, Steering, Queue, and Attachment Research Brief

**Status:** PRE-RESEARCH — owner semantics recorded, implementation not authorized by this document  
**Date:** 2026-08-30  
**Related work:** `docs/design/a2ui-v091-compatibility-campaign.md` and
`docs/design/frontend-component-reuse.md`

## Purpose

This brief prepares a deep-research investigation into four connected parts of
the CLIO messaging experience:

- the compact control row at the bottom of the composer;
- provider and model discovery, selection, and configuration;
- ordinary messages, deferred messages, and live steering while an agent is
  already working; and
- file upload, preview, storage, document understanding, and delivery to an
  agent or model.

The research must produce an architecture suitable for CLIO rather than copy a
single provider's chat application. GACT is intended to support multiple
products and branded scientific domains. The resulting contracts must preserve
backend truth, causal ordering, model capability gates, authorization, and
recoverable state while allowing each product to choose its terminology and
visual composition.

This is not an implementation priority list. It records what has already been
decided, what the current repositories actually support, and what still
requires evidence before implementation.

## Owner-established interaction semantics

### Composer controls

The model, reasoning effort, execution mode, and confirmation policy belong in
one compact control area at the bottom of the composer. They should not be
repeated in a static top bar or expanded into verbose prose.

The intended component direction is a sourced button-group composition, such
as [ReUI Button Group](https://reui.io/components/button-group), with one compact
control per concept. Icons should carry familiar actions where they remain
understandable, supplemented by tooltips and accessible labels rather than
always-visible explanatory text.

The model control should communicate provider and model compactly. A breadcrumb
composition may work when names are normalized, for example `Codex / Luna`, but
labels such as `OpenAI Codex: GPT-5.5 (via Codex)` are not acceptable. The
research must determine where provider/model display names originate, how live
catalog discovery and staleness work, and why current catalogs omit supported
models while retaining retired models.

### Provider and model selection

Providers and models should not be flattened into one long list. The desired
interaction is a searchable provider-to-model browser with adjacent disclosure
rather than replacing the current column. ReUI's
[Cascader](https://reui.io/docs/components/radix/cascader), especially the
`c-cascader-7` composition, is a candidate if model-name search can traverse
all provider branches.

The selector must also offer a path to provider configuration when the provider
supports it. Examples include an Ollama host/port, vLLM deployment and
parallelism information, credentials, discovery freshness, and provider health.
These controls should not turn the model picker into a settings application;
the research must establish the boundary between selection, quick diagnostics,
and the full provider settings surface.

### Deferred messages and live steering are distinct

The proposed user contract distinguishes two actions while an agent is active:

- **Enter** adds the message to a visible, editable deferred-message list.
  Deferred messages appear immediately above the composer as compact single
  lines. They can be edited, removed, reordered, or sent now. Reordering occurs
  through a visible drag affordance and has a keyboard-accessible equivalent.
- **Ctrl/Cmd+Enter** sends the message as a live steer. CLIO accepts it now and
  consumes it at the next safe agent boundary, or promotes it once if the
  current turn ends first.

The live-steer presentation is intentionally simple:

1. Render the human's actual message in the transcript with a dashed border.
2. When CLIO consumes it, the same message becomes an ordinary human message in
   causal order.

There is no `Steering — waiting for a safe boundary` sentence, no `Delivered`
state, no changing semantic icon, and no second transcript object. The human
just sent the message; the border is sufficient temporary feedback.

The research must decide whether the editable deferred list is authoritative
server state, resumable client state, or a hybrid. It must not confuse that list
with CLIO's existing live-steer inbox.

### Attachments

The composer needs both a visible add-file action and drag-and-drop support.
Selected files appear above the text field using the sourced
[AI Elements Attachments](https://elements.ai-sdk.dev/components/attachments)
composition rather than new handmade cards.

At minimum, supported images, Markdown, source code, and plain text must be
inspectable before submission. A click may open a temporary preview; a durable
canvas tab is appropriate when the user chooses to retain the file. The exact
click and Shift-click contract remains a research/design decision and must be
consistent with CLIO's existing artifact, file, and child-agent canvas
semantics.

The attachment card is not the document-processing architecture. It is a view
of a CLIO-owned resource and its processing state.

## Verified current CLIO behavior

### Frontend components already present

The repository already contains sourced AI Elements implementations for prompt
input and attachments:

- `web/src/components/ai-elements/prompt-input.tsx`
- `web/src/components/ai-elements/attachments.tsx`
- `web/src/components/ai-elements/message.tsx`

`PromptInput` collects files and provides them to its submission callback, but
`web/src/components/clio/composer.tsx` currently destructures only `text`.
Therefore the UI can select files, yet the CLIO composer discards them before
the repository request.

`packages/core/src/v3/repository.ts::sendMessage` sends text plus optional
provider/model/effort/queue metadata. It has no resource or attachment field.

AI Elements also publishes a
[Queue](https://elements.ai-sdk.dev/components/queue) composition. It may be a
useful visual and accessibility foundation for the editable deferred list, but
it does not determine CLIO's persistence, ordering, steering, or recovery
contract. The live-steer placeholder should remain an ordinary AI Elements
human `Message` with temporary dashed styling, not a separate queue-status
widget.

### Existing live-steer semantics

CLIO already has a real live-steer path in
`clio-agent/src/clio_agent/gact/routes/messages.py` and
`clio-agent/src/clio_agent/gact/loop_inbox.py`:

- a second message posted while a turn is active is accepted rather than
  rejected as a competing turn;
- the route pre-mints a stable message ID, timestamp, and message parts;
- the running loop consumes the steer at a safe tool boundary;
- if the turn finishes first, the idle path promotes remaining input into one
  later turn; and
- the message is persisted and published when it is consumed, not when the
  POST request is accepted.

That persist-at-consumption behavior directly supports the owner-established
UI transition. The client can display one optimistic dashed user message keyed
by the pre-minted ID, then reconcile it with the authoritative
`message.created` event carrying the same ID.

The existing steer path preserves message parts, including image parts. It is
not merely a text queue.

### Current upload and modality boundary

`GET /v1/capabilities` currently reports:

- `attachments_upload = false`; and
- `multimodal_image_parts = true`.

The message route accepts image parts only when the selected active model is
vision-capable and produces a typed failure otherwise. CLIO therefore has
model-gated image input but no general session attachment upload/resource
lifecycle.

The missing capability is not solved by serializing browser blobs or base64
data into every message. CLIO needs stable resource ownership, upload status,
processing status, authorization, retention, and replay semantics.

## Existing document infrastructure worth reusing

The IOWarp `clio-web-search` service already provides most of a durable document
conversion substrate:

- multipart document upload;
- content-addressed original storage using a SHA-256 digest;
- a conversion cache keyed by content plus pipeline version;
- durable queued/running/completed/failed/cancelled jobs;
- progress events, cancellation, retry, limits, and cleanup;
- Docling conversion for PDF, Office, HTML, Markdown, text, XML, and images;
- Markdown as a derived representation; and
- the complete structured `DoclingDocument` export, including document
  hierarchy, tables, figures, layout/provenance, metadata, references, and
  citation contexts when available.

The relevant implementation is in:

- `clio-web-search/src/clio_web_search/documents.py`; and
- `clio-web-search/src/clio_web_search/docling_worker.py`.

The current Web MCP integration in
`clio-kit/clio-kit-mcp-servers/web/src/web_mcp/fetch.py` removes the full
`structure` from the inline result and returns only Markdown plus a structural
summary. That may be appropriate for one bounded web-fetch response, but it is
not an acceptable default for CLIO-owned uploaded documents because it discards
the structure needed for precise inspection, tables, figures, reading order,
and provenance.

Docling's own guidance reinforces this distinction:

- [DoclingDocument](https://docling-project.github.io/docling/concepts/docling_document/)
  is the unified structured document representation.
- [Chunking](https://docling-project.github.io/docling/concepts/chunking/)
  distinguishes flattening to Markdown from structure-aware native chunking.
- [Serialization](https://docling-project.github.io/docling/concepts/serialization/)
  preserves document- and table-specific structure.

## Why one universal model-delivery rule is incorrect

CLIO should own the resource independently of any model provider. Sending the
resource to a model is a later, task-specific execution decision.

Current provider behavior differs materially:

- OpenAI accepts image and file inputs, including file IDs, URLs, and inline
  file data, with provider-specific storage and retention behavior.
- Claude uses different blocks for PDFs/text, images, and datasets or other
  files. Its documentation recommends different handling for unsupported
  Office formats and code-execution datasets.
- Gemini performs visual document understanding for PDFs but states that other
  document MIME types are treated as text and lose charts, layout, and visual
  formatting.

Authoritative references:

- [OpenAI file inputs](https://platform.openai.com/docs/quickstart/make-your-first-api-request)
- [OpenAI Files API](https://platform.openai.com/docs/api-reference/files)
- [Claude Files API](https://platform.claude.com/docs/en/build-with-claude/files)
- [Claude PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- [Gemini document understanding](https://ai.google.dev/gemini-api/docs/document-processing)

Consequently, neither “send every binary directly” nor “convert every document
to PDF” is a valid CLIO architecture. Provider-native delivery and PDF
rendering may both be useful adapters, but neither becomes the stored source of
truth.

## Architecture hypothesis to test, not silently adopt

The evidence currently suggests a three-layer model:

1. **CLIO resource custody.** Upload and preserve the original once with a
   stable resource ID, checksum, filename, media type, size, workspace/session
   ownership, authorization, retention policy, and immutable revision.
2. **Typed derived representations.** Reuse the durable Docling service for
   structured documents while preserving its full document model. Generate
   Markdown, searchable chunks, page/layout views, tables, figures, thumbnails,
   or PDF derivatives only when useful. Images and source files retain their
   natural representations.
3. **Task- and provider-specific delivery.** Give the agent a resource handle
   and inspection/search/read tools. A provider adapter may additionally send
   a native image, PDF, text document, or sandbox-mounted dataset when the
   selected model supports it and the task benefits from it.

This hypothesis must be compared against established agent products, provider
SDKs, MCP resources, security practices, and scientific/document workflows.
The deep research may replace it if stronger evidence supports another design.

## Questions the deep research must answer

### Message ownership and ordering

- How do leading agent products distinguish an editable “send later” queue from
  a live steer/interruption?
- Which queue state must survive browser refresh, desktop restart, backend
  restart, and connection switching?
- Who owns reorder, edit, delete, send-now, cancellation, idempotency, and
  conflict resolution?
- How should multiple steers coalesce without losing stable message identity?
- What is the correct keyboard contract across idle, running, waiting-user,
  cancelled, and offline states?

### Upload and resource lifecycle

- What should `POST /v1/sessions/{session_id}/attachments` create: an upload,
  immutable resource, message attachment, processing job, or combination?
- Can one uploaded resource be referenced by multiple messages, sessions, or
  workspaces without copying bytes or leaking access?
- When may the user send a message whose attachments are still uploading or
  processing?
- How should cancellation, retry, deduplication, quotas, malware scanning,
  content-type validation, retention, deletion, provenance, and export work?
- Which states and degradations belong in GACT capability negotiation and SSE?

### Document understanding

- For PDF, DOCX, PPTX, XLSX, HTML, Markdown, source, CSV, images, archives, and
  scientific formats, what is the canonical stored object and which derivatives
  are necessary?
- How should CLIO expose Docling structure without flooding the model context?
- Should the agent receive document tools for section, table, figure, page,
  search, citation, and provenance access?
- When is structure-aware chunking better than Markdown, provider-native file
  input, code execution, or a rendered PDF?
- How should `clio-web-search` document jobs be reused without making URL/DOI
  search the conceptual owner of local attachments?

### Model capability and delivery

- How can CLIO discover and represent text, vision, PDF, audio, sandbox/file,
  and code-execution capability per provider/model without stale hardcoding?
- When should a resource be sent natively, mounted into a sandbox, retrieved by
  a tool, or summarized/chunked first?
- How should CLIO reject, adapt, or ask the user when the selected model cannot
  consume the requested media?
- What data leaves CLIO custody for each adapter, what retention applies, and
  how is that disclosed without crowding the ordinary UI?

### Preview and canvas behavior

- Which attachment types can be previewed safely before upload completion?
- When should a click use a transient preview versus replacing/opening a durable
  canvas tab?
- How do keyboard, touch, drag-and-drop, focus, responsive layout, and reduced
  motion retain equivalent functionality?
- How can sourced AI Elements, ReUI, and shadcn components be composed without
  recreating their behavior by hand?

## Required research output

The research deliverable should contain:

- a current-system map grounded in the named CLIO repositories;
- a comparison of at least three mature agent/chat products and the official
  OpenAI, Anthropic, and Gemini file-input contracts;
- a queue/steer state machine and resource/attachment state machine;
- a provider capability and delivery matrix by file category;
- a recommended CLIO/GACT API and event model, including ownership,
  idempotency, reconnection, failure, and security semantics;
- a component composition showing exactly where AI Elements, ReUI, and shadcn
  are reused and what remains CLIO-owned;
- alternatives considered, including provider-native-only, PDF-normalization,
  text-flattening, sandbox-mounting, and structured-document-resource models;
- a migration plan from the current text/image message path and discarded file
  payload;
- live browser interaction prototypes or references for the critical composer,
  queue, preview, and provider-picker behaviors; and
- explicit unresolved product decisions rather than assumptions disguised as
  recommendations.

Research must use primary sources for provider and protocol claims. It must
clearly separate protocol requirements, provider limitations, current CLIO
behavior, and product recommendations.

## Acceptance principles for the later implementation

- A live steer is one human message transitioning from dashed pending styling
  to the normal transcript message at authoritative consumption.
- Deferred messages remain editable and reorderable until sent and do not
  masquerade as transcript history.
- Upload selection does not lose files between Prompt Input and the repository.
- Original resources remain available and attributable; derived formats never
  silently replace them.
- Model incapability produces an actionable choice or typed explanation, not a
  hidden fallback.
- Document processing preserves structure and provenance while keeping model
  context bounded.
- Previews and attachment actions work with mouse, keyboard, and touch.
- No required action is hover-only and no state is communicated by a dot or
  color alone.
- Professional components are used directly or through thin semantic adapters;
  CLIO does not hand-build imitations.
- Real browser interaction and high-rate/dense-data performance are reviewed;
  passing unit tests alone is not acceptance.

## Deep-research prompt

Conduct a deep, primary-source-backed investigation for CLIO's composer,
deferred-message queue, live steering, provider/model selection, and attachment
architecture using this brief as the product contract. Ground the current
implementation in `gact-tui-node-revamp`, `clio-agent`, `clio-kit`, and
`clio-web-search`; compare mature agent products and the official OpenAI,
Anthropic, Gemini, Docling, MCP, and relevant web-platform contracts. Preserve
the decided steer behavior: the human's actual message appears with a dashed
border while pending and becomes the ordinary human transcript message when
CLIO consumes it, with no extra status label or replacement object. Distinguish
that from an editable, reorderable deferred-message list.

Determine how CLIO should own uploaded resources, preserve original bytes and
Docling structure, preview supported files, expose bounded document tools, and
select provider-native, sandbox, retrieval, or derived delivery per task and
model capability. Do not assume that all binaries should be sent directly,
that all documents should become PDFs, or that Markdown flattening is an
adequate canonical representation. Return state machines, API/event contracts,
a provider/file-type delivery matrix, security and retention boundaries,
reuse-first component recommendations, alternatives and tradeoffs, migration
steps, live interaction references, and explicit unresolved decisions.
