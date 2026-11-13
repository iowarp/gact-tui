import type { LanguageModelPreset } from '@clio/core/v3';
import { t } from '@lingui/core/macro';

/**
 * Names for a bare provider id, used ONLY where no service data (preset or
 * catalog entry) is at hand — an agent's recorded default provider, a tool
 * result's label. Wherever the service reports a provider, its `label`/`name`
 * is the one display name. Kept equal to the service's canonical labels.
 * Product names, never translated; `modelRouteName` also matches against them.
 */
const providerIdNames: Record<string, string> = {
  amsc_mag: 'AmSC Model Access Gateway', // i18n-ignore: product name
  codex: 'OpenAI Codex', // i18n-ignore: product name
  claude_code: 'Claude Code', // i18n-ignore: product name
  copilot: 'GitHub Copilot', // i18n-ignore: product name
  inception: 'Inception (Mercury)', // i18n-ignore: product name
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  lm_studio: 'LM Studio', // i18n-ignore: product name
  ollama: 'Ollama',
  llama_cpp: 'llama.cpp',
  vertex_ai: 'Vertex AI', // i18n-ignore: product name
  bedrock: 'Amazon Bedrock', // i18n-ignore: product name
  vllm: 'vLLM',
  argonne_metis: 'ALCF Metis', // i18n-ignore: product name
  argonne_sophia: 'ALCF Sophia', // i18n-ignore: product name
  argonne_minerva: 'ALCF Minerva', // i18n-ignore: product name
  argonne_tara: 'ALCF Tara', // i18n-ignore: product name
  argonne_local_vllm: 'vLLM',
};

/**
 * Return the product-facing name for a provider: the service's own label when
 * a preset is known, else a service-reported name or id passed as fallback.
 */
export function providerDisplayName(
  preset: LanguageModelPreset | undefined,
  fallbackName?: string,
): string {
  return (
    preset?.label ||
    (fallbackName ? providerIdNames[fallbackName] : undefined) ||
    fallbackName ||
    t`Provider`
  );
}

/**
 * Provider ids that resolve to DIFFERENT artwork than their own name (an
 * alias, a shared vendor mark for a family of ids, or a neutral fallback for
 * a mark this workspace cannot license — see
 * web/public/provider-logos/README.md for what each file is and why). A
 * provider id absent from this table resolves to artwork of the SAME name
 * (see `providerLogoId`'s fallback) — e.g. `mistral` -> `mistral.svg`.
 */
export const providerLogoIds: Record<string, string> = {
  amsc_mag: 'amsc',
  aws_bedrock: 'amazon-bedrock',
  azure_openai: 'azure',
  bedrock: 'amazon-bedrock',
  codex: 'openai',
  claude_code: 'anthropic',
  copilot: 'github-copilot',
  gemini: 'google',
  google_gemini: 'google',
  google_vertex: 'google',
  // llama.cpp's official icon from ggml-org/llama.brand (see README).
  llama_cpp: 'llama-cpp',
  lm_studio: 'lmstudio',
  nvidia_nim: 'nvidia',
  ollama: 'ollama',
  openrouter: 'openrouter',
  vertex_ai: 'google',
  vllm: 'vllm',
  // Argonne National Laboratory's triangle mark (public domain, see README).
  argonne_metis: 'argonne',
  argonne_sophia: 'argonne',
  argonne_minerva: 'argonne',
  argonne_tara: 'argonne',
  argonne_local_vllm: 'argonne',
};

/**
 * Provider kinds whose official client the service installs and updates in
 * place (its provider components), each with the vendor that publishes the
 * client. Kept equal to clio-agent's `providers/components/registry.py`.
 */
const managedClientVendors: Record<string, string> = {
  codex: 'OpenAI',
  claude_code: 'Anthropic',
  copilot: 'GitHub',
};

/** The vendor of a provider kind's service-managed client, or undefined when it has none. */
export function providerManagedClientVendor(providerKind: string | undefined): string | undefined {
  return providerKind ? managedClientVendors[providerKind] : undefined;
}

/**
 * The route as the model label writes it: lowercase, without the vendor word its
 * logo already shows (OpenAI Codex → codex, GitHub Copilot → copilot).
 */
export function modelRouteName(providerId: string, providerName: string): string {
  const vendor = managedClientVendors[providerId] ?? providerIdNames[providerLogoId(providerId)];
  const name = providerName.trim();
  const rest =
    vendor && name.toLowerCase().startsWith(`${vendor.toLowerCase()} `)
      ? name.slice(vendor.length).trim()
      : name;
  return rest.toLowerCase();
}

/** Map CLIO provider identities to artwork packaged with the workspace. */
export function providerLogoId(providerId: string): string {
  return providerLogoIds[providerId] ?? providerId;
}
