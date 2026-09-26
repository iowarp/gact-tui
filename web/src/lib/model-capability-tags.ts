import { vocab } from './brand-vocabulary';
import type { ClioModelOption } from './model-options';

/**
 * A model's capability tags in ONE normalized shape -- the UI half of the
 * model-capability tags work (M1). The axes follow the capability ontology
 * (input/output modalities, capabilities, model type, domain) and every tag
 * carries the evidence it was derived from, so a tooltip can say where a
 * claim came from. Unknown is simply absent: nothing is ever guessed.
 *
 * Today the tags are derived from the catalog's existing capability fields by
 * `modelCapabilityTagsFromOption`; when M1's tag records reach the client,
 * only that adapter changes.
 */
export type ModelCapabilityAxis =
  | 'input_modality'
  | 'output_modality'
  | 'capability'
  | 'role'
  | 'task'
  | 'domain'
  | 'price'
  | 'kind'
  | 'context';

export interface ModelCapabilityEvidence {
  /** Who stated it: `server_report`, `models.dev`, `litellm`, `user`, ... */
  source: string;
  /** The exact field the value was read from, e.g. `native_tool_calling`. */
  field: string;
}

export interface ModelCapabilityTag {
  axis: ModelCapabilityAxis;
  /** The tag's value: a modality (`image`), a capability (`tool_calling`),
   * a role (`surrogate`), a task (a model type such as `image_generation`), a
   * domain, `free`, a kind (`router` / `free_router`), or a context size in
   * tokens (as a string). */
  value: string;
  /** At least one; the first is the winning source. */
  evidence: readonly ModelCapabilityEvidence[];
}

/**
 * Tags every chat model carries (text in, text out). They exist for filtering
 * -- they are the default filter -- but a row does not show them: on every row
 * they would be noise.
 */
export function isBaselineTag(tag: ModelCapabilityTag): boolean {
  return (
    (tag.axis === 'input_modality' || tag.axis === 'output_modality') && tag.value === 'text'
  );
}

function evidenceFor(option: ClioModelOption, field: string): ModelCapabilityEvidence[] {
  const provenance = option.capabilityProvenance?.[field];
  return [{ source: provenance?.source || 'catalog', field }];
}

/**
 * Adapter: the tags a model option's current catalog fields support. Only a
 * stated value becomes a tag -- a model with no reported modalities gets no
 * modality tags, a model whose tool support is unreported gets no tools tag.
 */
export function modelCapabilityTagsFromOption(option: ClioModelOption): ModelCapabilityTag[] {
  const tags: ModelCapabilityTag[] = [];
  if (option.providerId === 'openrouter' && option.id.startsWith('openrouter/')) {
    // OpenRouter's own routing endpoints (its model ids under `openrouter/`).
    tags.push({
      axis: 'kind',
      value: option.id === 'openrouter/free' ? 'free_router' : 'router',
      evidence: [{ source: 'catalog', field: 'model_id' }],
    });
  }
  if (option.free === true) {
    tags.push({ axis: 'price', value: 'free', evidence: evidenceFor(option, 'free') });
  }
  const modalities = option.modalities ?? [];
  // A model a chat endpoint offers takes and returns text unless the service
  // knows it is another type (it then says `chat_selectable: false` and names
  // the type) -- true even when its modality list was never reported.
  const chat =
    option.chatSelectable !== false && (!option.modelType || option.modelType === 'chat');
  if (!modalities.includes('text') && chat) {
    tags.push({
      axis: 'input_modality',
      value: 'text',
      evidence: evidenceFor(option, 'chat_selectable'),
    });
  }
  for (const modality of modalities) {
    tags.push({
      axis: 'input_modality',
      value: modality,
      evidence: evidenceFor(option, 'modalities'),
    });
  }
  if (chat) {
    tags.push({
      axis: 'output_modality',
      value: 'text',
      evidence: evidenceFor(option, option.modelType === 'chat' ? 'model_type' : 'chat_selectable'),
    });
  }
  if (option.modelType && option.modelType !== 'chat') {
    tags.push({ axis: 'role', value: 'surrogate', evidence: evidenceFor(option, 'model_type') });
    tags.push({ axis: 'task', value: option.modelType, evidence: evidenceFor(option, 'model_type') });
  }
  if (option.toolCalling === true) {
    tags.push({
      axis: 'capability',
      value: 'tool_calling',
      evidence: evidenceFor(option, 'native_tool_calling'),
    });
  }
  if (option.reasoning?.levels.length) {
    tags.push({ axis: 'capability', value: 'reasoning', evidence: evidenceFor(option, 'reasoning') });
  }
  if (option.contextWindow && option.contextWindow > 0) {
    tags.push({
      axis: 'context',
      value: String(option.contextWindow),
      evidence: evidenceFor(option, 'context_window'),
    });
  }
  return tags;
}

const MODALITY_LABELS: Record<string, string> = {
  image: 'Vision',
  audio: 'Audio',
  video: 'Video',
  pdf: 'PDF',
};

const CAPABILITY_LABELS: Record<string, string> = {
  tool_calling: 'Tools',
  parallel_tool_calls: 'Parallel tools',
  reasoning: 'Reasoning',
  structured_output: 'Structured output',
  web_search: 'Web search',
  code_execution: 'Code execution',
  computer_use: 'Computer use',
  prompt_caching: 'Prompt caching',
  long_context: 'Long context',
};

/** "200K", "1M", "32K": a context size as people say it. */
export function formatContextSize(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

/** What each model type does, as a noun ("Image generator"). */
export const TASK_LABELS: Record<string, string> = {
  embedding: 'Embeddings',
  rerank: 'Reranker',
  audio_transcription: 'Transcriber',
  audio_speech: 'Speech generator',
  image_generation: 'Image generator',
  image_edit: 'Image editor',
  video_generation: 'Video generator',
  moderation: 'Moderator',
  ocr: 'Text reader',
  segmentation: 'Segmenter',
  classification: 'Classifier',
  forecasting: 'Forecaster',
  scientific_surrogate: 'Scientific surrogate',
  other: 'Other model',
};

/** The short label a tag shows ("Vision", "Tools", "200K"). */
export function modelCapabilityTagLabel(tag: ModelCapabilityTag): string {
  switch (tag.axis) {
    case 'role':
      return tag.value === 'surrogate' ? 'Surrogate' : sentenceCase(tag.value);
    case 'task':
      return TASK_LABELS[tag.value] ?? sentenceCase(tag.value.replaceAll('_', ' '));
    case 'price':
      return 'Free';
    case 'kind':
      return tag.value === 'free_router' ? 'Free router' : 'Router';
    case 'context':
      return formatContextSize(Number(tag.value));
    case 'input_modality':
      return tag.value === 'text' ? 'Text in' : (MODALITY_LABELS[tag.value] ?? sentenceCase(tag.value));
    case 'output_modality':
      return tag.value === 'text' ? 'Text out' : `Makes ${tag.value}`;
    case 'capability':
      return CAPABILITY_LABELS[tag.value] ?? sentenceCase(tag.value.replaceAll('_', ' '));
    default:
      return sentenceCase(tag.value.replaceAll('_', ' '));
  }
}

/** What a tag means, in a sentence ("Understands images."). */
export function modelCapabilityTagMeaning(tag: ModelCapabilityTag): string {
  switch (tag.axis) {
    case 'context':
      return `Reads up to ${Number(tag.value).toLocaleString()} tokens at once.`;
    case 'input_modality':
      return tag.value === 'image'
        ? 'Understands images.'
        : tag.value === 'text'
          ? 'Reads text.'
          : `Understands ${tag.value === 'pdf' ? 'PDF files' : tag.value}.`;
    case 'output_modality':
      return `Produces ${tag.value}.`;
    case 'capability':
      return tag.value === 'tool_calling'
        ? 'Can use tools.'
        : tag.value === 'reasoning'
          ? 'Can think before answering.'
          : `${modelCapabilityTagLabel(tag)}.`;
    case 'role':
      return 'A specialist model: it does one task rather than hold a conversation.';
    case 'task':
      return `${modelCapabilityTagLabel(tag)}.`;
    case 'price':
      return 'Costs nothing to use.';
    case 'kind':
      return tag.value === 'free_router'
        ? 'Sends each request to a free model that can handle it.'
        : 'Sends each request to a model chosen for it.';
    default:
      return `${modelCapabilityTagLabel(tag)}.`;
  }
}

const SOURCE_LABELS: Record<string, string> = {
  user: 'your settings',
  overlay: `${vocab.agent}'s model notes`,
  server_report: 'the provider',
  catalog: "the provider's model list",
  probe: 'a live check',
  hf_repo: 'Hugging Face',
  'models.dev': 'models.dev',
  litellm: 'LiteLLM',
  openrouter: 'OpenRouter',
  db: `${vocab.agent}'s model database`,
  dialect: "the provider's API type",
};

/** Where a tag came from, as a person reads it ("From the provider."). */
export function modelCapabilityTagSource(tag: ModelCapabilityTag): string {
  const source = tag.evidence[0]?.source ?? '';
  const label = SOURCE_LABELS[source] ?? (source ? source.replaceAll('_', ' ') : "the provider's model list");
  return `From ${label}.`;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
