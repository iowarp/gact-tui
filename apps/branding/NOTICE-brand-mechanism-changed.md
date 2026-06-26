# Heads-up: the gact-tui brand mechanism changed — drop PR #725 and re-do it

**To the clio-agent / clio-coder team.** We reworked branding across gact-tui
(TUI + web + desktop). Your draft **PR #725 (`feat/brand-source-of-truth`),
which compiles the brand via a `GACT_BRAND_SRC` env var, will not work** — that
env var no longer exists, the desktop generator no longer takes a positional
brand argument, and the committed defaults are now neutral (not clio). **Please
drop what you have on that branch and rebuild it against the new mechanism.**

**The new model in three lines:**
- Brand selection is a **config file**, not an env var: drop an
  `apps/brand.config.local.json` (`{ "profile": "clio", "brandingRoot": "/abs/path/to/clio-agent/branding" }`).
  `brandingRoot` may point at your own repo, so your brand lives in clio-agent — the
  goal PR #725 was reaching for.
- Your single brand document is still `branding/clio/brand.json`. The blocks you were
  adding — **`backend`, `backendRepository`, `starterPrompts`** — are already
  first-class fields the build reads. Put your real values there.
- The Go TUI doesn't read `brand.json`; pass it `GACT_BRAND_NAME` + `GACT_ADAPTER_*`
  from your launcher.

**What to do:** read **[`INTEGRATION.md`](./INTEGRATION.md)** (the full authoring +
wiring guide) and implement against it. Everything you need — the complete
`brand.json` schema, a managed-backend example, and the exact web/desktop/TUI
hookup — is there. No backwards-compatibility shim is needed or wanted; just
adopt the new mechanism.
