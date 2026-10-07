# Compact transcript activity review

October 6, 2026. These screenshots show the actual saved Codex/Luna report session in the isolated review service on port 8152, rendered by the review UI on port 5198. This review reopens the saved session; it does not represent new inference or acceptance of every provider.

- `report-collapsed.png`: one activity disclosure, the generated artifacts and the message footer. The footer reports 203.2K input tokens, 2.9K output tokens and eleven calls. Cost was not supplied and stays absent.
- `report-expanded.png`: the same disclosure after opening. Its position stays fixed while rows extend below it.
- `report-expanded-scrolled.png`: the recorded reasoning and all eleven tool calls in their timeline. Two calls failed before the agent recovered; their outcomes remain visible.
- `report-phone.png`: the actual saved response and wrapping footer at 390px.

The saved message contains one provider thinking part, one answer text part, eleven call parts and eleven matching result parts. Thinking and answer remain separate. The generic provider-source field is `model`; the session's selected model is Codex/Luna. Its reasoning text is the provider-released summary “Creating chart artwork.” Claude Code's separate thinking stream was inspected in source; it was not rerun for this review.

Fourteen individual unit cases cover counting/outcomes, missing and zero metrics, repeated previews, attention badges, source navigation, folding, General settings, plan review, task semantics, archive details and questions, projection reuse, settled questions and interruption. The single-worker controlled SSE browser case covers thinking before answer, first-answer folding, retained snapshots, row order, failure/details, stable expansion and overflow at 1280px and 390px. Browser fixture evidence remains separate from these actual-session captures. Scoped lint/formatting, shared frontend guards, TypeScript and online/offline builds passed. Existing offline PDF `import.meta` warnings remain.

Originals, selected test/build logs, the bounded saved-message facts, and verified SHA-256 manifests are archived at `D:/Libraries/Videos/clio_recordings/2026-10-06-transcript-activity`. Published PNGs are byte-identical copies of the reviewed originals. See [the design decision](../../design/transcript-activity-2026-10.md).
