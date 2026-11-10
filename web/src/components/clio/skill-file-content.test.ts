import { describe, expect, it } from 'vitest';
import {
  skillFileBlock,
  skillFileDownload,
  skillFileSection,
  skillFileTitle,
  skillFileTrail,
} from './skill-file-content';

describe('skill file sections', () => {
  it('returns a single read as the file, without loader notes', () => {
    expect(
      skillFileSection(
        '# Discover\n\nRead measurements.\n\n(1 duplicate file request for this same file collapsed to a single read.)',
        'references/discovery.md',
        0,
        1,
      ),
    ).toBe('# Discover\n\nRead measurements.');
    expect(
      skillFileSection(
        '# Work with NDP\n\nProcedure.\n\nBundled files (use file=... for one or files=[...] for a batch):\n- references/a.md',
        'SKILL.md',
        0,
        1,
      ),
    ).toBe('# Work with NDP\n\nProcedure.');
  });

  it('separates each file of a batch from its neighbours and shared definitions', () => {
    const text = [
      '=== File 1/3: catalog.json#/components/Chart ===\n{"type":"object"}',
      '=== File 2/3: references/streams.md ===\n# Streams\n\nUse windows.',
      '=== File 3/3: catalog.json#/components/Table ===\n{"title":"Table"}',
      '### Shared by catalog.json\n{"$defs":{}}',
    ].join('\n\n');
    expect(skillFileSection(text, 'catalog.json#/components/Chart', 0, 3)).toBe(
      '{"type":"object"}',
    );
    expect(skillFileSection(text, 'references/streams.md', 1, 3)).toBe('# Streams\n\nUse windows.');
    expect(skillFileSection(text, 'catalog.json#/components/Table', 2, 3)).toBe(
      '{"title":"Table"}',
    );
    expect(skillFileSection(text, 'references/other.md', 1, 3)).toBeUndefined();
  });

  it('presents prose, JSON fragments and source files by their kind', () => {
    expect(skillFileBlock('SKILL.md', '#').type).toBe('markdown');
    expect(skillFileBlock('catalog.json#/components/Chart', '{}')).toMatchObject({
      type: 'code',
      language: 'json',
    });
    expect(skillFileBlock('scripts/fetch.py', 'print()')).toMatchObject({
      type: 'code',
      language: 'py',
    });
    expect(skillFileBlock('notes.txt', 'plain').type).toBe('text');
  });

  it('names a skill file by its folders within the skill, keeping the install path supplemental', () => {
    const root = 'C:\\Program Files\\CLIO\\skills\\work-with-ndp';
    expect(skillFileTrail(`${root}\\references\\streams.md`, root)).toBe(
      'work-with-ndp › references',
    );
    expect(skillFileTrail(`${root}/catalog.json`, root)).toBe('work-with-ndp');
    expect(skillFileTrail('/opt/plugins/snap/shared/schemas/a.json', root)).toBe(
      'shared › schemas',
    );
    expect(skillFileTitle('references/streams.md')).toBe('streams.md');
    expect(skillFileTitle('catalog.json#/components/Chart')).toBe('catalog.json#/components/Chart');
    expect(skillFileDownload('catalog.json#/components/Chart')).toEqual({
      filename: 'catalog.json',
      mimeType: 'application/json',
    });
    expect(skillFileDownload('references/streams.md').mimeType).toBe('text/markdown');
  });
});
