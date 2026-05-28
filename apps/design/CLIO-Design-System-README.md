# CLIO Design System

A design system for **IOWarp** — the NSF-funded ($5M, Award #2411318) open-source context engineering platform — and its software platform, **CLIO** (Context Layer for IO).

> *"IOWarp bridges the gap between petabyte-scale scientific data and AI-ready intelligence through context engineering — transforming scattered data, metadata, telemetry, and computational state into unified, actionable context for autonomous agents."*

This folder gives a design agent everything it needs to produce on-brand artifacts (mockups, decks, prototypes, marketing assets, internal tools) for the IOWarp project without re-deriving the look and feel from scratch.

## Sources

The system is reverse-engineered from these public assets. Read them directly if you need more depth than the cards in this folder provide.

- **Marketing site** — <https://iowarp.ai/>
- **Website repo (canonical source for this design system)** — <https://github.com/iowarp/iowarp.ai-website>
  - Token block: `_astro/about.E-XxSyBn.css` → `@layer theme { :root, :host { … } }`
  - Page-specific motion + section CSS: `_astro/index.CJPKj_CV.css`
  - LLM-friendly product summary: `llms.txt`, `llms-full.txt` in the repo root
- **Core platform code** — <https://github.com/iowarp/iowarp>
- **MCP server toolkit** — <https://github.com/iowarp/clio-kit>
- **Agent framework** — <https://github.com/iowarp/clio-agent>

> When in doubt, fetch the live site or browse the website repo for more components and copy.

## Index — what's in this folder

```
.
├── README.md                  ← you are here
├── SKILL.md                   ← Agent-Skills-compatible entry point
├── colors_and_type.css        ← canonical CSS tokens (drop-in)
├── fonts/                     ← self-hosted .ttf — Oxanium, JetBrains Mono, Bungee Spice
├── assets/
│   ├── brand/                 ← IOWarp logo, CLIO icon (4 sizes), CLIO lockups (5 variants)
│   ├── hero/                  ← .webp diagram art used in homepage sections
│   └── favicon.{svg,ico}
├── preview/                   ← design-system cards (typography, color, components)
└── ui_kits/
    └── website/               ← high-fidelity recreation of iowarp.ai
        ├── README.md
        ├── index.html         ← interactive multi-screen click-through
        └── *.jsx              ← Nav, Hero, Stats, Bento, Footer, …
```

---

## At-a-glance

| | |
|---|---|
| **Project** | IOWarp (research project name) |
| **Platform** | CLIO (Context Layer for IO) |
| **Tagline** | *Context Engineering for Autonomous AI Agents* |
| **One-liner** | *The open-source platform that turns any AI agent into a science partner* |
| **Funding** | NSF Award #2411318, $5M, 2024–2029 |
| **License** | BSD-3-Clause |
| **Lead** | Gnosis Research Center, Illinois Institute of Technology |

---

## CONTENT FUNDAMENTALS

### Voice

- **Authoritative, technical, declarative.** CLIO is written for engineers and research scientists who recognise terms like *HDF5*, *Slurm*, *NVMe*, *MPI*. Don't soften them away; don't define them inline unless the surface specifically targets newcomers.
- **Third-person product / no first-person plural.** Copy talks about *the platform*, *CLIO*, *agents*, *the four engines* — not *we* or *our*. Avoid "we built", "our team", "we believe". Examples: *"CLIO orchestrates…"*, *"The platform ingests…"*, *"Agents query at petabyte scale"*.
- **You-leaning, action-oriented for CTAs and instructions.** *"Get Started"*, *"Explore Full Architecture"*, *"Build with us"*. Imperative verbs.
- **Numbers as proof.** Quantify wherever possible: *7.5×*, *2.6×*, *150+*, *14+ formats*, *25+ publications*, *3+ national labs*. Numbers go in the orange accent color when they're a stat headline.
- **No marketing fluff.** Words to avoid: *revolutionary, game-changing, seamless, magical, AI-powered* (the agent IS AI; saying "AI-powered" is filler). Words to keep: *autonomous*, *unified*, *context-aware*, *petabyte-scale*, *orchestrate*.

### Casing

- **Product names — Title Case, exact spelling**: *IOWarp*, *CLIO*, *CLIO Agent*, *CLIO Kit*, *CLIO Core*, *CLIO Ingest*, *CLIO Transfer*, *CLIO Explore*, *CLIO Plugin*. The four engines also have nicknames in quotes: *"The Way In"*, *"The Mover"*, *"The Finder"*, *"The Connector"*.
- **Section headings — Title Case**: *Three-Layer Architecture*, *Core Capabilities*, *Six Engines, One Platform*.
- **Eyebrows — UPPERCASE + 0.2em tracking + mono**: `SYSTEM DESIGN`, `CORE CAPABILITIES`, `QUICK START`. Always above an H2.
- **CTAs — Title Case, no period**: *Get Started*, *Read the Docs*, *View on GitHub*.
- **Body — Sentence case** for everything else (lists, captions, tooltips).

### Punctuation & rhythm

- **Em-dash (—) for asides and apposition**, never the hyphen-space-hyphen pattern. *"CLIO — Context Layer for IO"*, *"From agent to infrastructure — a unified pipeline…"*.
- **The middle-dot (·)** separates badge phrases. *"Open Source · NSF Funded · Production Ready"*.
- **Arrows are real characters**: `→` for inline flow ("→ 2.4TB scanned"), not `->`. The arrow chevron in CTAs is an SVG, not a glyph.
- **`✓` checkmark and `✗` cross** appear in mono terminal output, colored by status (`✓` green, `✗` red).

### Emoji & icons in copy

- **No emoji in product copy.** The brand uses Heroicons-style line SVG icons and 1.5–2 px-stroke chevrons. The only emoji-adjacent glyphs are unicode arrows (`→`), checkmarks (`✓`), bullet (`·`), em-dash (`—`), and the cursor block (`▮`/CSS caret).
- **Numbers and short symbols are fine** as inline accents: *7.5×*, *14+*.

### Examples from the live site

> **Hero status badge:** Open Source · NSF Funded · Production Ready
>
> **Hero H1:** Context Engineering / for Autonomous AI Agents *(second line gradient cyan)*
>
> **Hero subtitle (mono):** `CLIO — Context Layer for IO▮`
>
> **Hero subtext:** The open-source platform that turns any AI agent into a science partner
>
> **Stat row:** **7.5×** faster workflows · **150+** tools & integrations · **25+** published papers · **5+** national labs · **$5M** NSF funded
>
> **Architecture eyebrow:** `SYSTEM DESIGN` → H2 *Three-Layer Architecture* → lede *"From agent to infrastructure — a unified pipeline for context-aware scientific computing"*
>
> **Terminal demo:**
> ```
> $ clio agent ask "Find El Niño anomalies"
> → Scanning 2.4 TB context store...
> → 23 anomaly clusters identified
> ✓ Prediction: 6 months earlier
> ```

---

## VISUAL FOUNDATIONS

### Color

A **bi-chromatic dark system**: pure-black canvas, two saturated accents (cyan + orange) on a foundation of desaturated slate-cyan text. Never a light mode.

| Token | Hex | Role |
|---|---|---|
| `--color-bg` | `#000000` | Page background. Real `#000`, not "near-black". Lets glow/blur effects pop. |
| `--color-surface` | `#0a0f1a` | Cards, nav bar (with `/80` + backdrop-blur), terminal frames. |
| `--color-surface-alt` | `#0f1f35` | Nested wells, mini terminal inside a card, hover background. |
| `--color-heading` | `#e0e8f0` | Headlines (H1–H4). Off-white with a cool tint, never pure white for type. |
| `--color-text` | `#4a90b5` | Default body. Desaturated slate-cyan — readable but recessed, lets accents lead. |
| `--color-muted` | `#5a778c` | Captions, labels, secondary info, inactive nav items. |
| `--color-border` | `#2d638b` | Card and divider lines. Almost always used at `/30`–`/60` opacity. |
| `--color-accent` | `#ea7b2a` | **Warm orange.** Primary CTAs ("Get Started"), the "Core" rail, stat numbers. |
| `--color-accent-cyan` | `#00d4db` | **Electric cyan.** Links, secondary CTAs, the "Agent" rail, terminal command words. |
| `--color-success` | `#34d399` | Available badge, "Active" pulsing dot, `✓` output. |
| `--color-warning` | `#fbbf24` | Coming-soon badge, in-dev. |
| `--color-error` | `#f87171` | Macros traffic-light, runtime errors. |

The two accents are deliberately complementary — cyan = data / intelligence / the agent layer; orange = computation / energy / the core engines. Most surfaces lean cyan; reserve orange for the primary action and Core-related elements so the colors stay legible as a signal.

### Type

| Family | Use | Weights actually used |
|---|---|---|
| **Oxanium** | Default UI sans. Slightly geometric, technical, faintly futuristic. All headings + body. | 400, 500, 600, 700, 800 |
| **JetBrains Mono** | Code, terminal, eyebrow labels, stats with `tabular-nums`, mini tags, version pills. | 400, 500, 600, 700 |
| **Bungee Spice** | **Wordmark-only.** The IOWarp text logo in the nav uses it. It is a variable-color display face (cyan→orange→pink built-in) — never use it for headlines, paragraphs, or anything longer than the brand name. | 400 |

Hero headline: `font-weight: 800`, `letter-spacing: -0.025em`, `line-height: 1.08`. Eyebrows: mono, `0.2em` tracking, uppercase, cyan. Body line-height: `1.6`.

### Spacing & layout

- **4-px base scale** (Tailwind defaults): `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 112`.
- **Section padding**: `py-28` (112px) vertical between sections is the canonical rhythm on the home page. Hero is `min-h-[92vh]`.
- **Containers**: `max-w-6xl` (72rem) is the standard content cap; `max-w-7xl` (80rem) for hero rows; `max-w-2xl`–`max-w-3xl` for lede paragraphs.
- **Grid gap**: `gap-2` (8px) within tight clusters; `gap-6`–`gap-8` for cards; `gap-12`–`gap-16` for two-column hero splits. Always use `gap` over manual margins on sibling elements.

### Backgrounds

The hero / capability sections layer **four** background elements over pure black:

1. **Atmospheric .webp image** (e.g. `assets/hero/clio-core-engines.webp`) — `opacity: 0.18`, `mix-blend-mode: lighten`, masked by a radial gradient that fades to transparent at the edges. Acts as a faint glowing texture, not a photo.
2. **A subtle dot/line grid** — `background-image: linear-gradient(rgba(0,212,219,0.09) 1px, transparent 1px), linear-gradient(90deg, …)`, `background-size: 48px 48px`, masked the same way.
3. **A radial glow** — `radial-gradient(ellipse 55% 45% at 50% 42%, rgba(0,212,219,0.12) 0%, transparent 70%)`.
4. **Floating orbs** — 200–300px circles, `filter: blur(60px)`, low-alpha cyan or orange, animated `float-slow 20s` (translate ±12px) — purely decorative, never interactive.

Plus a **fixed noise-overlay layer** sitting above everything else at `opacity: 0.025`, `pointer-events: none`, providing a faint film-grain texture across the entire site.

Outside the hero, sections are usually flat `--color-bg` or `--color-surface`, separated by a thin top/bottom border at `--color-border/20`.

**Gradients** in the foreground are rare. The two that exist:
- `gradient-text-cyan` — the second line of the hero ("for Autonomous AI Agents") — five-stop cyan→white→cyan→slate→cyan, animated background-position shimmer over 6s.
- `gradient-text-warm` — accent→heading at 135° — used once in a CTA emphasis word. Avoid otherwise.

### Animation & motion

Two scales: **subtle ambient** + **purposeful reveal**.

- **Reveal on scroll** — `.reveal-up`, `.reveal-scale`, `.reveal-blur` classes. `opacity 0→1`, `translateY 28px→0` (or `scale 0.96→1`), duration `700ms`, easing `cubic-bezier(0.16, 1, 0.3, 1)` (an emphasis ease — slow-in, fast settle). Staggered with `transition-delay: 0.08s, 0.16s, 0.24s…`.
- **Hero entrance** — `.hero-animate` keyframe `fade-in-up`, `0.9s` `cubic-bezier(0.16, 1, 0.3, 1)`, manually staggered `.anim-1`–`.anim-5` at 0.15s, 0.35s, 0.55s, 0.75s, 0.95s.
- **Floating orbs** — `float-slow 20s ease-in-out infinite`. Drift ±12px.
- **CTA breathing glow** — `glow-breathe 3s ease-in-out infinite`, oscillates a `box-shadow: 0 0 24–40px rgba(234,123,42,0.3–0.5)`.
- **Gradient shimmer on hero H1** — 6s, infinite, ease.
- **Typing cursor** — 1s `blink-caret` step-end after mono labels.
- **Flow drops** — 2s vertical `translateY` 0→200% on the lines connecting architecture layers; staggered 0/0.4/0.8s.
- **Status dot pulse** — `animate-ping`: an absolute-positioned twin scales 2× and fades to 0 over 1s, repeating, behind a solid dot.
- All animations have a `@media (prefers-reduced-motion: reduce)` killswitch that disables them.

**Default transition** is `300ms` `cubic-bezier(0.4, 0, 0.2, 1)` for hover/focus state changes. No bounce, no overshoot — the brand reads as engineered, not playful.

### Hover states

- **Cards** — border lifts from `--color-border/30` to full `--color-accent-cyan` *and* gain `box-shadow: 0 0 36px rgba(0,212,219,0.10)` plus a faint inner glow. Optionally `transform: translateX(4px)` for "rail" entries like the architecture layers.
- **Tile inner background** — shifts to a 135° gradient `surface-alt → rgba(0,212,219,0.04)`.
- **Icon chips** — `transform: scale(1.06)` and pick up a `box-shadow: 0 0 16px rgba(0,212,219,0.2)`.
- **Plain text links** — color shift to `--color-accent-cyan` (or `--color-accent` for orange-context).
- **Buttons** — primary scales `1.04`; secondary fades-in a background tint `bg-accent-cyan/8` and border `/60`.

### Press / active

The site doesn't define explicit `:active` states beyond the browser default. When you need one, use `transform: scale(0.98)` and drop the glow.

### Borders & dividers

- **Card outline** — `1px solid rgba(45,99,139, 0.3–0.6)` (the `--color-border` at low opacity).
- **Section separator** — `border-y border-border/20`. Almost invisible until it catches a backdrop-blurred section behind.
- **Accent rail** — a 4px-wide colored bar absolutely positioned on the **left** edge of "stack" cards, full-height, `border-radius: 14px 0 0 14px`. Cyan for Agent / Infrastructure rows, orange for the Core row.

### Shadow & glow system

The site uses **two-layer shadows**: a black outer drop for elevation, a colored glow for emphasis. They stack:

```css
box-shadow:
  0 20px 60px rgba(0, 0, 0, 0.5),     /* depth */
  0 0 40px rgba(0, 212, 219, 0.06);   /* mood */
```

For the orange primary CTA, the glow oscillates between `0 0 24px rgba(234,123,42,0.3)` and `0 0 40px rgba(234,123,42,0.5)`.

No inset shadows except subtle gradient-tint inset glows on hover: `inset 0 0 40px rgba(0,212,219,0.04)`.

### Transparency & blur

- **Nav bar** — `bg-[#000]/80` + `backdrop-blur-lg` once scrolled, with a `transition` on `border-color` + `box-shadow`. Until you scroll past 8px, it's a transparent nav.
- **Surface overlay** (stats strip) — `bg-surface/60 backdrop-blur-sm` to let the underlying hero glow bleed through.
- **Status badges** — `bg-surface/70 backdrop-blur-sm` over the hero image.
- **Mask gradients** — every atmospheric background image is wrapped in a `mask-image: radial-gradient(ellipse … rgba(0,0,0,0.7) 10%, transparent 75%)` so the image fades to the page background at the section edges. This is the brand's signature "image bleeds through a vignette" treatment.

### Corner radii (typical pairings)

| Element | Radius |
|---|---|
| Mini chip / tag | `--radius-md` (6px) |
| Button | `--radius-xl` (12px) |
| Card | `--radius-xl` (12px) — sometimes `14px` for "hero artifact" frames |
| Hero artifact frame | `14px` (custom, between xl and 2xl) |
| Bento grid (outer) | `--radius-2xl` (16–18px) with internal `gap: 3px` so a thin border peeks through |
| Status badge / pill | `9999px` |
| Avatar / accent dot | `50%` |

### Card recipe

A canonical CLIO card looks like:

```
background:        var(--color-surface-alt);
border:            1px solid rgba(45,99,139, 0.3);
border-radius:     12px–14px;
padding:           1rem (mini) / 1.5rem (standard) / 2rem (hero);
overflow:          hidden; ← critical: many cards use absolutely-positioned accents
transition:        all 350ms cubic-bezier(0.16, 1, 0.3, 1);
:hover {
  border-color:    var(--color-accent-cyan);
  box-shadow:      0 0 36px rgba(0,212,219,0.10),
                   inset 0 0 36px rgba(0,212,219,0.03);
}
```

Inside: a 36-px icon chip with cyan/20 fill and cyan border, an H3 in heading color, a paragraph in body text color, and optional pill tags or mini terminal.

### Image treatment

All hero `.webp` diagrams ship at `1920×1080` and are technical isometric / circuit-board illustrations in a **cool-blue palette** with cyan and orange glow accents — never warm photos, never people, never stock. When placed atmospherically (behind text) they are knocked back to `opacity: 0.18`, `filter: saturate(0.7) brightness(0.8)`, and `mix-blend-mode: lighten` over black. The base saturation is already low — the brand reads as a dark cockpit, not a marketing site.

### Layout rules / fixed elements

- The **noise overlay** is `position: fixed`, `z-index: 200`, `pointer-events: none`, full viewport. Always above content, never below.
- The **nav** is `position: sticky`, `top: 0`, `z-index: 50`. It changes from transparent to `surface/80 + backdrop-blur + bottom-border` after `scrollY > 8px`.
- A **scroll-hint chevron** lives `position: absolute; bottom: 32px; left: 50%` of the hero, bouncing vertically 2.5s infinite.

---

## ICONOGRAPHY

The brand uses **inline SVG line icons in a Heroicons style** — stroke-only, `stroke-width: 1.8–2`, `stroke-linecap: round`, `stroke-linejoin: round`, `currentColor` for color. No icon font is shipped; each icon is hand-placed as inline `<svg>`.

When recreating UI:

- **Don't draw your own icons** — copy from the [Heroicons](https://heroicons.com/) outline set or load it from CDN. The site uses identical paths for: search (`circle r=8 + l-4.35-4.35`), book/docs, chevron-down, arrow-right, lightning bolt, magnifying glass, code brackets, screen, upload, etc.
- A Heroicons recipe is built into the UI kit (see `ui_kits/website/Icon.jsx`).
- **GitHub icon** uses its canonical filled mark (the Octocat path), at currentColor.

**Sizes**: small inline (`w-3.5 h-3.5`, 14px) inside chevrons / tags; standard (`w-4 h-4`, 16px) in nav and links; medium (`w-5 h-5`, 20px) in card icon chips; large (`w-6 h-6`, 24px) for primary actions.

**Color**: icons inherit `text-muted` in resting state, `text-accent-cyan` on hover or in active state, `text-accent` (orange) in Core-themed surfaces.

**Logos shipped in `assets/brand/`**:

| File | Use |
|---|---|
| `iowarp-logo.png` (and `.webp`) | Square IOWarp project logo (32×32 in the nav, scales up). |
| `clio-icon-{64,128,256,lg}.png` | Square CLIO mark — for favicons, app icons, embeds. |
| `clio-lockup-cyan.{png,webp}` | Compact cyan wordmark — terminal artifact bar, dark backgrounds. |
| `clio-lockup-dark.png` | Lockup tuned for dark backgrounds. |
| `clio-lockup-light.png` | Lockup tuned for light backgrounds. |
| `clio-lockup-white.png` | Pure-white wordmark for over imagery. |
| `clio-lockup-md.png` | Mid-size lockup for headers / docs. |

**Atmospheric imagery shipped in `assets/hero/`** (8 isometric `.webp` diagrams covering Agent, Core Engines, Kit Grid, Data-Flow Pipeline, Multi-Agent, Platform Architecture, Quickstart Terminal, Storage Tiers). Use these as the soft background image behind a section; never as the foreground hero.

**Emoji and unicode glyphs**: only `→`, `✓`, `✗`, `·`, `—`, `▮` (or animated CSS caret), and `★` for the rare "rating" context. No `🚀`, `✨`, `🎉`, etc. — they break the engineered, scientific tone.

---

## UI kits

| Path | Product | What's inside |
|---|---|---|
| [`ui_kits/website/`](ui_kits/website/README.md) | **iowarp.ai marketing site** | A high-fidelity React + JSX recreation of the home page: top nav, hero with terminal artifact, stats strip, three-layer architecture, six-engine bento grid, quickstart terminal, CTA band, and footer. Click-through across screens (Home → Platform → Kit → Docs). Pixel-aligned to the live site's CSS tokens. |

> Only the marketing website was attached to this design system. The CLIO Agent IDE, CLIO Kit catalogue, and docs hub each have their own visual surfaces — if you need those, point the design system at `iowarp/clio-agent`, `iowarp/clio-kit`, or `iowarp/iowarp` to extend the system.

---

## Caveats & notes

- **No design tokens file on the website** — all tokens were lifted out of the compiled Tailwind v4 `@theme` block in `_astro/about.E-XxSyBn.css`. They are accurate but may evolve when the site rebuilds.
- **Bungee Spice is a variable-color display font** — it ships its own cyan→orange→pink color gradient as part of the font outlines. Never re-color it, never use it at body sizes, never set it on long strings.
- The site uses Tailwind v4 with arbitrary-value classes (`text-[#00d4db]`, `bg-[#0a0f1a]/50`). The UI kit in this design system uses plain CSS + the tokens in `colors_and_type.css` so artifacts are portable.
