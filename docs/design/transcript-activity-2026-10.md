# Compact transcript activity

The October 6 review replaces the public Chain/Full activity selector with one compact transcript timeline. Observability remains the session evidence inventory and full canvas; it does not determine the message's presentation. This supersedes the per-message selector decision in `frontend-decisions.md` and its General settings choice.

The timeline uses the same canonical message blocks and correlated tool identities as before. Public progress updates are complete paragraphs between activity groups. Provider-released reasoning summaries sit inside their activity group as complete, quietly labelled Reasoning passages. They have no separate brain icon, truncated preview or second disclosure. The internal full projection uses the same reasoning passage, so a source heading appears only in its original text. Reasoning without tools is shown in place using that same passage. This distinguishes the recorded channels without rewriting, shortening or relabelling their contents.

The activity disclosure describes the recorded actions. Each tool has one compact row; selecting it expands the readable result, and its separate info button opens complete arguments and technical details. Traced attention badges stay on compact rows. Tasks, child-agent events, workflow ownership, MCP Apps, pending questions and plan decisions retain their recorded positions and interactions. Only the reader opens or closes activity, including during streaming and after answer arrival. Pointer and keyboard expansion disengage automatic bottom-following so the clicked heading stays in place.

The previous iteration heading repeated a preview of the thinking/next-thought that appeared again in the iteration's details. That extra heading is removed. Recorded reasoning and public updates retain their separate source identities, including when a provider repeats text across channels. Distinct text and repeated events in different iterations remain distinct, and stored transcript parts are never rewritten. Attention links retain the internal full projection to reach exact original text and tool fields; it has no public mode switch.

Assistant content uses the available message-column width from its first reasoning block through its final answer. Reasoning and public prose wrap in narrow columns; the activity heading stays compact. Outcome counts belong in the completion footer, which wraps its facts and actions without overlapping them.

## Captured thinking

Inspection of the paired clio-agent checkout confirms separate channels:

- Codex `providers/codex/direct_engine.py` requests `reasoning.summary=auto` and streams through DSPy's Responses engine. These are provider-released reasoning summaries.
- Claude Code `providers/claude_code_engine.py` emits `ThinkingDelta` separately from `TextDelta`. `claude_code_stream_events.py` records omitted/redacted thinking separately through audit and semantic events; empty thinking text is not fabricated.
- `runtime/lm_activity.py::note_lm_provider_thinking_delta` publishes the provider thinking field independently of visible contract fields.
- `gact/protocol/v3/message.py` maps persisted `thinking` parts into `reasoning` blocks, retaining provider source and collapsed-state metadata. Answer text and `next_thought` retain their own channels.

The isolated saved Codex/Luna report session contains one persisted thinking part, one final text part and eleven tool-call identities, with eleven corresponding result parts. That is direct saved-data evidence for Codex separation. Claude and other providers were inspected in source; this review does not claim a new live run for each provider.

## End-of-message facts

Assistant actions and timestamp follow the message. A settled message shows its reported outcome, input/output token usage, cost when supplied, and unique tool-call count. These facts use the message's usage, never cumulative session usage. Reported zero cost remains zero; absent usage/cost stay absent. The footer does not label an interrupted turn Done.

Elapsed turn time and generation throughput are not currently exposed as explicit per-message facts on this contract, so the footer does not invent those measurements from tool timings or browser wall time.

## Validation

Focused cases cover invocation deduplication and failures, repeated previews, complete detail dialogs, missing/zero footer metrics, activity folding, actionable plan decisions, and removal of the General mode setting. A controlled SSE browser fixture checks streaming thinking, first-answer folding, causal row order, failure visibility, full results, and footer overflow at 1280px and 390px. Actual report-session browser captures are reviewed separately from fixture evidence.
