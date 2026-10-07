# New session defaults review

October 6, 2026. These captures show the actual isolated CLIO review service on port 8152 through its development UI on port 5198. The user's service on ports 5196/8141 was untouched.

- `defaults-desktop.png`: five rows, with explanations beside their labels and one save action. The model pill shows the effective model and whether new sessions follow Models settings.
- `defaults-picker-desktop.png`: the shared transcript provider/model picker, including search, capability filters, provider actions and hidden-provider management.
- `defaults-mobile.png`: the same settings at 390px, with centred controls and reachable save action.

Actual browser interaction opened the picker, selected the currently inherited Codex/Luna model as an explicit draft, observed the picker closing and used **Use Models default** to restore inheritance. The shared picker was also opened and closed at 390px. No model or session-default writes were made during browser review. Save/reset payloads and hidden-provider behavior were verified in component tests.

Ten important session-defaults cases and the existing settings keyboard-choice regression passed individually, sequentially, with one worker. They cover saving the work mode and confirmations, shared search and deferred model saves, inherited-model pinning, hidden providers, returning to inheritance, incompatible and unknown reasoning levels, loading failures, exact reasoning choices, default resets and models without reasoning. Frontend lint, scoped formatting, shared frontend guards, TypeScript and online/offline builds passed. Existing offline `import.meta` warnings remain.

Original captures, test/build logs and verified SHA-256 manifests are archived at `D:/Libraries/Videos/clio_recordings/2026-10-06-session-defaults`. Published images are byte-identical copies of the visually reviewed originals.
