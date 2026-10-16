# Paste long text as a source

Pasting 4,000 or more characters into the message composer creates a uniquely named
`Pasted text YYYY-MM-DD <id>.txt` attachment. The original text, including whitespace,
line endings and Unicode, becomes the file content. The message draft stays in place.
Shorter pastes remain ordinary message text; clipboard files and images use their existing
attachment flow.

Open **Settings → General → Paste as source after** to change the character threshold.
Set it to **0** to keep every text paste inline. This preference is saved on the device
and updates other open tabs. Text stays inline where attachments are unavailable or
when it would exceed the composer's 250 MB attachment limit.

The attachment appears immediately in the composer. Click it to preview the text, even
while its upload is pending or failed. CLIO uses the normal resource upload pipeline to
save it under **Sources**, create its workspace input copy, hash it and attach a resource
reference to the sent message. Sending reuses that upload. A failed upload or send keeps
the original file for retry. Removing an unsent attachment discards its pending upload;
an accepted message retains its source.

## Verification

`composer-paste.test.tsx` covers the threshold boundary, disabled conversion, disabled
attachments, unique file names, preview, exact content, failed sending, retry and removal.
Preference and General settings tests cover persistence and the off value.

`web/tests/review/paste-source.spec.ts` exercises the production composer, session mutation
hook, Sources browser and resource viewer against a real private CLIO server. It checks
stored bytes and hash, the materialized workspace copy, one queued source reference,
send failure/retry without duplicate uploads, unsent-source removal, preference persistence,
and a failed background upload followed by successful send. The session is paused, so this
qualification does not invoke a model.

Run the browser cases with an owned server on port 8199, CORS allowing
`http://127.0.0.1:5198`, and Vite on port 5198. Set `CLIO_REVIEW_EVIDENCE` to an owned evidence
directory containing `paste-live/connection.json` with the server's `endpoint`, then run:

```powershell
pnpm --filter @clio/workspace exec playwright test -c tests/review/paste-source-playwright.config.ts
```
