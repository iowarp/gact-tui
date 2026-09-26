import { TASK_LABELS, type ModelCapabilityTag } from './model-capability-tags';

/**
 * The model picker's filter tokens: `key:value` strings (`input:image`,
 * `cap:tools`, `role:surrogate`, `task:classification`, `domain:climate`,
 * `free`, `router`) derived from a model's capability tags. A task tag
 * carries two spellings: its model type (`task:image-generation`) and each
 * Hugging Face task id it performs (`task:text-to-image`). Tokens combine
 * with AND; a model shows when it carries every active token. Free text is
 * matched separately (model name and provider).
 */
export type ModelFilterToken = string;

/** On by default: a person who changes nothing sees the models they can chat with. */
export const DEFAULT_FILTER_TOKENS: readonly ModelFilterToken[] = ['input:text', 'output:text'];

const CAPABILITY_TOKENS: Record<string, string> = { tool_calling: 'tools' };

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9:]+/gu, '-');
}

/** The token a tag's chip adds when clicked, or `undefined` for a tag that is not filterable. */
export function tagFilterToken(tag: ModelCapabilityTag): ModelFilterToken | undefined {
  return tagFilterTokens(tag)[0];
}

/** Every token a tag filters by (a task tag: its model type, then its Hub tasks). */
export function tagFilterTokens(tag: ModelCapabilityTag): ModelFilterToken[] {
  if (tag.axis === 'task') {
    return [`task:${slug(tag.value)}`, ...(tag.hubTasks ?? []).map((task) => `task:${slug(task)}`)];
  }
  const token = singleToken(tag);
  return token ? [token] : [];
}

function singleToken(tag: ModelCapabilityTag): ModelFilterToken | undefined {
  switch (tag.axis) {
    case 'input_modality':
      return `input:${tag.value}`;
    case 'output_modality':
      return `output:${tag.value}`;
    case 'capability':
      return `cap:${CAPABILITY_TOKENS[tag.value] ?? tag.value.replaceAll('_', '-')}`;
    case 'role':
      return `role:${tag.value}`;
    case 'domain':
      return `domain:${tag.value}`;
    case 'price':
      return tag.value === 'free' ? 'free' : undefined;
    case 'kind':
      return tag.value === 'router' ? 'router' : undefined;
    default:
      return undefined;
  }
}

/**
 * Every token a model's tags carry.
 *
 * `chatSelectable`: the service lets this model run a chat turn (its role is
 * not a known surrogate). A chat model whose input or output modalities no
 * source has stated still matches the default `input:text` / `output:text`
 * filter -- the filter means "models you can chat with", and the service's
 * chat selection already treats such a model as one. This affects filtering
 * only: no chip is shown for a modality nobody stated.
 */
export function modelFilterTokens(
  tags: readonly ModelCapabilityTag[],
  { chatSelectable = false }: { chatSelectable?: boolean } = {},
): Set<ModelFilterToken> {
  const tokens = new Set<ModelFilterToken>();
  for (const tag of tags) {
    for (const token of tagFilterTokens(tag)) tokens.add(token);
  }
  const surrogate = tags.some((tag) => tag.axis === 'role' && tag.value === 'surrogate');
  if (chatSelectable && !surrogate) {
    if (!tags.some((tag) => tag.axis === 'input_modality')) tokens.add('input:text');
    if (!tags.some((tag) => tag.axis === 'output_modality')) tokens.add('output:text');
  }
  return tokens;
}

/** Whether a model carrying `tokens` passes every active token (AND). */
export function matchesFilterTokens(
  tokens: ReadonlySet<ModelFilterToken>,
  active: readonly ModelFilterToken[],
): boolean {
  return active.every((token) => tokens.has(token));
}

/**
 * The completions for a partly typed token ("input:" -> every `input:` token
 * that exists), from the tokens the listed models actually carry, excluding
 * those already active.
 */
export function filterTokenSuggestions(
  partial: string,
  available: ReadonlySet<ModelFilterToken>,
  active: readonly ModelFilterToken[],
): ModelFilterToken[] {
  const text = partial.trim().toLowerCase();
  if (!text || !/^[a-z-]+:?[a-z0-9-]*$/u.test(text)) return [];
  if (!text.includes(':') && !'free'.startsWith(text) && !'router'.startsWith(text)) {
    // A bare word only completes once it names a key ("inp" -> "input:").
    const keys = new Set([...available].map((token) => token.split(':')[0] ?? token));
    if (![...keys].some((key) => key.startsWith(text))) return [];
  }
  return [...available]
    .filter((token) => token.startsWith(text) && !active.includes(token))
    .sort();
}

/** Why a model that is not a chat model cannot be picked as one, in one sentence. */
export function surrogateChatReason(modelType: string | undefined): string {
  const label = modelType ? TASK_LABELS[modelType] : undefined;
  if (!label) return "This model can't hold a conversation.";
  const plural = label === 'Embeddings' ? 'Embedding models' : label.endsWith('s') ? label : `${label}s`;
  return `${plural} can't hold a conversation.`;
}

const TOKEN_KEYS = ['input', 'output', 'cap', 'role', 'task', 'domain', 'free', 'router'];

/**
 * A word that is a token, or may still become one while it is typed ("inp"
 * on its way to "input:") -- never free text, so typing a token never
 * starts a text search.
 */
function isTokenWord(word: string): boolean {
  return word.includes(':') || TOKEN_KEYS.some((key) => key.startsWith(word));
}

/** The free-text part of the search field: every word that is not a token. */
export function freeSearchText(query: string): string {
  return query
    .trim()
    .split(/\s+/u)
    .filter((word) => word && !isTokenWord(word.toLowerCase()))
    .join(' ');
}

/**
 * The picker's text matcher: every free-text word must appear in the row's
 * name or keywords (model id, provider). Token words never match text.
 */
export function matchesFreeSearch(
  node: { label: string; keywords?: readonly string[] },
  normalizedQuery: string,
): boolean {
  const words = freeSearchText(normalizedQuery).toLowerCase().split(' ').filter(Boolean);
  if (!words.length) return true;
  const haystack = [node.label, ...(node.keywords ?? [])].join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}
