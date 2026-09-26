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
  | 'model_type'
  | 'domain'
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
   * a model type, a domain, or a context size in tokens (as a string). */
  value: string;
  /** At least one; the first is the winning source. */
  evidence: readonly ModelCapabilityEvidence[];
}

/** Modalities every chat model has; tagging them would be noise. */
const BASELINE_MODALITIES = new Set(['text']);

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
  for (const modality of option.modalities ?? []) {
    if (BASELINE_MODALITIES.has(modality)) continue;
    tags.push({
      axis: 'input_modality',
      value: modality,
      evidence: evidenceFor(option, 'modalities'),
    });
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

/** The short label a tag shows ("Vision", "Tools", "200K"). */
export function modelCapabilityTagLabel(tag: ModelCapabilityTag): string {
  switch (tag.axis) {
    case 'context':
      return formatContextSize(Number(tag.value));
    case 'input_modality':
      return MODALITY_LABELS[tag.value] ?? sentenceCase(tag.value);
    case 'output_modality':
      return `Makes ${tag.value}`;
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
        : `Understands ${tag.value === 'pdf' ? 'PDF files' : tag.value}.`;
    case 'output_modality':
      return `Produces ${tag.value}.`;
    case 'capability':
      return tag.value === 'tool_calling'
        ? 'Can use tools.'
        : tag.value === 'reasoning'
          ? 'Can think before answering.'
          : `${modelCapabilityTagLabel(tag)}.`;
    case 'model_type':
      return `A ${tag.value.replaceAll('_', ' ')} model.`;
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
