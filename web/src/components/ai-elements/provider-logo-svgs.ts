// Public URLs for the audited provider marks in web/public/provider-logos.
// They are rendered as CSS masks by ModelSelectorLogo so the source remains a
// single packaged asset and the mark still inherits the surrounding text color.
// Importing public assets with Vite's `?raw` suffix is unsupported and caused
// the desktop dev WebView to render missing-image placeholders.

/** The neutral placeholder id — never a fabricated vendor mark. */
export const GENERIC_PROVIDER_LOGO_ID = 'generic';

const PROVIDER_LOGO_IDS = [
  'amazon-bedrock',
  'anthropic',
  'argonne',
  'azure',
  'deepseek',
  GENERIC_PROVIDER_LOGO_ID,
  'google',
  'groq',
  'huggingface',
  'llama-cpp',
  'lmstudio',
  'mistral',
  'nvidia',
  'ollama',
  'openai',
  'openrouter',
  'vllm',
  'xai',
] as const;

/** Provider logo id to its packaged, same-origin SVG URL. */
export const providerLogoUrls: Record<string, string> = Object.fromEntries(
  PROVIDER_LOGO_IDS.map((id) => [id, `/provider-logos/${id}.svg`]),
);
