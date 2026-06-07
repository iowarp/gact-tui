# Reference study — Hermes Agent Desktop (NousResearch)

**Source:** `github.com/NousResearch/hermes-agent` → `apps/desktop` (MIT). Studied
2026-06-07 at HEAD of `main`.
**Stack:** Electron + React + Vite + Tailwind v4 + shadcn/ui + `@assistant-ui/react`
+ nanostores + react-query. ~77k LOC in `src/`.

**Why we looked:** it's a polished, shipping, open-source *agentic* desktop app —
a useful external yardstick for "what does good agentic UI/UX look like." This is a
notebook of transferable ideas, **not a copy mandate** and **not a backlog**. Where
a pattern is worth adopting it's called out under "→ For us"; where it's
over-engineered it's flagged too.

CLIO Desktop is Tauri+SolidJS, not Electron+React, so none of their code ports
directly. The value is in the *decisions*, not the components.

---

## 0. The thesis — why a GUI exists at all

**A technical user will use the TUI. The desktop/web app only earns its existence
by serving the person who would never open a terminal.** So the bar is not "port the
TUI to a window" — it's "do the things a terminal fundamentally cannot, for someone
who can't drop to a config file or read a stack trace." Every surface should be
judged by: *does this let a non-technical user do something they otherwise couldn't,
or couldn't without help?*

Hermes is a good yardstick precisely because it leans into the graphical medium
instead of being a prettier terminal. The places it pulls decisively ahead of any
TUI are:

| Capability | In a TUI | In hermes' GUI | Why the GUI wins for a non-technical user |
| --- | --- | --- | --- |
| **Configuration** | edit YAML / a cramped form | a real **settings overlay**: dropdowns, toggles, secret fields, deep-linkable sections, import/export/reset | No syntax to get wrong; discoverable; reversible; "what can I even change?" is answered by *looking* |
| **Provider / model setup** | paste keys into a file, restart | **OAuth "Sign in" buttons**, curated provider cards, model dropdowns with live validation | A non-technical user can connect a model in clicks, never seeing an API key |
| **Navigation** | one screen, modal stack, keybinds you must know | a persistent **left menu** of real destinations (New chat, Settings, Skills, Cron, Agents, Profiles…) | The whole product is *visible*; nothing is hidden behind a memorized shortcut |
| **Previews** | text only; can't render a web page or image | **side-by-side rendered** files, HTML, images, console | Seeing the artifact is the point; a terminal literally can't |
| **Attachments / files** | type a path | **drag-drop, clickable thumbnails, a file browser** | No need to know or type filesystem paths |
| **Errors / boot** | a traceback | **actionable cards** (Retry / Repair / Open logs / Sign in) | A non-technical user gets a button, not a Python stack trace |
| **Voice** | n/a | talk + hear back | Pure GUI affordance |
| **Discoverability** | `--help`, man pages | hover tooltips, menus, empty-state teaching, onboarding | The UI teaches itself |

Everything below is organized around making *those* good. Note the quality also
comes from **ruthless primitive consolidation + a token-driven flat visual
language** — but that's table stakes; the differentiation is the rows above.

## 0b. The one-paragraph takeaway

We already have most of the feature surface (chat, tools, diffs, settings, palette,
onboarding, voice). For the non-technical-user lens the gaps that matter most are
the **configuration menu** (§1b), the **left-side navigation** (§1c), and **rendered
previews** (§4) — the three things a TUI can't do and a novice most needs. Secondary
is obsessive polish on the composer (§2), the boot/connect lifecycle (§5), and tool
rendering (§3). The cleanup lesson is *subtractive*: one shadow, one search field,
one loader, one error state.

---

## 1. Design system — the part most worth internalizing

Their `apps/desktop/DESIGN.md` is the crown jewel. The governing rule:

> **one source per concern, tokens over literals, flat over boxed.**

Concretely:

- **Flat, not boxed.** No card-in-card, no divider borders inside a panel. Group
  with whitespace + a *single* hairline, never nested rounded boxes. Dividers
  between rows are a last resort, not a default.
- **Borderless + shadow for elevation.** Every overlay/dialog/toast floats on one
  shared shadow token (`--shadow-nous`) + one hairline (`--stroke-nous`) — never a
  hard border, never a per-overlay one-off shadow. "If elevation needs to change,
  change the token."
- **One primitive per concern.** One `Button` (variants own padding/radius/chrome
  — call sites pass `variant`/`size`, never `className` that re-specifies those),
  one `SearchField`, one `SegmentedControl`, one `Loader`, one `ErrorState`, one
  `LogView`. Migrate onto them; don't fork.
- **Tokens, not literals.** Everything references CSS vars (`--ui-*`,
  `--theme-*`, `--shadow-nous`). The token system is *layered*: a small set of
  `--theme-*` seeds (one brand color, a few mix percentages) derives the entire
  `--ui-*` palette via `color-mix`. Light/dark/accent all fall out of changing the
  seeds. Their `styles.css` is ~43kB but the component CSS is tiny because the
  variants own it.

→ **For us:** we already have `apps/design/` tokens and largely follow this, but we
have accumulated `className` overrides and a few bespoke surfaces. The highest-ROI
0.9 cleanup is an **audit pass that deletes one-off shadows/borders/padding in
favor of tokens + variants**, and writing our own short `apps/web/DESIGN.md` so the
rule is enforceable. The "before you add something" checklist at the bottom of
their DESIGN.md is worth stealing verbatim (adapted to our primitives).

---

## 1b. The configuration menu — "what a TUI can't do well" #1

This is the surface the user flagged first, and it's where the GUI most obviously
beats a terminal for a novice. Hermes' settings is **24 files** and treats config as
a first-class product, not an afterthought.

**Structure (worth copying wholesale):**

- **A full-screen overlay card** (`OverlayView`) with a **master/detail split**:
  `OverlaySidebar` (section nav) + `OverlayMain` (the panel). One reusable shell
  (`OverlaySplitLayout`) — settings, agents, cron, profiles all ride it, so they
  feel identical.
- **Deep-linkable, URL-param-driven sections.** The active section lives in a
  `?tab=` param (`useRouteEnumParam`), sub-views in their own params
  (`?pview=accounts`, `?kview=tools`). Every settings sub-page survives a refresh
  and can be linked to (the command palette / "fix this in settings" links jump
  straight to the right panel). This is huge for "click here to fix it" flows.
- **Nested sidebar nav** — Providers expands into *Accounts* vs *API keys* as
  indented sub-items. Sections: Model, Providers (accounts + keys), Gateway, MCP,
  Tools/Keys, Sessions, Appearance, several Config groups, About, Uninstall.
- **A tiny row vocabulary** (`settings/primitives.tsx`): `SectionHeading`,
  `ListRow` (label + description + right-aligned control), `NavLink`, `Pill`,
  `LoadingState`, `EmptyState`. Every settings row is one of these — flat,
  flush-left, no card-in-card. This is what makes 24 files feel like one screen.

**Controls that replace editing a file:**

- Provider/model are **`Select` dropdowns** with placeholders and live validation
  (changing the model can report `stale_aux` assignments to reconcile).
- Secrets via a dedicated **`credential-key-ui` / `env-credentials`** surface with a
  masked field + an actions menu — never "paste your key into config.yaml."
- **Import / Export / Reset** config: export downloads `hermes-config.json`, reset
  writes defaults behind a `confirm()`. A non-technical user can back up and restore
  their whole setup without touching the disk.
- Toggles/segmented-controls for booleans and small enum choices, never free text.

> The deepest idea here: **config is presented as *discoverable, reversible,
> validated UI*** — the three things a YAML file or a TUI form can't give a novice.
> They can't make a syntax error, they can see every knob that exists, and they can
> undo.

→ **For us:** we already have a multi-section Settings (Backends, Workspace, Models,
Agents, MCP, Memory, Appearance, About, + the read-only hooks/policies/blueprints
panels) and import/export. Measured against hermes, the worth-doing deltas for the
non-technical user are: **(a) deep-linkable settings sections** (`?tab=`/sub-params)
so "fix it in settings" and palette entries land exactly on the right panel and
survive refresh — we have partial deep-linking, make it total; **(b) a single
documented settings-row vocabulary** (`SectionHeading`/`ListRow`/`Pill`/
`Empty`/`Loading`) so every panel is visibly the same shape; **(c) provider/model
config as validated dropdowns with OAuth/"connect" buttons** rather than anything
that looks like editing a backend URL or pasting a token; **(d) the master/detail
`OverlaySplitLayout` reused** by every full-screen surface (settings, catalog,
schedules) so they're one shell. clio advertises a rich provider preset list +
`PUT /v1/providers/lm` — surface that as cards + dropdowns, not a text field.

## 1c. The left-side navigation — "a left menu that is useful" #2

The other surface the user named. A TUI has *one* screen and a stack of modals you
summon by memorized keybind; a non-technical user has no idea those modals exist.
The GUI's persistent left rail makes **the entire product visible at all times.**

- Hermes' top-level destinations (`routes.ts`): **New chat, Settings, Command
  Center, Skills, Messaging, Artifacts, Cron, Profiles, Agents** — each a real
  place, each reachable from the chrome, not hidden behind a shortcut.
- Several render as **full-screen overlay cards** over the chat shell (settings,
  agents, cron, profiles, command-center) via one `OverlayView` — so "go deep into
  a management surface" doesn't lose your chat, and they all share chrome.
- The sessions sidebar itself is its own column (virtualized list, pinning, profile
  switcher, cron section, per-row actions menu) — distinct from the *app* nav.
- **Everything has a visible affordance:** the nav teaches what the app can do just
  by existing. Nothing relies on the user knowing a keybind.

→ **For us:** we have a LeftRail + SessionsColumn + Inspector (three columns), and a
Cmd+K palette. Against the non-technical-user bar, the questions to answer in the
0.9 audit are: **(a) is every capability reachable by *clicking* the left rail, or
do some only exist via Cmd+K?** (a novice never opens Cmd+K) — the palette should be
an accelerator, not the only door. **(b) Is the left rail labeled and legible** (icon
+ text, not icon-only mystery-meat) for someone who's never seen it? **(c) Do our
discovery/management surfaces (agents, MCP, prompts, blueprints, schedules) share
one overlay shell** like hermes', or are they inconsistent? The left rail is the
single most important "this is a product, not a terminal" signal — it deserves an
explicit audit row.

## 2. Composer — their most-invested surface (1611 LOC), and ours should be too

This is where an agentic app lives or dies. What makes theirs good:

- **Rich content-editable with serializable, non-editable chips.** `@file:`,
  `@session:`, `@tool:` refs render as `contentEditable="false"` span chips inside
  a contenteditable, each carrying `data-ref-{text,id,kind}` so the whole thing
  serializes back to plain `@kind:value` text on submit. Chip values are
  backtick/quote-fenced so typing after a chip doesn't get re-absorbed into it.
  This is the right model for rich refs without a heavyweight editor framework.
- **Two independent trigger systems** (`@` mentions, `/` slash) sharing one
  completion-drawer style. Trigger detection is a regex on text-before-caret;
  completions adapt live; rows carry type-mapped icons.
- **Message queueing.** While the agent is busy, new messages go into a per-session
  queue (collapsed panel) instead of being blocked or racing. Each queued entry has
  preview + attachment count + "Send now"/"Edit". This is a genuinely good answer to
  "I thought of something while it's working."
- **Steering** (send text *into* a running turn) is a first-class composer action,
  distinct from queueing a next message.
- **Attachments are clickable into the preview rail**, not just chips — clicking an
  image/file attachment opens it side-by-side.
- **A request/response focus bus** (`requestComposerInsert({mode,text,target})`):
  any part of the UI (quote button, drag-drop, "add to context") asks the composer
  to focus + insert, rather than reaching into composer state. Clean decoupling.
- **Graceful degradation:** single-line→multiline at a 36px threshold; button
  cluster wraps to its own row under ~320px.

→ **For us:** our composer already has drafts, slash, @-mention, $-env, paste
compression, attach. The transferable gaps worth weighing for 0.9:
**(a) message queueing while busy** (we currently just have steering/stop);
**(b) the chip model** if we ever want richer inline refs than plain text;
**(c) the focus-bus pattern** to replace any direct composer-state pokes. Queueing
is the standout idea.

---

## 3. Thread / tool rendering — `@assistant-ui/react` + domain layers

They did **not** hand-roll the chat thread. `@assistant-ui/react` provides the
runtime (message repository, branching, streaming, edit/reload), and they layer
domain rendering on top:

- **Tool calls as disclosure rows** with a shared header look — a single "Patch"
  row and a "Tool actions · 2 steps" group header render identically (shared header
  class constants). Status glyph (running/done/error) computed in one place.
- **Tool approval is an inline button strip** under the pending tool row — *not* a
  modal. Because the backend blocks on one approval at a time, "the last pending
  tool row IS the one asking" — positional, no separate routing. Choices carry
  persistence level: Once / Session / Always / Deny.
- **Hoisted todo panel** — `todo` tool-calls get extracted and rendered as a
  pinned checklist above the message, header showing the most-relevant item
  (in-progress > pending > latest), inactive rows faded to ~45% opacity.
- **Streaming math memoization** — KaTeX equations memoized by source so only the
  equation whose text changed re-renders per token (math-heavy streams stay fluid).
- **Media streamed via custom protocol**, not data-URLs, so a big audio/video
  attachment doesn't load entirely into memory.

→ **For us:** we hand-roll our transcript/Inspector. That's a deliberate fit for
the GACT wire and the semantic-event spine, and our inspector timeline is arguably
richer than theirs. But two ideas transfer cleanly:
**(a) inline tool-approval strip** (we render the permission card prominently;
worth checking ours reads as "inline under the asking tool" not "floating modal");
**(b) the hoisted todo/checklist** if clio ever emits structured task lists. The
"persistence level on the approval button itself" (Once/Session/Always) matches our
permission-scope buttons — good confirmation we're aligned there.

---

## 4. Right rail — side-by-side previews

- **Width via CSS clamp that yields to chat**, not the other way around:
  `min(clamp(18rem,36vw,32rem), max(0, 100vw − sidebar − filebrowser − chat-min))`.
  The preview can never crush the conversation below its minimum. Per-pane width
  overrides persist.
- **Multi-tab preview** (`file:`-prefixed tab ids vs the main preview tab), one
  active at a time; closing one selects the next or closes the rail.
- **Previews:** source files (Shiki highlight, 512kB cap, theme-matched), HTML/URL
  render, images, binary→icon+empty-state; plus a **resizable console panel** with
  level-colored rows, auto-scroll-unless-scrolled-up, per-row copy.
- Invoked by clicking an attachment or a tool output — not a separate "open
  preview" verb.

→ **For us:** our `DiffPane` + Inspector cover part of this, but we don't have a
general **side-by-side file/URL/image preview rail** driven by clicking
attachments/tool outputs. This is a real differentiator for a "desktop, not a
terminal" product and a strong **0.9 or 1.0 candidate** — it leverages clio's
`/v1/sessions/{id}/context/files/content` (PR #533) we already wired for inline
previews. The clamp-that-yields-to-chat width rule is a 5-minute win regardless.

---

## 5. Boot / backend lifecycle — directly relevant to our supervisor+splash

This maps 1:1 onto our Tauri supervisor + SplashScreen + auto-install work, and
they've polished it harder:

- **A boot-progress atom** (`phase`, `message`, `progress 0-100`, `error`,
  `visible`) that the overlay renders; auto-hides at 100% unless errored.
- **Boot-failure overlay with real recovery actions:** Retry (resets the bootstrap
  latch), Repair (re-runs installer), Logs (expandable, fetched from disk), and —
  for remote gateways — a reauth-detecting "Sign in" path instead of a generic
  error. Logs land at `HERMES_HOME/logs/desktop.log`.
- **Gateway-connecting overlay** animates during SSE reconnect and its fade-out is
  *timed to not fight* the boot overlay (text fade 360ms → hold 300ms → surface
  fade 520ms). "Don't let a global fade race the detail."
- **Same-layout install:** the packaged app installs the runtime into the *same*
  layout a CLI install uses, so the two are interchangeable — exactly our
  lite-variant + `clio` install-script story.

→ **For us:** our 0.7 auto-install splash already does streamed progress + manual
fallback. The transferable upgrades: **(a) a "Repair / reinstall" action** distinct
from "Retry"; **(b) "Open logs"** surfacing the supervisor/clio boot log on disk
(we have the streamed log but not a persisted, re-openable one); **(c) reauth
detection** on the connect path (relevant once federation/remote backends are in
play). Our blocked-turn/error-card work already shares the "actionable error, not a
dead end" philosophy.

---

## 6. State architecture — nanostores, feature-owned

- **One small store per feature** (`session.ts`, `composer.ts`, `panes.ts`,
  `preview.ts`, `boot.ts`, `gateway.ts`, `notifications.ts`, `layout.ts` …), each
  owning its atoms + colocated persistence + narrow action functions. No god hooks,
  no prop-drilling.
- **Render with `useStore($x)`, act with `$x.get()`** — subscriptions only where
  rendering depends on the value.
- **Computed atoms for derived data** (active preview = computed over tabs +
  active-id) so subscriptions only fire on real input changes.
- **`mergeSessionPage()` keeps server-absent sessions that are still working or
  pinned** — avoids evicting a just-created session before its first message flushes
  to the DB. (We hit exactly this class of bug; good confirmation of the fix shape.)

→ **For us:** SolidJS signals already give us most of this ergonomically. The
transferable discipline is **feature-owned stores + colocated persistence** rather
than a few big context objects, and the "don't evict in-flight rows on refetch"
rule for our sessions list.

---

## 7. Primitives worth noting (beyond stock shadcn)

- **`Loader`** — an elaborate animated math-curve SVG (lemniscate/rose/etc.) for
  long ops; never the literal text "Loading…". *Over-engineered* (21 curve types is
  a lot of bundle for one spinner) but the *principle* — a branded, alive
  thinking-indicator instead of a generic spinner — is right.
- **`BrailleSpinner`** — single-char unicode spinner that **mirrors the TUI's
  spinner**, so terminal and desktop feel like one product. We have both a TUI and
  a desktop; visual parity of small things like spinners/status dots is a cheap
  coherence win.
- **`ErrorState` + canonical `ErrorIcon`** — one error presentation for the React
  boundary, in-dialog errors, and boot failure. Title/description accept nodes so
  Radix `DialogTitle/Description` flow through for a11y.
- **`SegmentedControl`** — replaces radio piles / pill rows for small mutually-
  exclusive choices (color mode, tool-call display, usage period).
- **`SearchField`** — borderless, underline-on-focus, auto-width, *the only* search
  input; empty lists hide it.
- **`LogView`, `EmptyState`, `ActionStatus`, `FadeText`, `kbd`** — every
  empty/loading/error/log/keycap surface has exactly one component.

→ **For us:** inventory our primitives and collapse duplicates. Specifically worth
having if we don't: one `ErrorState`, one `EmptyState`, one `LogView`, a
`SegmentedControl` for our density/theme/period toggles, and **TUI⇄desktop spinner
parity**.

---

## 8. Onboarding — get to first message in seconds

- Multi-step overlay; **OAuth as an explicit state machine** (idle → awaiting_user
  → polling → success → confirming_model), each state carrying enough data to
  render without refetch.
- **Provider catalog: curated entries float to top** (richer copy, placeholders),
  derived/discovered ones appended alphabetically — no hardcoded full list.
- **Persisted "onboarded" + "skipped" flags** so returning users never see it
  again; skip → add providers later in Settings.
- **Timed exit choreography** coordinated with the connecting overlay.

→ **For us:** we have a first-run intro/onboarding. The transferable bits: the
**curated-first / discovered-after provider ordering** (clio advertises a big
provider preset list — we should surface the sane defaults first), and a clean
**"skip, configure later in Settings"** path.

---

## 9. Command palette vs command center

- **Palette (Cmd+K):** flat searchable actions + nav, with **nested pages** (choose
  "Theme" → page of Light/Dark/System), `keepOpen` for live-preview changes (theme
  applies while palette stays open).
- **Command center (separate dialog):** three tabs — Sessions / System (logs +
  restart) / Usage analytics (7/30/90-day). Heavier, invoked from settings.

→ **For us:** our Cmd+K palette is solid. Two ideas: **nested palette pages** for
multi-choice actions (cleaner than spawning sub-overlays), and `keepOpen` for
theme/density so the change previews live. A "command center" is probably scope
creep for us right now — note, don't build.

---

## What to actually take into the 0.9 push (ranked by the non-technical-user lens)

The ranking leads with "things a TUI can't do, that a novice most needs," because
that's the app's reason to exist.

1. **Left-rail completeness audit (§1c).** Every capability must be reachable by
   *clicking*, with legible icon+text labels; Cmd+K is an accelerator, not the only
   door. The single biggest "product, not terminal" signal. Cheap, high-impact.
2. **Configuration menu depth (§1b):** total deep-linking of settings sections
   (`?tab=`/sub-params), provider/model as validated dropdowns + connect buttons
   (never a raw URL/token field for a novice), one documented settings-row
   vocabulary, one shared overlay shell across all management surfaces.
3. **Side-by-side rendered preview rail (§4)** — file/URL/image, clamp-yields-to-
   chat — on the `context/files/content` endpoint we already wired. The marquee
   "can't do this in a terminal" feature. 0.9 if reachable, else first 1.0 item.
4. **Boot/error as buttons, not tracebacks (§5):** Repair + persisted "Open logs" +
   reauth detection. A novice must never see a stack trace.
5. **Onboarding (§8):** curated-first provider ordering + OAuth/connect buttons +
   clean skip→Settings, so a non-technical user reaches first message in clicks.
6. **Write `apps/web/DESIGN.md`** (flat/tokens/one-primitive rule + checklist) and
   do a token/primitive consolidation pass — table stakes, lowest risk.
7. **Composer message-queueing while busy (§2)** — strongest missing composer idea.
8. **Primitive parity:** one `ErrorState`/`EmptyState`/`LogView`/`SegmentedControl`;
   **TUI⇄desktop spinner/status-dot parity** so the two products feel like one.

## What to explicitly NOT copy

- The 21-curve `Loader` (branded spinner: yes; that much surface area: no).
- A separate "command center" dialog (palette covers it for our scale).
- Their OAuth state-machine verbosity (we don't have their multi-provider OAuth
  surface; keep ours simple).
- Electron/React idioms — we're Tauri/Solid; adopt decisions, not code.
