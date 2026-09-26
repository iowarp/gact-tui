import { describe, expect, it } from 'vitest';
import { capabilityRow, type TagSpec } from '@/test-fixtures/model-picker/capability-rows';
import { modelCapabilityTagsFromOption } from './model-capability-tags';
import {
  buildModelFacets,
  filterFacetGroups,
  hubTaskLabel,
  mainFacetGroups,
  type FacetEntry,
  type FacetTab,
} from './model-facets';
import { modelFilterTokens, providerFilterToken } from './model-filter-tokens';

function entry(
  id: string,
  spec: TagSpec = {},
  { provider = 'openrouter', providerName = 'OpenRouter', matchesText = true } = {},
): FacetEntry {
  const option = capabilityRow(id, spec, { providerId: provider, providerName });
  const tags = modelCapabilityTagsFromOption(option);
  const tokens = modelFilterTokens(tags, { chatSelectable: option.chatSelectable !== false });
  tokens.add(providerFilterToken(provider));
  return { providerId: provider, providerName, tags, tokens, matchesText };
}

const catalog: FacetEntry[] = [
  entry('meta/llama-4', { inputs: ['text', 'image'], capabilities: ['tool_calling', 'reasoning'] }),
  entry('acme/pdf-reader', { inputs: ['text', 'pdf'], free: true }),
  entry('openrouter/free', { router: true, free: true }),
  entry('stability/sdxl', { outputs: ['image'], modelType: 'image_generation', tasks: ['text-to-image'] }),
  entry('openai/whisper', {
    inputs: ['audio'],
    modelType: 'audio_transcription',
    tasks: ['automatic-speech-recognition'],
  }),
  entry('claude-sonnet-5', {}, { provider: 'claude_code', providerName: 'Claude Code' }),
];

function tab(tabs: readonly FacetTab[], id: string): FacetTab {
  return tabs.find((item) => item.id === id)!;
}

function chipTokens(item: FacetTab): string[] {
  return item.groups.flatMap((group) => group.chips.map((chip) => chip.token));
}

describe('buildModelFacets', () => {
  it('makes chips only for tags the catalog carries, each in its tab', () => {
    const tabs = buildModelFacets(catalog, []);

    expect(tabs.map((item) => item.id)).toEqual(['tasks', 'input', 'output', 'capabilities', 'providers', 'other']);
    expect(chipTokens(tab(tabs, 'input')).sort()).toEqual(['input:audio', 'input:image', 'input:pdf', 'input:text']);
    expect(chipTokens(tab(tabs, 'capabilities')).sort()).toEqual(['cap:reasoning', 'cap:tools']);
    expect(chipTokens(tab(tabs, 'providers')).sort()).toEqual(['provider:claude-code', 'provider:openrouter']);
    // Nothing states video, so there is no video chip.
    expect(chipTokens(tab(tabs, 'input'))).not.toContain('input:video');
  });

  it('groups Hub tasks the way Hugging Face does, with its spelling', () => {
    const tasks = tab(buildModelFacets(catalog, []), 'tasks');

    expect(tasks.groups.map((group) => group.label)).toEqual(['Vision', 'Language', 'Audio']);
    const vision = tasks.groups.find((group) => group.label === 'Vision')!;
    expect(vision.chips.map((chip) => [chip.token, chip.label])).toEqual([['task:text-to-image', 'Text-to-Image']]);
    const audio = tasks.groups.find((group) => group.label === 'Audio')!;
    expect(audio.chips[0]?.label).toBe('Automatic Speech Recognition');
  });

  it('splits Other into Offer, Role and whatever else is tagged', () => {
    const other = tab(buildModelFacets(catalog, []), 'other');

    expect(other.groups.map((group) => group.label)).toEqual(['Offer', 'Role']);
    expect(other.groups[0]?.chips.map((chip) => chip.label).sort()).toEqual(['Free', 'Router']);
    expect(other.groups[1]?.chips.map((chip) => chip.token).sort()).toEqual(['role:general', 'role:surrogate']);
  });

  it('counts the models each chip would match, under the text and the active tokens', () => {
    const tabs = buildModelFacets(catalog, ['input:text']);
    const count = (token: string) =>
      tabs.flatMap((item) => item.groups.flatMap((group) => group.chips)).find((chip) => chip.token === token);

    // Whisper takes audio only: hidden only by the DEFAULT input:text, so the
    // chip counts it and would swap that default out.
    expect(count('input:audio')).toMatchObject({ count: 1, active: false, replaces: ['input:text'] });
    expect(count('input:text')).toMatchObject({ count: 5, active: true, replaces: [] });
    expect(count('free')?.count).toBe(2);

    const searched = buildModelFacets(
      catalog.map((item, index) => ({ ...item, matchesText: index === 0 })),
      ['input:text'],
    );
    const tools = searched.flatMap((item) => item.groups.flatMap((group) => group.chips)).find((chip) => chip.token === 'cap:tools');
    expect(tools?.count).toBe(1);
  });

  it('while text is searched, hides chips nothing matching carries but keeps active ones', () => {
    const onlyLlama = catalog.map((item, index) => ({ ...item, matchesText: index === 0 }));
    const tabs = buildModelFacets(onlyLlama, ['free'], { hideEmpty: true });

    // Nothing matches "llama" AND free, yet the active chip stays to be turned off.
    expect(chipTokens(tab(tabs, 'other'))).toEqual(['free']);
    expect(chipTokens(tab(tabs, 'input'))).toEqual([]);
  });

  it('orders chips by how many models they match', () => {
    const input = tab(buildModelFacets(catalog, []), 'input');
    expect(input.groups[0]?.chips.map((chip) => chip.token)).toEqual([
      'input:text',
      'input:audio',
      'input:image',
      'input:pdf',
    ]);
  });
});

describe('buildModelFacets: chips hidden only by the default tokens', () => {
  const chips = (active: string[]) =>
    buildModelFacets(catalog, active).flatMap((item) => item.groups.flatMap((group) => group.chips));
  const find = (active: string[], token: string) => chips(active).find((chip) => chip.token === token);

  it('count what they would list and name the default they replace', () => {
    const defaults = ['input:text', 'output:text'];
    expect(find(defaults, 'task:text-to-image')).toMatchObject({ count: 1, replaces: ['output:text'] });
    expect(find(defaults, 'task:automatic-speech-recognition')).toMatchObject({
      count: 1,
      replaces: ['input:text'],
    });
    // Nothing to replace for a chip the defaults already allow.
    expect(find(defaults, 'free')).toMatchObject({ count: 2, replaces: [] });
  });

  it('never drop a token the person added: such a chip stays at 0', () => {
    // sdxl is not free, and "free" was the person's own choice.
    expect(find(['input:text', 'output:text', 'free'], 'task:text-to-image')).toMatchObject({
      count: 0,
      replaces: [],
    });
  });
});

describe('mainFacetGroups', () => {
  it('shows each group top chips and how many more its tab holds', () => {
    const main = mainFacetGroups(buildModelFacets(catalog, ['cap:tools']), 2);

    expect(main.map((group) => group.label)).toEqual([
      'Tasks',
      'Input',
      'Output',
      'Capabilities',
      'Providers',
      'Offer',
      'Role',
    ]);
    const input = main.find((group) => group.id === 'input')!;
    expect(input.chips).toHaveLength(2);
    expect(input.more).toBe(2);
    expect(input.tab).toBe('input');
    // An active chip always leads its cluster.
    expect(main.find((group) => group.id === 'capabilities')?.chips[0]?.token).toBe('cap:tools');
  });
});

describe('filterFacetGroups', () => {
  it('keeps chips whose name contains the filter, dropping emptied groups', () => {
    const tasks = tab(buildModelFacets(catalog, []), 'tasks');

    const filtered = filterFacetGroups(tasks.groups, 'speech');
    expect(filtered.map((group) => group.label)).toEqual(['Audio']);
    expect(filterFacetGroups(tasks.groups, '  ')).toHaveLength(tasks.groups.length);
  });
});

describe('hubTaskLabel', () => {
  it('spells Hub tasks as the Hub does', () => {
    expect(hubTaskLabel('text-generation')).toBe('Text Generation');
    expect(hubTaskLabel('image-text-to-text')).toBe('Image-Text-to-Text');
    expect(hubTaskLabel('clio:climate-downscaling')).toBe('Climate downscaling');
  });
});
