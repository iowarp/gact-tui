# Transcript preparation and composer evidence

Preparation feedback now appears at the end of the transcript and disappears when the current assistant response produces its first content. The composer keeps its position and no longer has a separate status header.

The evidence button beside the model and behavior pills cycles **None → Bottom → Top → Both → None**. Right-click reverses that order without opening the browser context menu. Left/Right arrow keys support the same cycle. The icon depicts the selected sections: Top contains activity and outputs; Bottom contains attachments and references. The panel keeps the same bounds while switching sections. Escape, the close button and outside interaction hide it; Open full details opens the workspace canvas.

## Actual browser evidence

- `evidence-both-dark.jpg`: the final UI in an isolated real service session with a generated Word report and PDF. Browser interaction verified both directions of the cycle. Long output filenames truncate within their rows, leaving space for the Output badge and menu.
- `transcript-preparation-light.png`: a real Codex/Luna response to “Reply with one sentence describing what you can help me review in this workspace.” Preparation was visible in the transcript at 2026-10-07 01:40:24.560 UTC and absent after the first response content at 01:40:27.758 UTC. This capture preceded the four-state icon follow-up; the preparation behavior is unchanged.

The sessions used the isolated 8152 service through the 5198 preview. These captures do not establish native Desktop acceptance or a deployment to the user's running 5196 UI.

## Validation

Individual unit cases passed for the current-turn boundary, first-token removal, tool-only responses, observed setup phases, reduced motion, used-artifact discovery, live projections and the dismissible panel/cycle. They ran sequentially with one worker.

`pnpm --filter @clio/workspace exec playwright test e2e/composer-evidence.spec.ts --workers=1` passed. The controlled test fixture checks transcript preparation, forward/reverse cycling, keyboard navigation, dismissal and focus return, retained drafts, unchanged composer/panel bounds and overflow at 1280px and 390px. Fixture evidence is separate from the real service captures above.

Frontend lint, TypeScript, online/offline builds, scoped formatting and the frontend size, component reuse and icon guards passed. No full local test suite ran. Existing PDF `import.meta` warnings remain in the offline build.

Original captures, review metadata, local validation logs and SHA-256 hashes are retained in `D:/Libraries/Videos/clio_recordings/2026-10-06-composer-evidence`. Initial overflowing rows and captures made from detached browser element handles were rejected and are not published here.
