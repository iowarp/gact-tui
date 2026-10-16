# Hide and remove SSH hosts

**Manage SSH hosts** offers **Hide/Show** and **Remove** side by side for every saved
or imported host.

- **Hide** removes the host from pickers but keeps it in the manager, where **Show** restores it.
- **Remove** opens a confirmation naming the host and its address. **Keep host** cancels.
  The dialog stays open with an error and a retry button if removal fails.
- Removing a host clears unfinished connection routes that use it as a destination or jump hop.
  Existing deployments and remote files are unchanged.

For **managed** hosts, Remove deletes the profile from the app's OpenSSH include and
cleans up its app-owned private key when no remaining managed profile uses it. Personal
key files outside the app's identity directory are preserved.

For **imported** hosts, Remove forgets the alias in this app. The original OpenSSH
definition and SSH keys are preserved. A persisted removal preference keeps the alias
out of both the manager and pickers after reload or restart. Hide and removal preferences
are separate. Adding a managed host under an available removed alias restores that alias;
an alias still defined in external SSH configuration keeps the existing collision handling.

Native profile writes are serialized so concurrent preference and profile changes do not
overwrite each other's files. A failed Hide rolls back only its own row and cannot restore
another host that has been removed.

## Qualification

Native filesystem tests cover imported-config and key preservation, persisted removal,
managed-block deletion, shared keys, alias collisions, re-adding a removed alias and errors.
UI tests cover the confirmation, cancellation, pending state, failure/retry, cache reconciliation
and selected-route cleanup.

For a browser review using real native storage without touching personal SSH files:

```powershell
$env:CARGO_TARGET_DIR = '<owned build directory>'
cargo build --manifest-path desktop/src-tauri/Cargo.toml --example ssh-hosts-acceptance --locked
& '<owned build directory>/debug/examples/ssh-hosts-acceptance.exe' '<new owned fixture directory>' 8200
```

The acceptance adapter calls the same Rust storage functions as the Tauri commands. It
replaces only the IPC transport with a localhost HTTP adapter; profile operations use real
files confined to the fixture. The external OpenSSH config fixture is compared byte for byte.
Use `--resume` to reopen that fixture and verify persistence in a fresh native process.
This review does not connect to SSH hosts or exercise the production Tauri IPC transport.

With Vite on port 5198, run:

```powershell
$env:CLIO_REVIEW_EVIDENCE = '<owned evidence directory>'
$env:CLIO_SSH_REVIEW_FIXTURE = '<owned fixture directory>'
pnpm --filter @clio/workspace exec playwright test -c tests/review/ssh-hosts-playwright.config.ts
```
