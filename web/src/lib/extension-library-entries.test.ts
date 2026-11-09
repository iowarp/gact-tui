import { pluginEntrySchema, pluginMarketplaceSchema } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { extensionEntries, markdownSummary } from './extension-library-entries';

const plugin = (value: Record<string, unknown>) =>
  pluginEntrySchema.parse({ marketplace: 'lab', trusted: true, ...value });

describe('extensionEntries', () => {
  const plugins = [
    plugin({ id: 'tools', ref: 'lab/tools', skills: ['a', 'b'] }),
    plugin({
      id: 'mine',
      ref: 'private-local/mine',
      marketplace: 'private-local',
      skills: ['mine'],
    }),
    plugin({ id: 'waiting', ref: 'lab/waiting', pending_trust: true }),
  ];
  const marketplaces = [
    pluginMarketplaceSchema.parse({
      name: 'lab',
      source: 'https://github.com/lab/plugins',
      trusted: false,
      format: 'claude-code',
    }),
  ];

  it('lists plugins, marketplaces and standalone skills in All, each with a status word', () => {
    const rows = extensionEntries({ type: 'all', plugins, marketplaces, saved: [], servers: [] });
    expect(rows.map((row) => [row.kind, row.title])).toEqual([
      ['plugin', 'tools'],
      ['plugin', 'waiting'],
      ['marketplace', 'lab'],
      ['skill', 'mine'],
    ]);
    expect(rows[1]!.status?.label).toBe('Update waits for trust');
    expect(rows[2]!.status?.label).toBe('Not trusted');
  });

  it('lists every skill under Skills and filters by the search term', () => {
    const skills = extensionEntries({
      type: 'skills',
      plugins,
      marketplaces,
      saved: [],
      servers: [],
    });
    expect(skills.map((row) => row.title)).toEqual(['a', 'b', 'mine']);
    const found = extensionEntries({
      type: 'all',
      plugins,
      marketplaces,
      saved: [],
      servers: [],
      term: 'WAIT',
    });
    expect(found.map((row) => row.title)).toEqual(['waiting']);
  });
});

describe('markdownSummary', () => {
  it('prefers the front matter description, then the first prose line', () => {
    expect(markdownSummary('---\nname: x\ndescription: "Turn lights on"\n---\n# X\nBody')).toBe(
      'Turn lights on',
    );
    expect(markdownSummary('# Title\n\nFirst prose')).toBe('First prose');
    expect(markdownSummary(undefined)).toBe('');
  });
});
