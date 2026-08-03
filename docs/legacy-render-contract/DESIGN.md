# CLIO Desktop (web) — Design System

This is the enforceable design doc for `@clio/web` (the SolidJS browser/Tauri
app). It adapts the Hermes Agent Desktop design notes
(`docs/ref/hermes-agent-desktop.md` §1) to our SolidJS + CSS-variable setup.

**Read this before adding any UI.** The whole point is that the app reads as one
coherent product — both across its own surfaces and with the TUI — for a
**non-technical user** who will never open a terminal.

The governing rule (steal it verbatim):

> **one source per concern · tokens over literals · flat over boxed.**

---

## 1. Principles

### Flat, not boxed
No card-in-card. No nested rounded boxes. No divider border inside a panel where
whitespace would do. Group rows with spacing and **a single hairline**, never a
stack of dividers. An always-on inline surface (the composer shell, a sticky
search bar, a left-rail item) gets **no drop shadow** — only floating things
that sit *above* the page do.

### Borderless + shadow for elevation
Every overlay — dialog, modal, popover, dropdown menu, toast, notification
panel, command palette, hero connect/splash card — floats on **one shared
shadow token + one hairline**:

```css
box-shadow: var(--shadow-overlay);
border: var(--stroke-hairline);
```

Never a per-overlay one-off `box-shadow: 0 24px 64px …`. Never a hard
`2px solid` border to fake elevation. *If elevation needs to change, change the
token* — `--shadow-overlay` is defined once in `src/styles/index.css` and
re-themed (lighter on the light/dim presets) in `src/theme.ts`.

### One primitive per concern
There is exactly one of each of the following. Migrate onto them; do not fork a
near-copy with a slightly different spinner/empty/error.

### Tokens, not literals
Every color, radius, space, and shadow references a CSS var
(`--color-*`, `--radius-*`, `--space-*`, `--shadow-overlay`,
`--stroke-hairline`). The design-system seed tokens live in `apps/design/`
(**read-only**); the web app layers its own overrides + the light/dim/contrast
palettes in `src/theme.ts`. A raw `#rrggbb` / `rgba()` in a component CSS file is
a bug unless it is *ink on an accent* (e.g. dark text on the orange button, which
must stay dark in both themes). Tint with `color-mix(in srgb, var(--token) N%,
transparent)` so the tint follows the theme.

---

## 2. Tokens (the names you may use)

From `apps/design/colors_and_type.css` (read-only seeds) + web overrides:

- **Color:** `--color-bg`, `--color-surface`, `--color-surface-alt`,
  `--color-heading`, `--color-text`, `--color-muted`, `--color-border`,
  `--color-border-30`, `--color-border-60`, `--color-accent` (warm),
  `--color-accent-cyan`, `--color-success`, `--color-warning`, `--color-error`,
  and the pre-mixed `--color-accent-cyan-10/20/30`, `--color-accent-warm-10/20`.
- **Type:** `--font-sans` (Inter, overridden in `styles/index.css`),
  `--font-mono` (JetBrains Mono), `--font-display` (wordmark only). Scale
  `--text-xs … --text-7xl`; weights `--fw-*`; tracking `--tracking-*`.
- **Radius:** `--radius-sm/md/lg/xl/2xl/pill`.
- **Space:** `--space-1 … --space-28` (4px scale).
- **Motion:** `--ease-out`, `--ease-in-out`, `--ease-emphasis`,
  `--dur-fast` (200ms), `--dur-base` (300ms).
- **Elevation (web-defined, this app's contract):**
  - `--shadow-overlay` — the ONE overlay drop shadow. Dark default in
    `styles/index.css`; lighter variants ride the light/dim presets in
    `theme.ts`.
  - `--stroke-hairline` — the ONE hairline (`1px solid var(--color-border-30)`)
    for overlay edges and group separators.

There is no `--color-danger`, `--color-accent-red`, etc. Those were typos that
fell through to hardcoded hex — use `--color-error`.

---

## 3. Primitive inventory

| Concern | Primitive | Location |
|---|---|---|
| Thinking / loading indicator | **`Spinner`** | `components/ui/Spinner.tsx` |
| Settings/section empty state | **`EmptyState`** | `components/SettingsPrimitives.tsx` |
| Settings/section loading state | **`LoadingState`** | `components/SettingsPrimitives.tsx` |
| Status chip / badge | **`Pill`** (`tone`: neutral/ok/warn/err/accent) | `components/SettingsPrimitives.tsx` |
| Settings row (label · desc · control) | **`ListRow`** | `components/SettingsPrimitives.tsx` |
| Settings group header | **`SectionHeading`** | `components/SettingsPrimitives.tsx` |
| Discovery-page shell (head + loading/error/empty/body) | **`DiscoveryPage`** | `components/DiscoveryPage.tsx` |
| Dropdown / select | **`Dropdown`** | `components/Dropdown.tsx` |
| Button | **`.btn` + `.btn--primary/secondary/danger`** | `styles/index.css` |
| Mutually-exclusive choice (theme/density/preset) | **`.settings-shell__choice` cluster** (de-facto SegmentedControl) | `routes/settings-shell.css` |

### Spinner — TUI parity
`Spinner` renders the **exact Braille-dots cycle the TUI uses**
(`tui/internal/ui/spinner.go`: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 125 ms/frame), so the desktop's
in-flight indicator and the terminal's feel like one product. It is the only
animated loader: every former ring-spinner (`sx-loading__spinner`,
`composer__chip-spin`) now renders `<Spinner>`. Tint via `color`, size via
`size` / `font-size`.

Two **branded multi-dot pulses** are intentionally *not* the Spinner and stay as
themselves: the splash boot pulse (`.splash__dot`) and the chat "CLIO is
responding" dots (`.chat__typing-dot`). These are hero/affordance animations,
not generic loaders, and reading them as the boot/typing identity is the point.
Do not add a *third* dot-pulse — reuse one of these or the Spinner.

### Status dots
Session/connection status pips follow the TUI's semantics: running = animated +
success/warn tint, waiting = warn, idle = muted. The pip glow
(`box-shadow: 0 0 Npx var(--color-success/warn/err)`) is a functional accent
glow, not elevation — leave it.

---

## 4. Elevation rule (the one that's easy to violate)

1. Floating above the page? → `box-shadow: var(--shadow-overlay)` +
   `border: var(--stroke-hairline)`. Nothing else.
2. Inline in the page flow? → no shadow. Hairline border or bg contrast only.
3. Need a stronger/weaker drop? → change `--shadow-overlay` (and its themed
   variants), never one component.
4. Status glows and accent ring-shadows (badges, droptarget, focus ring) are not
   elevation and are exempt.

---

## 5. "Before you add something" checklist

Run this list before writing a new component or a new CSS rule:

- [ ] **Does a primitive already exist?** (§3) If a loader/empty/error/badge/row
      already exists, use it. Do not fork.
- [ ] **Am I floating something?** Use `--shadow-overlay` + `--stroke-hairline`.
      No bespoke `box-shadow`.
- [ ] **Am I boxing inline content?** Don't. Flatten — spacing + one hairline.
- [ ] **Every color/space/radius a token?** No raw hex/rgba except ink-on-accent.
      Tint with `color-mix(... var(--token) ...)`.
- [ ] **Does it read in light + dark?** Verify against `theme.ts` light/dim/
      high-contrast — never hardcode a dark-only value.
- [ ] **Reduced motion respected?** Heavy animation must collapse under
      `prefers-reduced-motion` (the global rule in `styles/index.css` covers
      CSS animations; JS-driven motion like `Spinner` checks the media query).
- [ ] **Did I keep the `data-testid`s?** Tests + the visual suite key off them.
      Add, don't rename.
- [ ] **Is there a screenshot?** Any `src/**` UI change refreshes the relevant
      PNG under `screenshots/` (see `apps/HARNESS.md`).

---

## 6. Known follow-ups (do not block 0.9)

- **Promote a real `SegmentedControl`.** The theme/density/preset choices use the
  `.settings-shell__choice` cluster, which is a segmented control in all but
  name. A future pass can extract `components/ui/SegmentedControl.tsx` and
  migrate those call sites — but only with their `data-testid`s preserved, so it
  was left out of the visual-refresh pass to avoid testid churn.
- **Menu hairlines.** Small popover menus (`.sx__ws-menu`, `.sx__row-menu`,
  `.chat__overflow-menu`) still use `--color-border-60` for a slightly crisper
  edge rather than the `--stroke-hairline` (`-30`). Acceptable; unify if we ever
  want menus to read flush with dialogs.
