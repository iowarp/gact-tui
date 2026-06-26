# Branding GACT — authoring guide + embedding-agent integration

This is the single source of truth for **how to brand gact-tui** and **how an
embedding agent (e.g. clio-agent, clio-coder) wires its own brand in**.

gact-tui is **brand-neutral by default**. Every product-facing string, mark,
accent, and backend descriptor is read from **one document** —
`<brandingRoot>/<profile>/brand.json` — selected at **compile time** by a
**config file** (never an environment variable). The embedding agent owns its
brand file in **its own repo** and points gact-tui's build at it.

---

## 1. How brand selection works

Two tracked files in `apps/`:

```jsonc
// apps/brand.config.json  (tracked — the neutral default)
{ "profile": "gact", "brandingRoot": "branding" }
```

- `profile` — the directory name under `brandingRoot` whose `brand.json` is used.
- `brandingRoot` — the directory holding the profiles. Resolved **relative to the
  config file's directory** (so `"branding"` → `apps/branding`), or an **absolute
  path** pointing anywhere — including **outside this repo**.

To select a different brand **without editing the tracked file**, drop a
gitignored override that always wins:

```jsonc
// apps/brand.config.local.json  (gitignored — the embedding agent's override)
{ "profile": "clio", "brandingRoot": "/abs/path/to/clio-agent/branding" }
```

The shared resolver `apps/branding/brand-config.mjs` (`resolveBrandConfig()`) is
imported by **both** the web Vite config and the desktop generator, so web and
desktop always resolve the *same* document. There is **no `GACT_BRAND_SRC`** and
no other env var in this path.

---

## 2. Filling in `brand.json`

`<brandingRoot>/<profile>/brand.json`. Only `name` is required; every other field
has a neutral default. A `logo.svg` may sit next to it.

### Presentation fields

| Field            | Type                     | Default                       | Meaning |
| ---------------- | ------------------------ | ----------------------------- | ------- |
| `name`           | string (**required**)    | —                             | Product name → window title, "Welcome to <name>", "<name> Desktop". |
| `wordmark`       | string                   | `name`                        | Text wordmark in chrome lockups. |
| `tagline`        | string                   | `""`                          | One-line product description (connect-screen lede). |
| `markGlyph`      | string (1 char)          | first char of `name`          | Fallback mark when no `logoSvg`. |
| `logoSvg`        | string (path)            | `null`                        | SVG path **relative to the profile dir**; inlined at build. Overrides `markGlyph`. |
| `accent`         | string (CSS color)       | design-system default         | Primary accent; also sets `--color-accent` if `themeTokens` doesn't. |
| `themeTokens`    | record<string,string>    | `{}`                          | Extra CSS custom-property overrides merged into the theme at boot. |
| `starterPrompts` | array<{eyebrow,label}>   | 4 neutral GACT prompts        | First-run chat prompt cards tuned to the product/domain. |
| `backendRepository` | {label,url,detail} \| null | `null`                   | Repo surfaced in About / Help-docs link / install diagnostics. `detail` defaults to `"backend"`. |

### The `backend` block (managed vs connect)

Optional. **Omit it → connect-mode**: the shell attaches to an already-running
backend and never offers an installer (this is what the neutral `gact` profile
does). Supply it to describe a **managed** backend the desktop shell can
spawn/install. Every sub-field has a default (shown), so include only what differs.

| Field            | Type   | Default        | Meaning |
| ---------------- | ------ | -------------- | ------- |
| `mode`           | string | `"connect"`    | `"managed"` (may spawn/install a sidecar) or `"connect"` (attach-only). |
| `sidecarName`    | string | `""`           | externalBin stem; the desktop launcher is `<sidecarName>-<triple>{.exe}`. |
| `attachPort`     | number | `17800`        | Local port to attach-first. |
| `attachPortEnv`  | string | `"GACT_PORT"`  | Env var that overrides `attachPort` at runtime. |
| `attachUrlEnv`   | string | `"GACT_URL"`   | Env var that overrides the full attach URL at runtime. |
| `repoLabel`      | string \| null | `null` | Label used in the connect-mode "start your backend" message. |
| `install`        | object \| null | `null` | Installer coordinates (managed only). `null` ⇒ no installer even if `mode:"managed"`. |
| `install.ref`        | string | `"main"`   | Default git ref the installer checks out. |
| `install.refEnv`     | string | `"GACT_REF"`   | Env var overriding the ref. |
| `install.forceEnv`   | string | `"GACT_FORCE"` | Env var that forces a reinstall (rebuild a broken runtime). |
| `install.windowsUrl` | string | `""`       | Windows installer URL (piped to `iex`). |
| `install.unixUrl`    | string | `""`       | macOS/Linux installer URL (piped to `bash`). |
| `install.repoLabel`  | string | `"the configured backend"` | Human label for the install source. |

### Complete managed example (clio-agent)

```jsonc
{
  "name": "CLIO",
  "wordmark": "CLIO",
  "tagline": "Scientific agentic coding",
  "markGlyph": "C",
  "logoSvg": "logo.svg",
  "accent": "#7c5cff",
  "themeTokens": { "--color-accent": "#7c5cff" },
  "starterPrompts": [
    { "eyebrow": "EarthScope", "label": "..." },
    { "eyebrow": "NDP",        "label": "..." }
  ],
  "backendRepository": {
    "label": "iowarp/clio-agent",
    "url": "https://github.com/iowarp/clio-agent",
    "detail": "agent backend"
  },
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
}
```

> Want shipping installs to pin a **stable** ref instead of `develop`? Change
> `install.ref` here — it's a one-line brand edit, no code change.

---

## 3. How the document reaches each surface

| Surface | Reads `brand.json`? | Mechanism |
| ------- | ------------------- | --------- |
| **Web** | Yes (compile-time) | `apps/web/vite-plugin-brand.ts` resolves the profile into the `@brand` virtual module. `pnpm --filter @clio/web build` reads `apps/brand.config(.local).json`. Drives title, favicon, copy, starter prompts, splash install one-liner (from `backend.install`), Help-docs link (from `backendRepository`). |
| **Desktop (webview)** | Yes (same as web) | The desktop bundles the web build, so the webview is branded by `@brand`. |
| **Desktop (Rust supervisor)** | Yes (compile-time) | `apps/desktop/scripts/gen-brand-backend.mjs` reads the **same** config + brand file and writes `apps/desktop/src-tauri/gen/brand-backend.json`; Rust embeds it via `include_str!`. Runs automatically in `tauri:dev`/`tauri:build`. Drives attach port/env, sidecar name, installer command, managed-vs-connect boot. |
| **TUI (Go)** | **No** | The Go binary is a separate module and can't import the JS document. It is branded by **env/config the agent's launcher sets** — see §4. |

---

## 4. For the embedding agent (clio dev team) — what to implement

You own your brand in **your repo**. To wire it into a gact-tui build:

**Web + desktop.** Ship `branding/<yourprofile>/brand.json` (all blocks above) in
your repo. In the gact-tui checkout your build consumes, drop an
`apps/brand.config.local.json` with `{ "profile": "<yourprofile>", "brandingRoot":
"<abs-or-relative path to your repo's branding dir>" }`. That's the whole hookup:
`pnpm --filter @clio/web build` and the desktop `tauri:build` (which runs
`gen-brand-backend.mjs`) both pick it up automatically — no env vars, no positional
brand argument, no code edits in gact-tui. Verify with `node
apps/desktop/scripts/gen-brand-backend.mjs` (it prints the resolved profile + mode)
and check that `apps/desktop/src-tauri/gen/brand-backend.json` matches your `backend`
block.

**TUI.** The Go TUI does not read `brand.json`; your launcher passes the brand to
it via environment. Set `GACT_BRAND_NAME=<name>` for the splash/window wordmark,
and for a managed local backend set the adapter env so `gact agent deploy <kind>`
resolves *your* backend: `GACT_ADAPTER_BIN` (the executable, e.g. `clio-agent-gact`),
`GACT_ADAPTER_SRC` (optional checkout to find a venv console script),
`GACT_ADAPTER_PYTHON_MODULE` (for a Python adapter launched via its venv python,
e.g. `clio_agent.gact.app`), and `GACT_ADAPTER_CWD=1` only if your adapter accepts a
`--cwd` flag. The normal path is still `GACT_BACKEND=http://host:port` to connect to
an already-running backend. Mirror your `brand.json` `backend.attachPortEnv` /
`attachUrlEnv` choices here so the TUI and desktop agree on the runtime override
vars (`CLIO_PORT` / `CLIO_GACT_URL` for clio).

**Desktop native identity** (not in `brand.json` — it's static Tauri config). The
window/installer identity lives in `apps/desktop/src-tauri/tauri.conf.json`:
`productName`, `identifier`, window `title`, `bundle.icon`, `bundle.externalBin`
(set to `["binaries/<sidecarName>"]` for a managed brand), and
`plugins.updater.endpoints` + `pubkey`. Override these for your product via a
brand-specific Tauri config passed with `tauri build --config <your.tauri.conf.json>`
(the tracked default is neutral "GACT Desktop", connect-mode, `externalBin: []`).

---

## 5. What changed since PR #725 (`feat/brand-source-of-truth`)

That draft made `branding/clio/brand.json` the source of truth **compiled via a
`GACT_BRAND_SRC` env var**. The landed mechanism on `develop` differs in three ways
— please rework the PR accordingly:

1. **Selection is a config file, not an env var.** There is no `GACT_BRAND_SRC`.
   Use `apps/brand.config.local.json` (`{ profile, brandingRoot }`) — `brandingRoot`
   may be an absolute path into your repo, achieving the same "brand lives in
   clio-agent" goal.
2. **The committed default is neutral, not clio.** `gen/brand-backend.json` ships as
   connect-mode `gact`; clio values come from *your* `brand.json` at build time. The
   generator takes `--config` / `--out`, **not** a positional `clio` argument.
3. **The blocks you were adding are already the contract.** `backend`,
   `backendRepository`, and `starterPrompts` are all first-class resolved fields
   (§2). Put your real values there; everything downstream reads them.

Net: keep `brand.json` as your single brand document, but hook it in through
`brand.config.local.json` + `brandingRoot` (web/desktop) and `GACT_*` launcher env
(TUI), instead of `GACT_BRAND_SRC`.
