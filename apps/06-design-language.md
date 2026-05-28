# 06 — Design Language

The web and desktop apps inherit the **CLIO Design System** as their visual foundation. The system was assembled by the IOWarp team from `iowarp.ai` and shared with this project on 2026-05-27. The full system lives at `apps/design/`; its canonical README is `apps/design/CLIO-Design-System-README.md`.

This document tells you how to apply it to the agent IDE specifically — which parts to lift verbatim, which parts to extend, and which parts of the marketing site don't translate.

## What we inherit verbatim

### Color

Pure-black canvas, two saturated accents. No light mode. Read `apps/design/colors_and_type.css` — every token used in the app comes from there.

| Token | Hex | Role in the agent IDE |
|---|---|---|
| `--color-bg` | `#000000` | Page background. |
| `--color-surface` | `#0a0f1a` | Sidebar pane, transcript pane, composer pane. |
| `--color-surface-alt` | `#0f1f35` | Modals, nested cards, message hover state. |
| `--color-heading` | `#e0e8f0` | Message author lines, modal titles, section labels. |
| `--color-text` | `#4a90b5` | Default assistant text, sidebar item titles. |
| `--color-muted` | `#5a778c` | Timestamps, token counts, captions. |
| `--color-border` | `#2d638b` (at /30–/60) | Pane separators, message dividers, card outlines. |
| `--color-accent` | `#ea7b2a` | Primary CTAs (Send, Apply Diff), stat numbers in the doctor view, Core-engine accents. |
| `--color-accent-cyan` | `#00d4db` | Links, secondary CTAs, agent-routing badges, cache hit-rate chip, slash-command highlights. |
| `--color-success` | `#34d399` | "Live" SSE dot, `tool.call.completed{ok:true}` checkmark, applied-diff highlight. |
| `--color-warning` | `#fbbf24` | `provider_configuring` banner, slow-streaming fallback indicator. |
| `--color-error` | `#f87171` | Permission denied, `tool.call.completed{is_error:true}` X, SSE down dot. |

The cyan/orange semantic split — **cyan = data / intelligence / agent, orange = compute / energy / primary action** — extends naturally to the IDE: the routing-decision badge palette per specialization is cyan-family; the "Send" composer button and the "Apply diff" affirmative action are orange. Don't mix them in one emphasis cluster.

### Typography

| Family | Use in the agent IDE |
|---|---|
| **Oxanium** | All UI text: sidebar items, message bodies, modal titles, button labels, settings labels. Variable weight 400–800. |
| **JetBrains Mono** | Code blocks, `tool_call` headers, `file_diff` content, terminal-style banners in the doctor view, eyebrow labels (`SESSIONS`, `CONTEXT`, `CAPABILITIES`), stat numbers with `tabular-nums`, the `▮` typing cursor. |
| **Bungee Spice** | Only for the literal string "IOWarp" on the connect screen header. Never anywhere else. |

Tracking:
- Eyebrow labels use `0.2em` tracking, uppercase, cyan, mono.
- Headlines on the connect/error screens use `-0.025em` tracking, weight 800.
- Body line-height is `1.6`.

### Voice (in user-facing copy)

This is the rule that matters most for the agent IDE. The CLIO marketing voice is **authoritative, technical, third-person**. The IDE inherits it.

| Surface | Right | Wrong |
|---|---|---|
| Connect screen header | `CLIO — Context Layer for IO▮` | "Welcome! Let's get you started 🎉" |
| Empty sessions sidebar | `No sessions yet · Start one to begin` | "You haven't created any conversations." |
| Composer placeholder | `Ask CLIO about your data...` | "Type a message..." |
| Permission modal title | `Permission requested` | "Hey, can I run this?" |
| Permission modal body | `CLIO requests permission to run: rm -rf /tmp/x` | "I want to delete the temp folder, is that OK?" |
| Permission modal CTAs | `Allow · Deny · Allow for session · Allow for workspace` | "Yes · No · Just this time · Yes always" |
| Error toast | `Provider configuring · retry in 4s` | "Oops, something went wrong!" |
| Cancel confirm | `Cancel turn? · In-flight LM call may continue` | "Are you sure you want to stop?" |
| Doctor view | `Integrations · Capabilities` | "Health Check · Available Features" |
| Stats in doctor view | `7.5×` `150+` `$5M` (orange, mono, `tabular-nums`) | "Up to 7.5 times faster" |

Rules in summary:
1. **Third-person product.** *CLIO orchestrates…*, never *we orchestrate*.
2. **Imperative for actions.** *Cancel turn*, *Allow*, *Send*, *Apply*.
3. **Numbers as proof.** Orange, mono, `tabular-nums`.
4. **No emoji ever.** Use Heroicons SVGs and the unicode set: `→ ✓ ✗ · — ▮`. The chat transcript should NOT use emoji even when displaying assistant content that contains it — the *brand chrome* is emoji-free; assistant Markdown content renders whatever the LM produces.
5. **No marketing fluff.** Words to avoid: *revolutionary, game-changing, seamless, magical, AI-powered, supercharge*.
6. **Em-dash for asides.** Not the hyphen-space-hyphen pattern.
7. **Middle-dot for badge separators.** `Open Source · NSF Funded · Production Ready`.

### Motion

Two scales, copied wholesale from the marketing site:
- **Reveals** (modal open, toast appear, session-row enter): `700ms` `cubic-bezier(0.16, 1, 0.3, 1)`, `opacity 0→1`, `translateY 28px→0`.
- **Hovers** (button states, link colors): `300ms` `cubic-bezier(0.4, 0, 0.2, 1)`.

No bouncing. No overshoot. The brand reads as engineered, not playful.

Some IDE-specific motion that doesn't exist on the marketing site:
- **Streaming token append** uses no animation — just appears. The signal is its own pacing.
- **`tool.call.started` chip** pulses with the cyan dot (`animate-ping` recipe) until completion.
- **SSE reconnect spinner** uses the `glow-breathe 3s ease-in-out infinite` recipe in the warning color.
- **Permission modal entry** is the only modal that uses the slower 700ms reveal — its weight matters.
- **Sticky-to-bottom auto-scroll** is `scroll-behavior: smooth` (already on `html`); no custom animation.

All motion respects `@media (prefers-reduced-motion: reduce)`.

### Backgrounds

The hero atmospheric stack (noise overlay z-200 / radial cyan glow / faint 48px grid / .webp diagram at opacity 0.18) is gorgeous for the marketing site, **overkill for the IDE**. The agent IDE uses a stripped-down version:

- **Always**: pure `--color-bg` black behind everything.
- **Connect screen**: full atmospheric stack (this is the user's "front door" — match the marketing site). Use `assets/hero/clio-agent.webp` as the diagram.
- **Main app**: only the noise overlay at `opacity: 0.025`, fixed, `z-index: 200`. No radial glow, no grid, no diagram. The transcript is the focus.
- **Doctor view modal**: subtle radial glow behind the modal content. Optional grid at `background-size: 48px 48px` at `opacity: 0.04` inside the capabilities tab to evoke the platform-architecture aesthetic.

### Iconography

Heroicons outline set. Stroke-only, 1.8–2px stroke, `currentColor`. **Never draw your own icons.** Import from `@heroicons/react/24/outline` (or its Solid equivalent). The Icon recipe from `ui_kits/website/Icon.jsx` is the reference for shape choice.

Standard icon sizes for the IDE:
- 14px (`w-3.5 h-3.5`) — inline in chips, status badges.
- 16px (`w-4 h-4`) — nav/sidebar items, button glyphs.
- 20px (`w-5 h-5`) — card icon chips, header chips.
- 24px (`w-6 h-6`) — primary actions, permission-modal warning glyph.

Color: inherit `--color-muted` resting, `--color-accent-cyan` on hover, `--color-accent` (orange) in Core-themed surfaces (e.g. the "Apply diff" button uses orange).

GitHub icon uses the canonical Octocat path at currentColor.

### Cards

The canonical CLIO card recipe (`apps/design/CLIO-Design-System-README.md` §Card recipe) is the foundation for everything in the IDE that frames a unit of content:

- Sidebar session rows.
- Transcript message blocks (in detail view).
- Modal frames.
- Settings cards.
- Doctor view integration cards.
- MCP server entries.
- Expert pack entries (new — see §New surfaces below).

```css
background:    var(--color-surface-alt);
border:        1px solid var(--color-border-30);
border-radius: var(--radius-xl);   /* 12px standard, 14px for hero */
padding:       1rem | 1.5rem | 2rem;
overflow:      hidden;
transition:    all 350ms var(--ease-emphasis);
:hover {
  border-color: var(--color-accent-cyan);
  box-shadow:   var(--glow-cyan-lg), inset 0 0 36px rgba(0,212,219,0.03);
}
```

## What we extend (the agent IDE adds these to the system)

The CLIO Design System README is explicit: "Only the marketing website was attached. The CLIO Agent IDE has its own visual surfaces — if you need those, extend the system." Here are the extensions the IDE needs.

### Transcript-specific primitives

These don't exist on the marketing site but are the core of the IDE.

- **Tool call demarcation block.** A `tool_call` Part renders as a JetBrains-Mono header line `tool_name(args)` in cyan, a `⎿` connector at the next line, and the `tool_result` content indented underneath. Border-left rail in cyan/30. The Claude-Code aesthetic that the TUI already uses (`research/gact-tui-architecture.md` §5.4) — same language for the web.
- **File diff block.** Card with a JetBrains-Mono header `path/to/file.py · +12 −4 · diff` (path bold heading color, stat numbers in orange mono `tabular-nums`, `· diff` muted). Body is a unified diff with `@@ -A,B +C,D @@` hunk headers in cyan/60, `+` lines on a `var(--color-success)/10` background, `-` lines on a `var(--color-error)/10` background, context dim. Apply/Reject buttons at the bottom right — Apply is the primary orange CTA recipe, Reject is the secondary cyan recipe.
- **Thinking block.** Collapsible card with a "Thinking" eyebrow label in cyan mono, chevron-down → chevron-up on toggle. Body is `--color-muted` italic. Defaults to collapsed.
- **Routing decision badge.** Inline chip above the assistant message: `▸ analysis_expert · LM-routed · 0.87` (the `▸` glyph is the per-part cursor character, repurposed as a badge marker). The agent's id maps to a palette color (`agentColor()` recipe; cyan-family for built-ins, orange for `core` engines).
- **Subagent indentation.** When a `subagent_call`/`subagent_result` part arrives, render it indented `1.5rem` from its parent message with a `└` glyph at the indent.

### Streaming chrome

- **Status pill on the assistant message** changes through the turn: `thinking…` (cyan, animated dot), `using read_file…` (cyan, tool name), `composing reply…` (cyan), then disappears on `message.completed`.
- **Header status badge** advances: `idle` (muted), `running` (cyan, animated dot), `waiting_permission` (warning), `waiting_user` (warning — new per the clio-agent delta), `error` (error).
- **Token meter** in the footer: `12,847 in · 3,201 out · $0.0142` in mono `tabular-nums`, the cost number in orange when over the configured warn threshold.

### Inline approval card (the load-bearing pattern from Claude Desktop + Zed + Codex)

Permissions render as **inline cards in the transcript** at the point of request — not modal dialogs. Three-scope buttons by default plus a risk affordance. This is one of the most-cited patterns from the desktop-app reference research (`research/desktop-app-references.md` §5) and one of the documented papercuts in Claude Desktop that we explicitly fix (`apps/research/desktop-app-references.md` §6, anti-pattern #3).

Card anatomy:

```
┌─ permission requested ─────────────────────────────── [risk: low/med/high/critical] ─┐
│ CLIO wants to: <action_verb>  <subject>                                              │
│   tool:        <tool_name>                                                            │
│   arguments:   <one-line summary, click to expand>                                    │
│                                                                                       │
│   ⚠ This action <warning_phrase>                  [shown only for broad-reach tools]  │
│                                                                                       │
│   [ Allow once ]  [ Allow for this session ]  [ Always allow this tool ]              │
│   [ Always allow on this server ]  [ Deny ]                                           │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Visual treatment:
- Card uses `--color-surface-alt` background, `1px solid --color-warning/40` border for medium-risk and below, `1px solid --color-error/60` border for high/critical.
- "permission requested" eyebrow in mono uppercase, tracked `0.2em`, color `--color-warning` for medium-and-below, `--color-error` for high/critical.
- Risk badge on the right of the eyebrow row: pill with `--color-warning/20` background for low/medium, `--color-error/20` for high/critical, mono tabular text.
- The action line uses `--color-heading` for the action verb (bold), `--color-text` for the subject.
- Argument summary uses JetBrains Mono, click to expand to a `<pre>` block with full args.
- Warning band (only for broad-reach actions like `rm -rf`, network-host writes, write_file outside workspace) is a row spanning the card with `--color-error/10` background and a chevron-warning icon.
- Buttons: "Allow once" + "Allow for this session" use the secondary cyan recipe; "Always allow this tool" + "Always allow on this server" use the same secondary recipe with a tooltip explaining persistence; "Deny" uses a destructive recipe (error-tinted secondary). Disabled button styling on whichever scope was already granted via policy.

**Status badges after resolution** (from Codex's review-item state machine, `research/desktop-app-references.md` §3.10):
- `Reviewing` — agent is processing the request (visible only when auto-review is configured)
- `Approved` — user (or auto-reviewer) granted permission; card collapses to one-line `✓ Approved <action> · scope: <scope>`
- `Denied` — user denied; card collapses to `✗ Denied <action>`
- `Aborted` — user resolved with a side action (e.g., cancelled the turn)
- `Timed out` — 120s permission-gate elapsed; treated as deny

### Three view-density modes (transcript noise control)

Toggled with `Ctrl+O` to cycle. From Claude Desktop's Code tab.

| Mode | Visible | Hidden |
|---|---|---|
| **Verbose** | All Parts. All `tool_call` cards pre-expanded with arguments + output. Thinking blocks pre-expanded. | Nothing. |
| **Normal** (default) | All Parts. `tool_call` cards collapsed to a single line: `[▸ tool_name(summary) ✓ N <unit>]`. Thinking blocks collapsed. | Nothing structurally hidden — just collapsed. |
| **Summary** | `text` Parts. `file_diff` chips. Permission cards. Routing-decision badges. | `tool_call`, `tool_result`, `thinking`, `subagent_*`. |

The mode persists per-session in client storage. The composer toolbar has a small density indicator (a stack-of-lines icon, 14px) with the current mode in mono next to it: `▤ Normal`.

### Diff-stats chip

When the assistant emits a `file_diff` Part, the chat pane shows a chip — not the diff itself — that's clickable:

```
[ +12 −1 in src/clio_agent/gact/app.py ]
```

Visual treatment:
- Card-recipe shaped, but pill-radius (`--radius-pill`), single-line, padding `4px 12px`.
- Stat numbers in `--color-accent` (orange) mono `tabular-nums` for `+`, `--color-error` for `−`. Path in `--color-heading` mono.
- Click opens or focuses the **diff pane** with that file selected.
- The Apply / Reject actions live in the diff pane, not on the chip (per-hunk granularity).

This mirrors Claude Desktop's pattern exactly. Reasoning: a diff inline in the transcript wastes vertical space and can't be reviewed at full width.

### Backend status pip vocabulary

In the backend picker dropdown (`research/desktop-app-references.md` §8), pips use this vocabulary:

| Glyph | Color | Meaning |
|---|---|---|
| ⬤ | `--color-success` | Connected, SSE stream healthy, heartbeats on time. |
| ⬤ | `--color-warning` | Connected but degraded (slow heartbeats, retrying SSE). |
| ⬤ | `--color-error` | Tunnel up, backend not responding. |
| ◯ | `--color-muted` | Known backend, not currently connected. |
| ⊘ | `--color-muted` | Previously connected, now disconnected (reconnect affordance). |
| ⚠ | `--color-warning` | Connected but version-skewed (backend `contract_version` doesn't match what the client was built against). |

The same vocabulary applies to the per-session status pip in the sidebar.

### New surfaces from the clio-agent delta (2026-05)

- **Ask-user modal** (`session.status: waiting_user`). Distinct from permission modal — this is when the agent needs information, not approval. Modal title `CLIO needs an answer`, body shows the agent's question, free-text input, "Submit" (orange) and "Skip" (secondary).
- **Retry affordance** in the message footer. When a `TurnAttempt` row exists with `retry_count > 0`, show `↻ retried 2× · last error: provider_timeout` in muted mono. Click to expand the attempt history.
- **Context frame inspector**. A right-rail (or modal) showing the per-turn assembled context: which files, which prior messages, which prompt, which agent, which memory entries. Card per category. Useful for debugging "why did the agent do that?" Defer to a power-user toggle; not visible by default.
- **Expert pack card**. In the agents catalog: a card with the pack name, tier badge (`tier 1` / `tier 2` / `tier 3` chips), parent pack lineage, and a "Use for this turn" button that POSTs `agent:{id}` as a single-turn override (per clio-agent delta).
- **Cross-session memory search**. A search field at the top of the sidebar. Searches memory across all sessions, not just the current one. Returns hits as a list of `(session, message excerpt)` rows, click to jump.

## What we drop from the marketing system

These exist in `apps/design/` and `ui_kits/website/` but DO NOT translate to the agent IDE:

- **Hero stats strip with `7.5×` etc.** — those numbers are marketing claims, not IDE state. The IDE shows real numbers (token usage, cost) using the same typography but never the marketing copy.
- **Six-engine bento grid.** Marketing layout. The IDE's catalog browsers are dense lists, not bento tiles.
- **CTA band with "Get Started" gradient text.** No equivalent in an IDE.
- **Floating orbs decoration.** Too much for an interface the user stares at for hours.
- **Gradient shimmer on the hero H1.** Same reason.
- **Hover transforms on architecture rows.** The IDE sidebar items don't `translateX(4px)` on hover; they get a left-border cyan accent and a subtle background shift instead.
- **Bungee Spice anywhere outside the connect screen wordmark.** The agent IDE shows the literal string "CLIO" or "IOWarp" once at boot, then never again in this font.

## Themes

The marketing site is dark-only. The IDE inherits that as default but adds a few variants for users who genuinely want them — same way the TUI ships seven palettes despite the brand canonically being one dark mode.

The TUI's seven themes (`dark`, `light` Gruvbox-warm, `dracula`, `solarized-dark`, `solarized-light`, `nord`, `tokyo-night`) port to CSS custom property overrides on `:root[data-theme="..."]`. The CLIO design system is the `dark` default; the other six remap `--color-*` tokens while keeping the same component shapes.

A custom theme is a JSON file dropped into the settings; same schema as the TUI's `~/.config/gact/theme.json`. The settings modal has a drag-drop zone.

## Where things live

```
apps/design/
├── colors_and_type.css        ← drop-in design tokens; the source of truth
├── CLIO-Design-System-README.md  ← full canonical spec
├── SKILL.md                   ← Claude Code skill entry point (for design work)
├── fonts/
│   ├── Oxanium/
│   ├── JetBrains_Mono/
│   └── Bungee_Spice/
└── assets/
    ├── brand/                  ← logos, lockups, favicons
    ├── favicon.svg
    └── favicon.ico
```

When `apps/web/` is scaffolded:
- `apps/design/colors_and_type.css` is `@import`-ed once at the top of `apps/web/src/index.css`.
- Fonts are referenced via `@font-face` in the same import (the file already has the declarations).
- Brand assets are served from `apps/web/public/` (copy or symlink at build time).
- Component primitives (Card recipe, Eyebrow, Stat number, etc.) live in `apps/core/src/ui/` as framework-agnostic Solid components.

The marketing UI kit at `D:\Libraries\Downloads\CLIO Design System\ui_kits\website\` is a **reference**, not a dependency. We won't bundle React + Babel-standalone; we'll re-implement the patterns we need in Solid using the same CSS tokens.

## Future extensions

Things the CLIO Design System doesn't cover yet but the IDE will need. These should be added back to the canonical design system once stable.

- A formal **shadow scale for in-app modals** (the marketing site has `--shadow-artifact` but nothing for stacked modals).
- A **focus ring system** (the marketing site has none — accessibility requires one).
- **Loading skeletons** for sessions list / catalog list / transcript while data is in flight.
- **Empty states** for every list surface (sessions, MCP servers, agents, expert packs, prompts, tasks, hooks).
- **Toast / notification** stack visuals — position, stack count, dismiss animation.
- **Keyboard-shortcut indicator chips** (e.g., `⌘K`, `⌃Z`) — JetBrains Mono in a pill with `border-radius: --radius-md`, `padding: 1px 6px`, muted-color.
- A **side-by-side diff** layout token set (the marketing site has unified diffs only).
- An **inline image / video / chart** treatment for tool results that return rich media (e.g., a matplotlib figure from a Python tool).
