---
name: clio-design
description: Use this skill to generate well-branded interfaces and assets for IOWarp / CLIO (Context Layer for IO) — the NSF-funded open-source context engineering platform for autonomous AI agents in scientific computing. Contains essential design guidelines, colors, type, fonts, brand assets, and a website UI kit for production or throwaway prototyping.
user-invocable: true
---

Read the `README.md` file within this skill — it is the single source of truth for the CLIO / IOWarp brand. Then explore the other files in this folder:

- `colors_and_type.css` — canonical CSS custom properties (drop-in tokens for any HTML artifact).
- `fonts/` — self-hosted Oxanium (sans), JetBrains Mono (mono), and Bungee Spice (wordmark-only display) `.ttf` files. Reference them via the `@font-face` block at the top of `colors_and_type.css`.
- `assets/brand/` — IOWarp project logo and CLIO icon / lockup variants. Use these directly, never redraw the wordmark.
- `assets/hero/` — atmospheric `.webp` diagrams designed to sit behind sections at low opacity. Never use as a foreground hero image.
- `preview/` — small reference cards demonstrating tokens, components, and patterns in isolation.
- `ui_kits/website/` — high-fidelity React + JSX recreation of `iowarp.ai`. Lift components (Nav, Hero, Stats, Bento, Footer, Icon, etc.) from there when assembling new marketing surfaces.

## When using this skill

If you're creating a **visual artifact** (slides, mockups, throwaway prototypes, marketing pages, internal-tool UI), copy assets out of `assets/` and `fonts/` into your output folder, then build static HTML against `colors_and_type.css`. Reuse JSX components from `ui_kits/website/` whenever the surface overlaps with the marketing site.

If you're working on **production code**, treat `colors_and_type.css` as the design-token contract and pull values into your existing CSS / Tailwind / Stitches config. The brand asset files in `assets/brand/` are production-ready PNGs/WebPs.

## House style — the rules that matter most

- **Dark only.** Background is pure `#000000`. There is no light mode.
- **Two accents, one signal each.** Cyan `#00d4db` = data / intelligence / Agent layer; Orange `#ea7b2a` = compute / energy / Core layer + the primary CTA. Don't mix them in a single emphasis cluster.
- **Three fonts, three jobs.** Oxanium for all UI text. JetBrains Mono for terminal, eyebrows, tags, and any number with `tabular-nums`. Bungee Spice ONLY for the literal IOWarp wordmark — it is a multi-color display face and breaks if used otherwise.
- **No emoji.** Use Heroicons-style outline SVGs and the unicode set `→ ✓ ✗ · — ▮`.
- **Third-person product voice.** *"CLIO orchestrates…"* not *"We built…"*. No marketing fluff (revolutionary, seamless, magical, AI-powered).
- **Numbers as proof.** `7.5×`, `150+`, `25+`, `5+`, `$5M` — render stat numbers in orange and `tabular-nums`.
- **Reveals are slow and emphatic.** `700ms` with `cubic-bezier(0.16, 1, 0.3, 1)`. Hovers are quick (`300ms`, `cubic-bezier(0.4, 0, 0.2, 1)`). No bouncing, no overshoot — CLIO reads as engineered, not playful.
- **Atmospheric backgrounds, not hero photos.** Layer: noise overlay (z-200, opacity 0.025) > black canvas > radial cyan glow > faint grid (`background-size: 48px 48px`) > one `.webp` diagram at `opacity 0.18`, `mix-blend-mode: lighten`, masked by a radial vignette.

## If invoked without any other context

Ask the user what they want to build (a slide, a marketing page, a docs page, a prototype, a deck, an app screen), ask a few clarifying questions about scope and audience, then act as an expert designer who outputs HTML artifacts — or production code, depending on the need. Default to the patterns documented in `README.md` and the components in `ui_kits/website/` rather than re-deriving the look and feel.
