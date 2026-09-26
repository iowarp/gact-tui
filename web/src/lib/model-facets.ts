import {
  modelCapabilityTagLabel,
  type ModelCapabilityAxis,
  type ModelCapabilityTag,
} from './model-capability-tags';
import {
  DEFAULT_FILTER_TOKENS,
  matchesFilterTokens,
  providerFilterToken,
  tagFilterTokens,
  type ModelFilterToken,
} from './model-filter-tokens';

/**
 * The model picker's filter panel, computed from the catalog it lists: one
 * chip per filter token that at least one listed model carries, grouped into
 * tabs the way Hugging Face groups its model filters. Nothing here names a
 * value to show -- chips exist only for tags the service reported. What IS
 * fixed is presentation: which tab an axis lives in, and which Hugging Face
 * category (Multimodal, Vision, ...) a Hub task id belongs to.
 */
export type FacetTabId = 'tasks' | 'input' | 'output' | 'capabilities' | 'providers' | 'other';

export type FacetIcon =
  | { kind: 'tag'; tag: ModelCapabilityTag }
  | { kind: 'provider'; providerId: string };

export interface FacetChip {
  token: ModelFilterToken;
  label: string;
  /**
   * Models that match the search, the active tokens and this chip's token.
   * When the only thing hiding them is a DEFAULT token (`output:text` hides
   * every image generator), the count is what the chip gives once that
   * default gives way -- see `replaces`. Zero means pressing it would list
   * nothing, so an inactive zero chip is not pressable.
   */
  count: number;
  active: boolean;
  /** The default tokens pressing this chip swaps out (empty: it just adds). */
  replaces: ModelFilterToken[];
  icon: FacetIcon;
}

export interface FacetGroup {
  id: string;
  label: string;
  chips: FacetChip[];
}

export interface FacetTab {
  id: FacetTabId;
  label: string;
  groups: FacetGroup[];
  /** Every chip in the tab: what decides whether it gets a name filter. */
  chipCount: number;
}

/** One listed model as the facets see it. */
export interface FacetEntry {
  providerId: string;
  providerName: string;
  tags: readonly ModelCapabilityTag[];
  /** Every token the model carries (the tree's own set, provider included). */
  tokens: ReadonlySet<ModelFilterToken>;
  /** Whether the model matches the free-text search (true with no text). */
  matchesText: boolean;
}

export const FACET_TAB_LABELS: Record<FacetTabId, string> = {
  tasks: 'Tasks',
  input: 'Input',
  output: 'Output',
  capabilities: 'Capabilities',
  providers: 'Providers',
  other: 'Other',
};

const TAB_ORDER: readonly FacetTabId[] = ['tasks', 'input', 'output', 'capabilities', 'providers', 'other'];

/** Hugging Face's task categories, in the order its Tasks tab lists them. */
const TASK_CATEGORIES: readonly { id: string; label: string; tasks: readonly string[] }[] = [
  {
    id: 'multimodal',
    label: 'Multimodal',
    tasks: [
      'audio-text-to-text', 'image-text-to-text', 'image-text-to-image', 'image-text-to-video',
      'visual-question-answering', 'document-question-answering', 'video-text-to-text',
      'visual-document-retrieval', 'any-to-any',
    ],
  },
  {
    id: 'vision',
    label: 'Vision',
    tasks: [
      'depth-estimation', 'image-classification', 'object-detection', 'image-segmentation',
      'text-to-image', 'image-to-text', 'image-to-image', 'image-to-video',
      'unconditional-image-generation', 'video-classification', 'text-to-video',
      'zero-shot-image-classification', 'mask-generation', 'zero-shot-object-detection',
      'text-to-3d', 'image-to-3d', 'image-feature-extraction', 'keypoint-detection', 'video-to-video',
    ],
  },
  {
    id: 'language',
    label: 'Language',
    tasks: [
      'text-generation', 'text-classification', 'token-classification', 'table-question-answering',
      'question-answering', 'zero-shot-classification', 'translation', 'summarization',
      'feature-extraction', 'fill-mask', 'sentence-similarity', 'text-ranking',
    ],
  },
  {
    id: 'audio',
    label: 'Audio',
    tasks: [
      'text-to-speech', 'text-to-audio', 'automatic-speech-recognition', 'audio-to-audio',
      'audio-classification', 'voice-activity-detection',
    ],
  },
  {
    id: 'scientific',
    label: 'Scientific',
    tasks: [
      'tabular-classification', 'tabular-regression', 'time-series-forecasting', 'graph-ml',
      'robotics', 'reinforcement-learning',
    ],
  },
];

function taskCategory(task: string): { id: string; label: string } {
  // A task the Hub has no term for is CLIO's own (`clio:<id>`): scientific work.
  if (task.startsWith('clio:')) return { id: 'scientific', label: 'Scientific' };
  return TASK_CATEGORIES.find((category) => category.tasks.includes(task)) ?? { id: 'other-tasks', label: 'Other tasks' };
}

function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** A Hub task as the Hub writes it: "Text Generation", "Image-Text-to-Text". */
export function hubTaskLabel(task: string): string {
  if (task.startsWith('clio:')) return capitalized(task.slice(5).replaceAll('-', ' '));
  if (task.includes('-to-')) {
    return task
      .split('-to-')
      .map((side) => side.split('-').map(capitalized).join('-'))
      .join('-to-');
  }
  return task.split('-').map(capitalized).join(' ');
}

function modalityLabel(value: string): string {
  return value === 'pdf' ? 'PDF' : capitalized(value);
}

interface ChipSource {
  tab: FacetTabId;
  groupId: string;
  groupLabel: string;
  label: string;
  icon: FacetIcon;
  /** Order of the group inside its tab. */
  groupRank: number;
}

const OTHER_GROUPS: Partial<Record<ModelCapabilityAxis, { id: string; label: string; rank: number }>> = {
  price: { id: 'offer', label: 'Offer', rank: 0 },
  kind: { id: 'offer', label: 'Offer', rank: 0 },
  role: { id: 'role', label: 'Role', rank: 1 },
  domain: { id: 'domain', label: 'Domain', rank: 2 },
};

/** Where a (non-task) tag's chip sits and what it says. */
function tagSource(tag: ModelCapabilityTag): ChipSource | undefined {
  const icon: FacetIcon = { kind: 'tag', tag };
  switch (tag.axis) {
    case 'input_modality':
      return { tab: 'input', groupId: 'input', groupLabel: 'Input', label: modalityLabel(tag.value), icon, groupRank: 0 };
    case 'output_modality':
      return { tab: 'output', groupId: 'output', groupLabel: 'Output', label: modalityLabel(tag.value), icon, groupRank: 0 };
    case 'capability':
      return { tab: 'capabilities', groupId: 'capabilities', groupLabel: 'Capabilities', label: modelCapabilityTagLabel(tag), icon, groupRank: 0 };
    default: {
      const group = OTHER_GROUPS[tag.axis];
      if (!group) return undefined;
      return { tab: 'other', groupId: group.id, groupLabel: group.label, label: modelCapabilityTagLabel(tag), icon, groupRank: group.rank };
    }
  }
}

/** Every chip a model contributes, keyed by its token. */
function entrySources(entry: FacetEntry, into: Map<ModelFilterToken, ChipSource>): void {
  for (const tag of entry.tags) {
    if (tag.axis === 'task') {
      for (const task of tag.hubTasks ?? []) {
        const token = tagFilterTokens({ ...tag, value: task, hubTasks: [] })[0];
        if (!token || into.has(token)) continue;
        const category = taskCategory(task);
        into.set(token, {
          tab: 'tasks',
          groupId: category.id,
          groupLabel: category.label,
          label: hubTaskLabel(task),
          icon: { kind: 'tag', tag: { ...tag, hubTasks: [task] } },
          groupRank: [...TASK_CATEGORIES.map((item) => item.id), 'other-tasks'].indexOf(category.id),
        });
      }
      continue;
    }
    const source = tagSource(tag);
    const token = tagFilterTokens(tag)[0];
    if (source && token && !into.has(token)) into.set(token, source);
  }
  // A chat model nobody stated modalities for still carries text in/out.
  for (const axis of ['input_modality', 'output_modality'] as const) {
    const token = axis === 'input_modality' ? 'input:text' : 'output:text';
    if (entry.tokens.has(token) && !into.has(token)) {
      into.set(token, tagSource({ axis, value: 'text', evidence: [] })!);
    }
  }
  const providerToken = providerFilterToken(entry.providerId);
  if (!into.has(providerToken)) {
    into.set(providerToken, {
      tab: 'providers',
      groupId: 'providers',
      groupLabel: 'Providers',
      label: entry.providerName,
      icon: { kind: 'provider', providerId: entry.providerId },
      groupRank: 0,
    });
  }
}

function byCountThenLabel(left: FacetChip, right: FacetChip): number {
  return right.count - left.count || left.label.localeCompare(right.label);
}

/**
 * Every subset of the active DEFAULT tokens, smallest first: none, then each
 * one alone, ..., then all of them. Tokens the person added are never
 * dropped -- only the defaults, which they never asked for.
 */
function defaultReliefs(active: readonly ModelFilterToken[]): ModelFilterToken[][] {
  const defaults = active.filter((token) => DEFAULT_FILTER_TOKENS.includes(token));
  const subsets: ModelFilterToken[][] = [[]];
  for (const token of defaults) {
    for (const subset of [...subsets]) subsets.push([...subset, token]);
  }
  return subsets.sort((left, right) => left.length - right.length);
}

/**
 * The panel's tabs. `hideEmpty` (set while free text is typed) drops chips no
 * matching model carries, so the panel narrows with the search; an active
 * chip always stays so it can be turned off.
 */
export function buildModelFacets(
  entries: readonly FacetEntry[],
  active: readonly ModelFilterToken[],
  { hideEmpty = false }: { hideEmpty?: boolean } = {},
): FacetTab[] {
  const sources = new Map<ModelFilterToken, ChipSource>();
  for (const entry of entries) entrySources(entry, sources);
  // Counts under the active tokens, then under each way of letting active
  // DEFAULT tokens give way (fewest dropped first). A chip takes the first
  // variant that lists something for it.
  const variants = defaultReliefs(active).map((dropped) => {
    const kept = active.filter((token) => !dropped.includes(token));
    const counts = new Map<ModelFilterToken, number>();
    for (const entry of entries) {
      if (!entry.matchesText || !matchesFilterTokens(entry.tokens, kept)) continue;
      for (const token of entry.tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return { dropped, counts };
  });
  const [plain] = variants;
  const groups = new Map<string, FacetGroup & { tab: FacetTabId; rank: number }>();
  for (const [token, source] of sources) {
    const isActive = active.includes(token);
    const variant =
      (isActive ? undefined : variants.find((item) => (item.counts.get(token) ?? 0) > 0)) ?? plain!;
    const chip: FacetChip = {
      token,
      label: source.label,
      count: variant.counts.get(token) ?? 0,
      active: isActive,
      replaces: variant.dropped,
      icon: source.icon,
    };
    if (hideEmpty && !chip.count && !chip.active) continue;
    const key = `${source.tab}/${source.groupId}`;
    const group = groups.get(key) ?? {
      id: source.groupId,
      label: source.groupLabel,
      chips: [],
      tab: source.tab,
      rank: source.groupRank,
    };
    group.chips.push(chip);
    groups.set(key, group);
  }
  return TAB_ORDER.map((id) => {
    const tabGroups = [...groups.values()]
      .filter((group) => group.tab === id)
      .sort((left, right) => left.rank - right.rank)
      .map(({ id: groupId, label, chips }) => ({ id: groupId, label, chips: chips.sort(byCountThenLabel) }));
    return {
      id,
      label: FACET_TAB_LABELS[id],
      groups: tabGroups,
      chipCount: tabGroups.reduce((sum, group) => sum + group.chips.length, 0),
    };
  });
}

/** One cluster of the Main tab: a group's leading chips and how many more its tab holds. */
export interface MainFacetGroup {
  id: string;
  label: string;
  tab: FacetTabId;
  chips: FacetChip[];
  more: number;
}

/**
 * The Main tab: each tab's top chips as one cluster (Other splits into its
 * own groups -- Offer, Role, Domain), active chips first, then by count.
 */
export function mainFacetGroups(tabs: readonly FacetTab[], limit = 6): MainFacetGroup[] {
  const clusters: MainFacetGroup[] = [];
  for (const tab of tabs) {
    const parts =
      tab.id === 'other'
        ? tab.groups.map((group) => ({ id: group.id, label: group.label, chips: group.chips }))
        : [{ id: tab.id, label: tab.label, chips: tab.groups.flatMap((group) => group.chips) }];
    for (const part of parts) {
      if (!part.chips.length) continue;
      const ordered = [...part.chips].sort(
        (left, right) => Number(right.active) - Number(left.active) || byCountThenLabel(left, right),
      );
      const shown = ordered.slice(0, Math.max(limit, ordered.filter((chip) => chip.active).length));
      clusters.push({ id: part.id, label: part.label, tab: tab.id, chips: shown, more: part.chips.length - shown.length });
    }
  }
  return clusters;
}

/** A tab's groups narrowed to chips whose label contains `filter` (case-insensitive). */
export function filterFacetGroups(groups: readonly FacetGroup[], filter: string): FacetGroup[] {
  const text = filter.trim().toLowerCase();
  if (!text) return [...groups];
  return groups
    .map((group) => ({ ...group, chips: group.chips.filter((chip) => chip.label.toLowerCase().includes(text)) }))
    .filter((group) => group.chips.length);
}
