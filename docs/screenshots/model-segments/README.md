# Transcript provider and model segments

October 6, 2026. These captures show the actual `ClioConversation` renderer and shared AI Elements Checkpoint through a labeled browser fixture. The messages are simulated; the fixture makes no provider calls. The user's CLIO service on ports 5196/8141 was untouched.

- `model-segments-desktop.png`: the initial recorded model, a change within Codex and a change to Claude Code, with separators before the prompts belonging to each segment.
- `model-segments-same-model.png`: an additional Claude Code prompt remains in the existing segment without a fourth separator.
- `model-segments-phone.png`: the same behavior at 390px, with no horizontal overflow in the transcript or checkpoints.

The public message schema carries only the provider/model identity recorded in `effective_model`, shared by history, message-created and message-accepted projections. Current session settings are never substituted for historical evidence. Leading unknown records have no inferred attribution; an unknown prompt after a known segment ends that attribution with **Model not recorded**. Assistant rows stay within the accepted prompt's segment, and transport resume envelopes do not start segments.

Eight backend projection cases and six frontend cases passed individually and sequentially. They cover missing/malformed identity, private metadata exclusion, history/event parity, initial identity, provider and model changes, switching back, duplicate suppression, unknown records, transport envelopes, streaming/reload stability, exact placement, decoding and row memoization. Backend cases ran through the available managed Python 3.12 environment; CI covers the repository's target interpreters. Scoped Ruff, Pyright, backend size checks, frontend lint/formatting, all six shared frontend guards, TypeScript and online/offline builds passed. Existing offline `import.meta` warnings remain. No full local suite ran.

Browser interaction added a same-model turn and retained three markers. Reload reconstructed the three fixture segments. Original captures, DOM measurements and check logs are archived with verified SHA-256 hashes at `D:/Libraries/Videos/clio_recordings/2026-10-06-model-segments`. Published images are byte-identical copies of the visually reviewed originals.

Fresh provider-driven acceptance remains unverified: the isolated review service's clio-core process failed during Windows runtime startup. This fixture review and projection testing do not establish fresh inference or native Desktop acceptance.
