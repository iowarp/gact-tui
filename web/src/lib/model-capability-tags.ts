import type { TagEvidence } from '@clio/core/v3';
import { vocab } from './brand-vocabulary';
import type { ClioModelOption } from './model-options';

/**
 * A model's capability tags in ONE normalized shape, read from the service's
 * `capability_tags` record (clio-schemas `ModelCapabilityTags`). The axes are
 * the capability ontology's (input/output modalities, capabilities, role,
 * task, domain) plus how the model is offered (free, router) and its context
 * size. Every tag carries the evidence the service reported for it, so a
 * tooltip can say where a claim came from. Unknown is simply absent: nothing
 * is ever guessed here.
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
  /** Who stated it: `openrouter`, `server_report`, `overlay`, `hf_repo`, ... */
  source: string;
  /** The upstream field and value as the source stated it. */
  detail: string;
}

export interface ModelCapabilityTag {
  axis: ModelCapabilityAxis;
  /** A modality (`image`), a capability (`tool_calling`), a role
   * (`surrogate`), a model type for the task axis (`classification`), a
   * domain, `free`, `router`, or a context size in tokens (as a string). */
  value: string;
  /** At least one; the first is the winning source. */
  evidence: readonly ModelCapabilityEvidence[];
  /** Task axis only: the Hugging Face tasks (`pipeline_tag` ids) the model performs. */
  hubTasks?: readonly string[];
}

/**
 * Tags that describe an ordinary chat model (text in, text out, general, a
 * chat model). They exist for filtering -- text in/out is the default filter
 * -- but a row does not show them: on every row they would be noise.
 */
export function isBaselineTag(tag: ModelCapabilityTag): boolean {
  if (tag.axis === 'input_modality' || tag.axis === 'output_modality') return tag.value === 'text';
  if (tag.axis === 'role') return tag.value === 'general';
  if (tag.axis === 'task') return tag.value === 'chat';
  return false;
}

/**
 * What each model type already says it produces. Its output chip ("Makes
 * scores" beside "Classifier") would repeat the task chip, so it is not drawn;
 * an output the type does NOT imply ("Makes image" on a chat model) still is.
 */
const MODEL_TYPE_OUTPUT: Record<string, string> = {
  chat: 'text',
  embedding: 'embeddings',
  rerank: 'scores',
  classification: 'scores',
  audio_transcription: 'text',
  audio_speech: 'audio',
  image_generation: 'image',
  image_edit: 'image',
  video_generation: 'video',
  segmentation: 'masks',
  ocr: 'text',
};

/**
 * The chips a row draws: every tag except the baseline ones and an output
 * modality the model-type chip already states. Filtering still uses every tag.
 */
export function displayedTags(tags: readonly ModelCapabilityTag[]): ModelCapabilityTag[] {
  const modelType = tags.find((tag) => tag.axis === 'task')?.value;
  const implied = modelType ? MODEL_TYPE_OUTPUT[modelType] : undefined;
  return tags.filter(
    (tag) => !isBaselineTag(tag) && !(tag.axis === 'output_modality' && tag.value === implied),
  );
}

function evidenceOf(rows: readonly TagEvidence[]): ModelCapabilityEvidence[] {
  return rows.map((row) => ({ source: row.source, detail: row.detail }));
}

/**
 * The tags one model option carries: the service's `capability_tags` record,
 * plus the context size the catalog reports. A model whose record is absent
 * (an older service) or states nothing gets no capability tags.
 */
export function modelCapabilityTagsFromOption(option: ClioModelOption): ModelCapabilityTag[] {
  const record = option.capabilityTags;
  const tags: ModelCapabilityTag[] = [];
  if (record) {
    if (record.router?.value === true) {
      tags.push({ axis: 'kind', value: 'router', evidence: evidenceOf(record.router.evidence) });
    }
    if (record.free?.value === true) {
      tags.push({ axis: 'price', value: 'free', evidence: evidenceOf(record.free.evidence) });
    }
    for (const tag of record.input_modalities ?? []) {
      tags.push({ axis: 'input_modality', value: tag.value, evidence: evidenceOf(tag.evidence) });
    }
    for (const tag of record.output_modalities ?? []) {
      tags.push({ axis: 'output_modality', value: tag.value, evidence: evidenceOf(tag.evidence) });
    }
    if (record.role) {
      tags.push({ axis: 'role', value: record.role.value, evidence: evidenceOf(record.role.evidence) });
    }
    if (record.model_type) {
      tags.push({
        axis: 'task',
        value: record.model_type.value,
        evidence: evidenceOf(record.model_type.evidence),
        hubTasks: (record.tasks ?? []).map((task) => task.value),
      });
    }
    for (const tag of record.capabilities ?? []) {
      tags.push({ axis: 'capability', value: tag.value, evidence: evidenceOf(tag.evidence) });
    }
    for (const tag of record.domains ?? []) {
      tags.push({ axis: 'domain', value: tag.value, evidence: evidenceOf(tag.evidence) });
    }
  }
  if (option.contextWindow && option.contextWindow > 0) {
    const provenance = option.capabilityProvenance?.context_window;
    tags.push({
      axis: 'context',
      value: String(option.contextWindow),
      evidence: [{ source: provenance?.source || 'catalog', detail: 'context_window' }],
    });
  }
  return tags;
}

/** The model type a model option's tags state, when one does. */
export function modelTypeOf(option: ClioModelOption): string | undefined {
  return option.capabilityTags?.model_type?.value;
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
  chat: 'Chat model',
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
      return sentenceCase(tag.value);
    case 'task':
      return TASK_LABELS[tag.value] ?? sentenceCase(tag.value.replaceAll('_', ' '));
    case 'price':
      return 'Free';
    case 'kind':
      return 'Router';
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
      return tag.value === 'surrogate'
        ? 'A specialist model: it does one task rather than hold a conversation.'
        : 'A general model: it can hold a conversation.';
    case 'task': {
      const hub = tag.hubTasks?.length ? ` Hugging Face task: ${tag.hubTasks.join(', ')}.` : '';
      return `${modelCapabilityTagLabel(tag)}.${hub}`;
    }
    case 'domain':
      return `Built for ${tag.value}.`;
    case 'price':
      return 'Costs nothing to use.';
    case 'kind':
      return 'Sends each request to a model chosen for it.';
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

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? (source ? source.replaceAll('_', ' ') : "the provider's model list");
}

/** Where a tag came from, as a person reads it ("From OpenRouter."). */
export function modelCapabilityTagSource(tag: ModelCapabilityTag): string {
  const labels = [...new Set(tag.evidence.map((row) => sourceLabel(row.source)))];
  const names = labels.length ? labels : [sourceLabel('')];
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `From ${joined}.`;
}

/** The upstream field the winning source stated it in, verbatim (may be empty). */
export function modelCapabilityTagDetail(tag: ModelCapabilityTag): string {
  return tag.evidence[0]?.detail ?? '';
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
