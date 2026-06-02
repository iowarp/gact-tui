# Installing CLIO Desktop

> **The v0.9.0 installers are unsigned.** They are reproducibly built
> by the workflow in `.github/workflows/apps.yml` on every
> `clio-desktop-v*` tag, but they don't yet carry an Authenticode /
> Apple notarization / Linux GPG signature. The OS treats them as
> untrusted by default, so the install flow includes a one-time trust
> prompt per platform. Signing arrives in v1.0.

## Two installer variants: lite vs bundled

Every release ships **two** desktop installer flavors per platform.
They are the same application (same `productName`, same identifier,
same UI) — they differ only in how the `clio-agent` runtime is
provided. Pick one:

| | **Lite** (default) | **Bundled** |
|---|---|---|
| Filename | `CLIO-Desktop_<ver>_…` | `…-bundled.<ext>` (e.g. `CLIO-Desktop_<ver>_x64-setup-bundled.exe`) |
| Installer size | Small (~10s of MB) | Large (~330 MB of embedded Python runtime + clio-agent) |
| Network at install | Not required | Not required |
| First-launch behavior | Resolves `clio-agent-gact` from a system install (or your `$PATH`); surfaces an install command if missing | Boots immediately from the **embedded** runtime — no system clio-agent needed |
| Works fully offline | Only once clio-agent is installed separately | **Yes, out of the box** |
| Best for | Developers / users who already run clio-agent, or want the smallest download | Air-gapped machines, demos, non-technical users who want one-click |

**How the launcher chooses.** The bundled installer ships a relocatable
Python environment (`clio-runtime/`) packed next to the app. On launch
the sidecar launcher resolves `clio-agent-gact` in this priority order:

0. **Bundled runtime** next to the launcher executable (bundled
   installer only — the lite installer simply doesn't ship one, so this
   step no-ops).
1. `$CLIO_AGENT_GACT_BIN` (explicit override).
2. `clio-agent-gact` on `$PATH`.
3. The per-OS conventional clio-agent install prefix.
4. `$CLIO_DEV_REPO/.venv/…` when that env var points at a local
   clio-agent checkout (developer workflow).

Because the bundled runtime is resolved relative to the launcher's own
location, the bundled app is install-location independent and needs no
system clio-agent at all. If you install the **lite** variant and have
no clio-agent yet, follow the per-OS "Prerequisite" note below.

Pick your OS:

- [Windows 10 / 11](#windows-10--11)
- [macOS 13 (Intel) and 14+ (Apple Silicon)](#macos-13-intel-and-14-apple-silicon)
- [Linux (Debian / Ubuntu / Fedora / generic)](#linux-debian--ubuntu--fedora--generic)
- [Pure-web (no install)](#pure-web-no-install)

---

## Windows 10 / 11

1. Download `CLIO-Desktop_<ver>_x64-setup.exe` (recommended) or `.msi`
   from the [Releases page](https://github.com/iowarp/gact-tui/releases).
2. Right-click → **Properties** → check **Unblock** at the bottom of
   the General tab → **OK**. (This is the one-time
   "downloaded-from-internet" mark; without it SmartScreen prompts
   every launch.)
3. Double-click the installer.
4. **Windows protected your PC** SmartScreen dialog appears →
   **More info** → **Run anyway**.
5. Step through the installer. Default install prefix is
   `%LOCALAPPDATA%\Programs\CLIO Desktop\`.
6. Launch from the Start menu. The sidecar boots, a chat shell appears.

**Prerequisite (lite variant only):** the launcher resolves
`clio-agent-gact` from the
[clio-agent](https://github.com/iowarp/clio-agent) develop install.
If it's missing on first launch, the Splash screen surfaces an
error card with the install command:

```powershell
$env:CLIO_REF = 'develop'
irm https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1 | iex
```

Re-launch CLIO Desktop after that completes. The **bundled** variant
(`…-bundled.exe` / `…-bundled.msi`) skips this entirely — it ships the
runtime and boots offline.

### Uninstall

Apps & features → CLIO Desktop → Uninstall. Tray icon is removed on
exit; the OS keychain entries under `ai.iowarp.clio.desktop.ssh` are
left behind by default — clear them via Credential Manager if you
also stored SSH passphrases.

---

## macOS 13 (Intel) and 14+ (Apple Silicon)

1. Download the `.dmg` for your arch:
   `CLIO-Desktop_<ver>_aarch64.dmg` for Apple Silicon
   (M1/M2/M3/M4) or `CLIO-Desktop_<ver>_x64.dmg` for Intel Macs.
2. Open the DMG; drag **CLIO Desktop** into **Applications**.
3. Apps gate-keeped by Apple notarization will fail when double-
   clicked. The first-launch workaround:
   - In Finder, navigate to **Applications**
   - **Right-click CLIO Desktop → Open**
   - The dialog now says "macOS cannot verify the developer of …" →
     click **Open**.
   - From this point onwards a regular double-click works.
4. Grant the keychain prompt if you intend to add an SSH-tunneled
   backend; the entries land under service
   `ai.iowarp.clio.desktop.ssh`.

### Uninstall

`rm -rf "/Applications/CLIO Desktop.app"` plus the OS keychain
cleanup (above).

---

## Linux (Debian / Ubuntu / Fedora / generic)

Pick the format that matches your distribution.

### `.deb` (Debian, Ubuntu)

```sh
sudo apt install ./clio-desktop_<ver>_amd64.deb
```

### `.rpm` (Fedora, RHEL, openSUSE)

```sh
sudo rpm -i clio-desktop-<ver>-1.x86_64.rpm
```

### `.AppImage` (anywhere)

```sh
chmod +x CLIO-Desktop_<ver>_amd64.AppImage
./CLIO-Desktop_<ver>_amd64.AppImage
```

### Runtime prerequisites

The Tauri 2 / WebKitGTK stack expects:

```sh
sudo apt install libwebkit2gtk-4.1-0 libsoup-3.0-0 libayatana-appindicator3-1 librsvg2-2 libdbus-1-3
# Fedora:
sudo dnf install webkit2gtk4.1 libsoup3 libappindicator-gtk3 librsvg2 dbus-libs
```

The SSH-tunnel feature shells out to `ssh` and stores passphrases via
the secret-service / KWallet bridge (the `keyring` crate's
`linux-native` backend). Install `gnome-keyring` or `kwalletmanager`
if your DE doesn't already ship one.

### Uninstall

`sudo apt remove clio-desktop` / `sudo rpm -e clio-desktop` / delete
the AppImage. As above, clear the secret-service / KWallet entries if
you stored SSH passphrases.

---

## Pure-web (no install)

If you already run `clio-agent-gact` locally and just want a browser
tab:

1. Download `clio-web-<ver>.zip` from the Releases page.
2. `unzip clio-web-<ver>.zip && cd clio-web-<ver>`.
3. Serve with any static file server, e.g.:
   ```sh
   python -m http.server 4173
   ```
4. Open <http://localhost:4173>. The app auto-probes
   <http://localhost:7777/v1/capabilities>; if that responds, you go
   straight to the chat shell. If not, the connect form lets you
   point at any GACT-conformant endpoint.

Pure-web mode does **not** have SSH-tunnel spawn, tray icon, OS
notifications, or the OS-keychain bearer store — those need the
Tauri shell.

---

## Verifying downloads

Each artifact bundle ships a `SHA256SUMS.<triple>.<variant>.txt` (one
per OS triple × {lite, bundled}) / `SHA256SUMS.web.txt`. Bundled
installers carry a `-bundled` suffix in their filename. To verify
before installing:

```sh
# Linux / macOS
shasum -a 256 -c SHA256SUMS.<triple>.txt
# Windows PowerShell
Get-FileHash CLIO-Desktop_<ver>_x64-setup.exe -Algorithm SHA256
# then compare against the file
```

The CI run that produced the artifacts is linked from the Release
notes — every build is reproducible from a `clio-desktop-v*` tag.
