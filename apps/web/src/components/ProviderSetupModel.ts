/** A preset as it actually arrives on the wire from `/v1/providers/lm`. */
export interface LmPreset {
  id: string;
  label: string;
  provider: string;
  api_base?: string;
  suggested_model?: string;
  requires_api_key?: boolean;
  api_key_env?: string;
  auth_method?: string;
  is_authenticated?: boolean;
  description?: string;
  status?: string;
  status_message?: string;
}

export interface LmSelectionBody {
  provider: string;
  api_base: string;
  model: string;
  api_key?: string;
}

/** A preset is "ready" when clio reports its runtime status as ready. */
export function isReady(preset: LmPreset): boolean {
  return (preset.status ?? '').toLowerCase() === 'ready';
}

/** A preset needs a key from the user before it can be used. */
export function needsKey(preset: LmPreset): boolean {
  return preset.requires_api_key === true && !isReady(preset);
}

export function orderPresets(presets: readonly LmPreset[]): LmPreset[] {
  const rank = (preset: LmPreset): number => {
    if (isReady(preset)) return 0;
    if (needsKey(preset)) return 1;
    return 2;
  };
  return presets
    .map((preset, index) => ({ preset, index }))
    .sort((a, b) => rank(a.preset) - rank(b.preset) || a.index - b.index)
    .map((entry) => entry.preset);
}

export function whatIsThis(preset: LmPreset): string {
  const byId: Record<string, string> = {
    claude_code: 'Uses your existing Claude Code subscription on this machine. No API key needed.',
    codex: 'Uses your existing ChatGPT / Codex subscription on this machine. No API key needed.',
    argonne_sophia:
      'Argonne ALCF Sophia models, signed in with your lab identity. No key to paste.',
    argonne_metis: 'Argonne ALCF Metis models, signed in with your lab identity. No key to paste.',
    argonne_local_vllm: 'A local vLLM server you run yourself. No key needed.',
    lm_studio: 'Models running locally in LM Studio on this computer. No key needed.',
    ollama: 'Models running locally via Ollama on this computer. No key needed.',
    anthropic: 'Anthropic models, billed to your own Anthropic API key.',
    openai: 'OpenAI models (GPT-4o, etc.), billed to your own OpenAI API key.',
    openrouter: 'Many models through one gateway, billed to your OpenRouter key.',
  };
  return byId[preset.id] ?? (preset.description ?? '').trim();
}

export function statusChip(preset: LmPreset): { label: string; tone: 'ready' | 'key' | 'setup' } {
  if (isReady(preset)) return { label: 'Ready', tone: 'ready' };
  if (needsKey(preset)) return { label: 'Needs key', tone: 'key' };
  return { label: 'Needs setup', tone: 'setup' };
}

export function providerSelectionBody(preset: LmPreset, apiKey = ''): LmSelectionBody {
  const key = apiKey.trim();
  const body: LmSelectionBody = {
    provider: preset.id,
    api_base: preset.api_base ?? '',
    model:
      preset.suggested_model && preset.suggested_model.length > 0 ? preset.suggested_model : '',
  };
  if (key.length > 0) body.api_key = key;
  return body;
}
