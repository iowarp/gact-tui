import type { TagEvidence } from '@clio/core/v3';
import { vocab } from './brand-vocabulary';
import { modelFactSummary, parameterSizeLabel } from './model-facts';
import type { ClioModelOption } from './model-options';
import { plural, t, ph } from '@lingui/core/macro';
import { formatNumber } from './locale-format';

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
  | 'context'
  | 'output_limit'
  | 'recent'
  | 'size';

export interface ModelCapabilityEvidence {
  /** Who stated it: `openrouter`, `server_report`, `overlay`, `hf_repo`, ...
   * The upstream field and value the service also sends are raw provenance
   * and are not carried: a tooltip says what a tag means and who said it. */
  source: string;
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
  /** Context axis only: what the size rests on, and the model's own ceiling. */
  contextBasis?: 'served' | 'configured' | 'native';
  nativeContext?: number;
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
  return rows.map((row) => ({ source: row.source }));
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
      tags.push({
        axis: 'role',
        value: record.role.value,
        evidence: evidenceOf(record.role.evidence),
      });
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
  // A snapshot-streaming model is a diffusion model: a capability tag, so the
  // picker shows it and `cap:diffusion` finds it.
  if (option.streamShape === 'snapshot') {
    tags.push({
      axis: 'capability',
      value: 'diffusion',
      evidence: [{ source: option.capabilityProvenance?.stream_shape?.source || 'catalog' }],
    });
  }
  // Descriptive facts that read as tags: a recent release, and the size.
  const facts = option.modelFacts;
  if (facts?.recent?.value === true) {
    tags.push({
      axis: 'recent',
      value: String(facts.recent.window_months),
      evidence: evidenceOf(facts.recent.evidence),
    });
  }
  const size = parameterSizeLabel(modelFactSummary(facts).parameters);
  if (size && facts?.parameters) {
    tags.push({ axis: 'size', value: size, evidence: evidenceOf(facts.parameters.evidence) });
  }
  if (option.contextWindow && option.contextWindow > 0) {
    const provenance = option.capabilityProvenance?.context_window;
    tags.push({
      axis: 'context',
      value: String(option.contextWindow),
      evidence: [{ source: provenance?.source || 'catalog' }],
      contextBasis: option.contextBasis,
      nativeContext: option.nativeContextWindow,
    });
  }
  if (option.outputLimit && Number.isFinite(option.outputLimit) && option.outputLimit > 0) {
    tags.push({
      axis: 'output_limit',
      value: String(option.outputLimit),
      evidence: [{ source: option.capabilityProvenance?.output_limit?.source || 'catalog' }],
    });
  }
  return tags;
}

function contextMeaning(tag: ModelCapabilityTag): string {
  const tokens = formatNumber(Number(tag.value));
  const native =
    tag.nativeContext && tag.nativeContext !== Number(tag.value)
      ? formatNumber(tag.nativeContext)
      : undefined;
  if (tag.contextBasis === 'configured') {
    return native
      ? t`Not loaded yet: the server will give it ${tokens} tokens when it loads. The model itself reads up to ${native}.`
      : t`Not loaded yet: the server will give it ${tokens} tokens when it loads.`;
  }
  if (tag.contextBasis === 'native') {
    return t`The model reads up to ${tokens} tokens; this server has not said what it applies.`;
  }
  return native
    ? t`Reads up to ${tokens} tokens at once. The model itself reads up to ${native}.`
    : t`Reads up to ${tokens} tokens at once.`;
}

/** "30B parameters.", or for a mixture of experts ("A3B / 30B") its active and total size. */
function sizeMeaning(value: string): string {
  if (!value.includes('/')) return t`${value} parameters.`;
  const sizes = value.replace(/^A/u, '');
  const at = sizes.indexOf(' / ');
  if (at < 0) return t`A mixture of experts: ${sizes} in all.`;
  const active = sizes.slice(0, at);
  const total = sizes.slice(at + 3);
  return t`A mixture of experts: ${active} parameters active per token, of ${total} in all.`;
}

/** The model type a model option's tags state, when one does. */
export function modelTypeOf(option: ClioModelOption): string | undefined {
  return option.capabilityTags?.model_type?.value;
}

const MODALITY_LABELS: Record<string, string> = {
  image: t`Vision`,
  audio: t`Audio`,
  video: t`Video`,
  pdf: t`PDF`,
};

const CAPABILITY_LABELS: Record<string, string> = {
  tool_calling: t`Tools`,
  parallel_tool_calls: t`Parallel tools`,
  reasoning: t`Reasoning`,
  structured_output: t`Structured output`,
  web_search: t`Web search`,
  code_execution: t`Code execution`,
  computer_use: t`Computer use`,
  prompt_caching: t`Prompt caching`,
  diffusion: t`Diffusion`,
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
  chat: t`Chat model`,
  embedding: t`Embeddings`,
  rerank: t`Reranker`,
  audio_transcription: t`Transcriber`,
  audio_speech: t`Speech generator`,
  image_generation: t`Image generator`,
  image_edit: t`Image editor`,
  video_generation: t`Video generator`,
  moderation: t`Moderator`,
  ocr: t`Text reader`,
  segmentation: t`Segmenter`,
  classification: t`Classifier`,
  forecasting: t`Forecaster`,
  scientific_surrogate: t`Scientific surrogate`,
  other: t`Other model`,
};

/** The short label a tag shows ("Vision", "Tools", "200K"). */
export function modelCapabilityTagLabel(tag: ModelCapabilityTag): string {
  const size = formatContextSize(Number(tag.value));
  switch (tag.axis) {
    case 'role':
      return sentenceCase(tag.value);
    case 'task':
      return TASK_LABELS[tag.value] ?? sentenceCase(tag.value.replaceAll('_', ' '));
    case 'price':
      return t`Free`;
    case 'kind':
      return t`Router`;
    case 'context':
      // Before load the number is what will apply, or only the model's own:
      // say which, so it never reads as what the server serves now.
      return tag.contextBasis === 'configured'
        ? t`${size} configured`
        : tag.contextBasis === 'native'
          ? t`${size} native`
          : size;
    case 'output_limit':
      return t`${size} max output`;
    case 'recent':
      return t`Recent`;
    case 'size':
      return tag.value;
    case 'input_modality':
      return tag.value === 'text'
        ? t`Text in`
        : (MODALITY_LABELS[tag.value] ?? sentenceCase(tag.value));
    case 'output_modality':
      return tag.value === 'text' ? t`Text out` : t`Makes ${ph({ modality: tag.value })}`;
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
      return contextMeaning(tag);
    case 'output_limit':
      return t`Generates up to ${ph({ tokens: formatNumber(Number(tag.value)) })} tokens per response. This is separate from the input context limit.`;
    case 'recent':
      return plural(Number(tag.value), {
        one: 'Released in the last # month.',
        other: 'Released in the last # months.',
      });
    case 'size':
      return sizeMeaning(tag.value);
    case 'input_modality':
      return tag.value === 'image'
        ? t`Understands images.`
        : tag.value === 'text'
          ? t`Reads text.`
          : tag.value === 'pdf'
            ? t`Understands PDF files.`
            : t`Understands ${ph({ modality: tag.value })}.`;
    case 'output_modality':
      return t`Produces ${ph({ modality: tag.value })}.`;
    case 'capability':
      return tag.value === 'tool_calling'
        ? t`Can use tools.`
        : tag.value === 'reasoning'
          ? t`Can think before answering.`
          : tag.value === 'diffusion'
            ? t`Writes the whole answer at once and refines it in parallel steps (a diffusion model).`
            : `${modelCapabilityTagLabel(tag)}.`;
    case 'role':
      return tag.value === 'surrogate'
        ? t`A specialist model: it does one task rather than hold a conversation.`
        : t`A general model: it can hold a conversation.`;
    case 'task': {
      // Hub task ids read as words ("text-classification" -> "text classification").
      const label = modelCapabilityTagLabel(tag);
      const hub = tag.hubTasks?.map((task) => task.replaceAll('-', ' ')).join(', ');
      return hub ? t`${label}. Hugging Face task: ${hub}.` : `${label}.`;
    }
    case 'domain':
      return t`Built for ${ph({ value: tag.value })}.`;
    case 'price':
      return t`Costs nothing to use.`;
    case 'kind':
      return t`Sends each request to a model chosen for it.`;
    default:
      return `${modelCapabilityTagLabel(tag)}.`;
  }
}

const { agent } = vocab;

const SOURCE_LABELS: Record<string, string> = {
  user: t`your settings`,
  overlay: t`${agent}'s model notes`,
  server_report: t`the provider`,
  catalog: t`the provider's model list`,
  probe: t`a live check`,
  // i18n-ignore: product name
  hf_repo: 'Hugging Face',
  'models.dev': 'models.dev',
  litellm: 'LiteLLM',
  openrouter: 'OpenRouter',
  db: t`${agent}'s model database`,
  dialect: t`the provider's API type`,
};

function sourceLabel(source: string): string {
  return (
    SOURCE_LABELS[source] ?? (source ? source.replaceAll('_', ' ') : t`the provider's model list`)
  );
}

/** Sources that are all the provider itself, in different forms (its report,
 * its API type, its model list, a live check of it). */
const PROVIDER_SOURCES = new Set(['server_report', 'dialect', 'catalog', 'probe']);

/**
 * Where a tag came from, as a person reads it ("From OpenRouter."). Several
 * forms of the provider agreeing read as one "the provider"; a single source
 * keeps its own name, and distinct sources stay listed.
 */
export function modelCapabilityTagSource(tag: ModelCapabilityTag): string {
  const sources = [...new Set(tag.evidence.map((row) => row.source))];
  const labels = [
    ...new Set(
      sources.map((source) =>
        sources.length > 1 && PROVIDER_SOURCES.has(source)
          ? SOURCE_LABELS.server_report
          : sourceLabel(source),
      ),
    ),
  ];
  const names = labels.length ? labels : [sourceLabel('')];
  if (names.length > 1) {
    const first = names.slice(0, -1).join(', ');
    const last = names.at(-1) ?? '';
    return t`From ${first} and ${last}.`;
  }
  return t`From ${ph({ source: names[0] ?? '' })}.`;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
