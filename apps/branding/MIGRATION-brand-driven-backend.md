# clio-agent team: brand-driven desktop backend — what changed & what to do

**TL;DR:** GACT-desktop's backend wiring is no longer hardcoded for clio-agent. The
sidecar name, install command, install ref, and attach port — all previously baked
into Rust/TS *for clio-agent* — now come from a **`backend` block in the brand
profile** (`apps/branding/clio/brand.json`). clio-agent's behavior is **byte-preserved**
(we copied your exact hardcoded values into the `clio` profile), so **nothing breaks**.
But the contract moved, so please **review, verify, and adopt the new ownership model.**

Landing: the brand-driven backend + ACP↔GACT bridge are on **`develop`**
(`0b0370ad` + `667f983f`) and **`main`** (`b677dde1` + `633a5488`). Track `develop`.

---

## Why this happened
A second product (clio-coder) now also drives GACT-desktop. The desktop was wired
exclusively for clio-agent — e.g. `supervisor.rs` hardcoded `CLIO_INSTALL_REF="develop"`,
the `iowarp/clio-agent` install URLs, the `clio-agent-<triple>` sidecar name, and the
`:17800` attach port; `SplashScreen.tsx` hardcoded the install one-liner. To support both
products (and keep them coexisting), those values were moved **out of code and into the
brand profile**, so each product declares its own backend. clio-agent keeps the `clio`
brand; clio-coder ships its own.

## The new contract (`brand.json` → `backend`)
Each brand profile gains an optional `backend` block. The **`clio` profile now carries
clio-agent's exact previous values**:

```json
"backend": {
  "mode": "managed",
  "sidecarName": "clio-agent",
  "attachPort": 17800,
  "attachPortEnv": "CLIO_PORT",
  "attachUrlEnv": "CLIO_GACT_URL",
  "install": {
    "ref": "develop",
    "refEnv": "CLIO_REF",
    "forceEnv": "CLIO_FORCE",
    "windowsUrl": "https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1",
    "unixUrl":    "https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh",
    "repoLabel": "github.com/iowarp/clio-agent"
  }
}
```

These map 1:1 to the old hardcoded constants. **If any value here does not match your real
deployment, fix it HERE — not in Rust/TS.**

## How it reaches the code
- **Rust supervisor** reads a generated, committed file
  `apps/desktop/src-tauri/gen/brand-backend.json` (embedded at compile time via
  `include_str!`). The committed default = the clio-agent values above.
- A generator `apps/desktop/scripts/gen-brand-backend.mjs <brand>` writes that file from
  `apps/branding/<brand>/brand.json`'s `backend` block.
- The base `tauri.conf.json` `beforeBuildCommand` now runs
  `node scripts/gen-brand-backend.mjs clio && pnpm --filter @clio/web build:clio`, so a
  normal clio build regenerates the config for the `clio` brand before `cargo` compiles.
- The web splash (`SplashScreen.tsx`) and `vite-plugin-brand.ts` read `brand.backend.*`
  for the install command / ref / repo label instead of literals.

## Files changed (17) — review if you fork/patch any
```
apps/branding/clio/brand.json                 (+15  — the backend block)
apps/desktop/src-tauri/src/supervisor.rs       (+360 — reads brand_backend(); connect-mode)
apps/desktop/src-tauri/src/lib.rs              (wiring)
apps/desktop/src-tauri/gen/brand-backend.json  (NEW committed default = clio-agent)
apps/desktop/scripts/gen-brand-backend.mjs     (NEW generator)
apps/desktop/src-tauri/tauri.conf.json         (beforeBuildCommand runs the generator)
apps/desktop/src-tauri/tauri.gact.conf.json
apps/desktop/scripts/fetch-sidecar.{sh,ps1}    (sidecar name from brand)
apps/desktop/package.json
apps/web/vite-plugin-brand.ts                  (resolves brand.backend)
apps/web/src/brand.d.ts                        (backend type)
apps/web/src/routes/SplashScreen.tsx           (install cmd/ref/repo from brand)
apps/web/src/tauri.ts
apps/web/tests/unit/{Brand.test.ts,SplashInstall.test.tsx}
adapters/acp/cmd/gact-acp-adapter/main.go      (unrelated: bridge --token)
```

## What YOU need to do
1. **Bump** clio-agent's gact-tui pin to the revision carrying these commits (once on `develop`).
2. **Verify the `clio` backend block matches reality** — especially:
   - `attachPort` is still **17800** and `sidecarName` is **clio-agent**.
   - `install.windowsUrl/unixUrl/repoLabel` point at the right clio-agent install scripts.
   - **`install.ref`** — it is currently **`develop`** (preserving the old `CLIO_REF=develop`
     hardcode). If shipping installs should pin a *stable* ref, **change it here** (this was
     impossible before without editing Rust). This directly answers "why does it install
     from develop?" — now it's a one-line brand edit.
3. **Confirm the release pipeline still builds.** `tauri:build:bundled` / `build:clio` now
   depend on `gen-brand-backend.mjs` + the committed `gen/brand-backend.json`. Both are in
   the commit. If you run `cargo build` directly (bypassing `beforeBuildCommand`), ensure
   `gen/brand-backend.json` holds the clio values first (`node apps/desktop/scripts/gen-brand-backend.mjs clio`).
4. **Reconcile any local patches** to the 17 files above (most likely `supervisor.rs`,
   `SplashScreen.tsx`, `tauri.conf.json`).
5. **Adopt the ownership model going forward:** change sidecar/install/ref/port via the
   `clio` brand profile, never by re-hardcoding in Rust/TS. (Optional: move the `clio`
   brand source into the clio-agent repo and inject it at build time — the pattern
   clio-coder now uses — so each product fully owns its brand. Not required.)

## Verification checklist (clio-agent should pass all)
- [ ] `cargo build` + `cargo test` green for the `clio` brand (committed default).
- [ ] `node scripts/gen-brand-backend.mjs clio` reproduces the clio-agent `gen/brand-backend.json`.
- [ ] Desktop (clio brand) boots → **attaches to a clio-agent on :17800** (managed/attach unchanged).
- [ ] First-run with no backend → install card shows the **clio-agent** installer + the
      configured `ref` (no clio-coder/other strings).
- [ ] `GET /v1/capabilities` backend identity is still clio-agent's (clio-agent's own server reports it).

## Coexistence note
clio-coder's brand pins `attachPort: 8123`; clio-agent's pins `17800`. Each branded desktop
only ever attaches to its own port, so **clio-agent and clio-coder run side by side** with no
collision. Do not "stop the other backend" to make one work — that's not needed.
