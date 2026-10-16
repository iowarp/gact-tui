# Credential storage

Where the workspace keeps secrets, per platform. Nothing listed here is ever
written to `localStorage` or `sessionStorage`; tests in
`web/src/providers/connection-provider.test.tsx` check that a remembered
connection's token stays out of browser storage.

| Secret                                | Desktop app (Windows, macOS, Linux)                                                                                                                                                                                                                                                                                                                          | Browser                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Bearer token for a remembered service | Operating-system credential store: Windows Credential Manager, macOS Keychain, or the Secret Service on Linux. Service `ai.iowarp.gact.desktop.connection`, one entry per endpoint (`desktop/src-tauri/src/credentials.rs`). Long tokens are split across entries to fit Windows' size limit (`credential_chunks.rs`). Forgetting the connection deletes it. | Kept in memory for the page's lifetime only; not saved, so it is gone after a reload. |
| Token for the managed local service   | Issued by the desktop supervisor for one launch and kept in memory. Its address is never remembered.                                                                                                                                                                                                                                                         | Not applicable.                                                                       |
| Model-provider API keys               | Operating-system credential store, service `ai.iowarp.gact.desktop.provider`, keyed by provider and normalized endpoint.                                                                                                                                                                                                                                     | Not stored by the workspace.                                                          |
| SSH private keys pasted into the app  | A file per identity under the app's local data directory, `ssh-identities/`, with mode `0600` on macOS and Linux. On Windows the file inherits the per-user application data directory's permissions. Not in the credential store.                                                                                                                           | Not applicable.                                                                       |

What is kept in `localStorage`: the saved connection list (endpoint, label,
location, infrastructure reference), the managed service's display name, and
interface preferences. No secrets.

## Legacy storage

The Solid frontend used from May to August 2026 kept its backend registry,
bearer tokens included, in `localStorage` under `clio.backends.v1`. The current
app removes that key on every start (`web/src/lib/legacy-credential-storage.ts`),
so an installed app upgraded from one of those releases does not keep the old
tokens on disk.
