import type { LanguageModelPreset } from '@clio/core/v3';

const providerNames: Record<string, string> = {
  codex: 'OpenAI Codex',
  claude_code: 'Claude',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  lm_studio: 'LM Studio',
  ollama: 'Ollama',
  argonne_metis: 'ALCF Metis',
  argonne_sophia: 'ALCF Sophia',
  argonne_local_vllm: 'vLLM',
};

const providerSummaries: Record<string, string> = {
  codex: 'Use models included with your Codex subscription.',
  claude_code: 'Use models included with your Claude subscription.',
  openai: 'Use OpenAI models connected to this agent.',
  anthropic: 'Use Anthropic models connected to this agent.',
  openrouter: 'Use models available through your OpenRouter account.',
  lm_studio: 'Use models served by LM Studio on the connected agent.',
  ollama: 'Use models served by Ollama on the connected agent.',
  argonne_metis: 'Use Metis models available through your ALCF account.',
  argonne_sophia: 'Use Sophia models available through your ALCF account.',
  argonne_local_vllm: 'Use a compatible model service connected to this agent.',
};

/** Return the product-facing name for a provider preset. */
export function providerDisplayName(
  preset: LanguageModelPreset | undefined,
  fallbackName?: string,
): string {
  return (
    (preset ? providerNames[preset.id] : undefined) ??
    (fallbackName ? providerNames[fallbackName] : undefined) ??
    fallbackName ??
    preset?.label ??
    'Provider'
  );
}

/** Explain a provider in product language rather than exposing its adapter details. */
export function providerSummary(
  preset: LanguageModelPreset | undefined,
  fallbackName?: string,
): string {
  return (
    (preset ? providerSummaries[preset.id] : undefined) ??
    `Use models made available by ${fallbackName || preset?.label || 'this provider'}.`
  );
}

/** Map CLIO provider identities to models.dev artwork used by AI Elements. */
export function providerLogoId(providerId: string): string {
  const logoIds: Record<string, string> = {
    codex: 'openai',
    claude_code: 'anthropic',
    lm_studio: 'lmstudio',
    ollama: 'llama',
    argonne_metis: 'openai',
    argonne_sophia: 'openai',
    argonne_local_vllm: 'openai',
  };
  return logoIds[providerId] ?? providerId;
}
