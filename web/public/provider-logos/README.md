# Provider logo sources

Every icon here is either an official vendor mark pinned to an upstream
commit, or an explicit, documented neutral placeholder — never a hand-drawn
approximation of a vendor's mark. All files are inlined via `?raw` imports
(see `web/src/components/ai-elements/provider-logo-svgs.ts`) so `currentColor`
adapts to light/dark theme; each SVG's root element carries
`fill="currentColor"` and `aria-hidden="true"` (the accessible name comes
from the wrapping `<span role="img" aria-label>` in `ModelSelectorLogo`, not
from the inlined markup). Any upstream `<title>`/`<desc>` element is stripped
on import: once inlined into the DOM, a `<title>` becomes real visible/
tooltip text sitting right next to the provider's own accessible label (and
can collide with it, e.g. two "LM Studio" matches in the same dialog) — the
wrapping span's `aria-label` is the ONLY accessible name this markup should
carry. `provider-logo-svgs.test.ts` asserts no registered SVG contains one.

## simple-icons (CC0)

Copied without path changes from the simple-icons `master` release at commit
[`f5070fa7439aa9aa7ba6a05dd86b74b2bdc9cc1e`](https://github.com/simple-icons/simple-icons/tree/f5070fa7439aa9aa7ba6a05dd86b74b2bdc9cc1e).

| File | Upstream path |
| --- | --- |
| `anthropic.svg` | `icons/anthropic.svg` |
| `google.svg` | `icons/googlegemini.svg` (the Gemini mark — every CLIO id that resolves here, `gemini`/`google_gemini`/`google_vertex`/`vertex_ai`, is a Gemini API route, not Google's general-purpose "G") |
| `mistral.svg` | `icons/mistralai.svg` |
| `deepseek.svg` | `icons/deepseek.svg` |
| `huggingface.svg` | `icons/huggingface.svg` |
| `ollama.svg` | `icons/ollama.svg` |
| `lmstudio.svg` | `icons/lmstudio.svg` |
| `vllm.svg` | `icons/vllm.svg` |
| `nvidia.svg` | `icons/nvidia.svg` |
| `openrouter.svg` | `icons/openrouter.svg` |

simple-icons is distributed under [CC0](https://github.com/simple-icons/simple-icons/blob/f5070fa7439aa9aa7ba6a05dd86b74b2bdc9cc1e/LICENSE.md)
(the icon *redrawings* are public domain; the marks themselves remain
trademarks of their respective owners, used here only to identify the
provider).

Upstream: https://github.com/simple-icons/simple-icons

## lobehub/lobe-icons (MIT)

simple-icons has removed OpenAI, Groq, and xAI/Grok over trademark takedown
requests (there is no CC0-licensed source for these three), so these three
come from lobehub/lobe-icons instead — a maintained, MIT-licensed AI/LLM
brand-icon package used by several other agent UIs for the same purpose.
Copied from the `master` branch at commit
[`a94750e3f5f8fc33757b839d85030e742284e43a`](https://github.com/lobehub/lobe-icons/tree/a94750e3f5f8fc33757b839d85030e742284e43a).

| File | Upstream path |
| --- | --- |
| `openai.svg` | `packages/static-svg/icons/openai.svg` (also used for the `codex` provider id — Codex is OpenAI's own coding product) |
| `groq.svg` | `packages/static-svg/icons/groq.svg` |
| `xai.svg` | `packages/static-svg/icons/xai.svg` (upstream titles this file "Grok"; it is xAI's mark, used for the `xai` provider id) |

lobe-icons' packaging is [MIT-licensed](https://github.com/lobehub/lobe-icons/blob/a94750e3f5f8fc33757b839d85030e742284e43a/LICENSE);
the underlying marks remain trademarks of OpenAI and xAI respectively, used
here only to identify the provider.

Upstream: https://github.com/lobehub/lobe-icons

## ggml-org/llama.brand (official llama.cpp brand assets)

`llama-cpp.svg` is the official llama.cpp icon from the ggml-org brand
repository, `icon/icon-dark.svg` at commit
[`0708f2327336589bd4d3eba15a95199c318cd771`](https://github.com/ggml-org/llama.brand/tree/0708f2327336589bd4d3eba15a95199c318cd771)
(used for the `llama_cpp` provider id). The upstream file is drawn in
`#FAFAFA`; the fill is moved to `currentColor` on the root so it follows the
theme. The repository publishes the assets as the project's official brand
kit without a separate license file; the mark remains ggml-org's, used here
only to identify the provider.

Upstream: https://github.com/ggml-org/llama.brand

## Argonne National Laboratory (public domain)

`argonne.svg` is the coloured triangle mark of the Argonne National
Laboratory logo, taken from Wikimedia Commons
[`File:Argonne National Laboratory logo.svg`](https://commons.wikimedia.org/wiki/File:Argonne_National_Laboratory_logo.svg)
(sha1 `2d9b23ef3bd50df685ccb0baed1636e377b75dee`, licensed there as public
domain: a work of a U.S. federal laboratory). Only the seven coloured paths of
the mark are kept and the `viewBox` is cropped to them (`86.7 0 24.2 21`);
the wordmark is dropped. The colours are the vendor's own and are NOT
switched to `currentColor` (a multi-colour mark). Used for `argonne_metis`,
`argonne_sophia` and `argonne_local_vllm`.

## Neutral (no licensable official mark)

| File | Used for | Why |
| --- | --- | --- |
| `generic.svg` | Any unrecognized provider id | A plain four-point sparkle glyph, hand-drawn for this workspace — explicitly a placeholder, never presented as a vendor mark |
| `amazon-bedrock.svg`, `azure.svg` | `bedrock` / `aws_bedrock`, `azure_openai` | Pre-existing hand-drawn glyphs, out of scope for this pass (AWS/Azure have no CC0-licensed marks either; left as a follow-up rather than guessed at) |

## Adding a provider

1. Check simple-icons first (`icons/<slug>.svg` at a pinned commit — CC0).
2. If simple-icons lacks it, check lobehub/lobe-icons (`packages/static-svg/icons/<slug>.svg` — MIT packaging, vendor trademark).
3. If neither has it, use `generic.svg` and say so in this file — never hand-draw a new "logo".
4. Map the provider id to the filename in `providerLogoId()`
   (`web/src/lib/provider-presentation.ts`) only if the id differs from the
   filename; otherwise the identity fallback already resolves it.
5. Add the raw import to `web/src/components/ai-elements/provider-logo-svgs.ts`.
