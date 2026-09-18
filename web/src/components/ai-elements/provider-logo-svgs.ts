// Provider vendor-mark artwork, inlined at build time via `?raw` imports of
// the SAME files that ship (for direct URL reference and easy auditing) at
// web/public/provider-logos/*.svg — see that directory's README.md for each
// file's upstream source, pinned commit, and license.
//
// Imported as raw SVG source (not <img src="/provider-logos/...">) so
// ModelSelectorLogo can inline the markup into the DOM: each file's root
// carries `fill="currentColor"`, which only takes effect when the SVG is
// part of the page's own DOM, inheriting the surrounding text color (light
// vs dark theme, hover states, ...). An <img>-loaded SVG renders in an
// isolated context and would stay whatever color it was drawn in.
import amazonBedrock from '../../../public/provider-logos/amazon-bedrock.svg?raw';
import anthropic from '../../../public/provider-logos/anthropic.svg?raw';
import azure from '../../../public/provider-logos/azure.svg?raw';
import deepseek from '../../../public/provider-logos/deepseek.svg?raw';
import generic from '../../../public/provider-logos/generic.svg?raw';
import google from '../../../public/provider-logos/google.svg?raw';
import groq from '../../../public/provider-logos/groq.svg?raw';
import huggingface from '../../../public/provider-logos/huggingface.svg?raw';
import lmstudio from '../../../public/provider-logos/lmstudio.svg?raw';
import mistral from '../../../public/provider-logos/mistral.svg?raw';
import nvidia from '../../../public/provider-logos/nvidia.svg?raw';
import ollama from '../../../public/provider-logos/ollama.svg?raw';
import openai from '../../../public/provider-logos/openai.svg?raw';
import openrouter from '../../../public/provider-logos/openrouter.svg?raw';
import vllm from '../../../public/provider-logos/vllm.svg?raw';
import xai from '../../../public/provider-logos/xai.svg?raw';

/** The neutral placeholder id — never a fabricated vendor mark. */
export const GENERIC_PROVIDER_LOGO_ID = 'generic';

/**
 * Provider logo id (see `providerLogoId()`, `@/lib/provider-presentation`)
 * -> raw SVG source. Every id `providerLogoId` can resolve to has an entry
 * here; `provider-presentation.test.ts`'s `every_logo_id_has_a_file` proves
 * the packaged file behind each one still exists.
 */
export const providerLogoSvgs: Record<string, string> = {
  'amazon-bedrock': amazonBedrock,
  anthropic,
  azure,
  deepseek,
  [GENERIC_PROVIDER_LOGO_ID]: generic,
  google,
  groq,
  huggingface,
  lmstudio,
  mistral,
  nvidia,
  ollama,
  openai,
  openrouter,
  vllm,
  xai,
};
