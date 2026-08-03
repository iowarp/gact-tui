import type { PromptDef } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { filterPrompts } from '../../src/routes/discovery/PromptsPageModel.js';

const prompts = [
  {
    id: 'earthscope_station_prompt',
    title: 'EarthScope station workflow',
    description: 'Finds and stages GNSS station data.',
    scope: 'workspace',
  },
  {
    id: 'memory_compaction',
    title: 'Memory compaction',
    description: 'Summarizes long-running sessions.',
    scope: 'global',
  },
  {
    id: 'minimal',
  },
] as unknown as PromptDef[];

describe('PromptsPageModel', () => {
  it('returns the original prompt list for an empty query', () => {
    expect(filterPrompts(prompts, '   ')).toBe(prompts);
  });

  it('matches prompts by id', () => {
    expect(filterPrompts(prompts, 'station')).toEqual([prompts[0]]);
  });

  it('matches prompts by title case-insensitively', () => {
    expect(filterPrompts(prompts, 'MEMORY')).toEqual([prompts[1]]);
  });

  it('matches prompts by description', () => {
    expect(filterPrompts(prompts, 'gnss')).toEqual([prompts[0]]);
  });

  it('matches prompts by scope', () => {
    expect(filterPrompts(prompts, 'global')).toEqual([prompts[1]]);
  });

  it('handles optional metadata fields', () => {
    expect(filterPrompts(prompts, 'minimal')).toEqual([prompts[2]]);
    expect(filterPrompts(prompts, 'missing')).toEqual([]);
  });
});
