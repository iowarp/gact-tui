import type { BlueprintSource } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  blueprintSourceDotClass,
  blueprintSourceGroups,
  blueprintSourceName,
  blueprintSourceStatus,
  buildAddBlueprintSourceInput,
} from '../../src/routes/discovery/BlueprintSourcesPanelModel.js';

describe('BlueprintSourcesPanelModel', () => {
  it('builds an add-source payload with trimmed optional fields', () => {
    expect(
      buildAddBlueprintSourceInput(' https://github.com/org/blueprints.git ', ' main ', ' registry '),
    ).toEqual({
      source: 'https://github.com/org/blueprints.git',
      ref: 'main',
      name: 'registry',
    });

    expect(buildAddBlueprintSourceInput('/tmp/blueprints', ' ', '')).toEqual({
      source: '/tmp/blueprints',
    });
    expect(buildAddBlueprintSourceInput('   ', 'main', 'registry')).toBeNull();
  });

  it('derives row labels and status defaults from a source', () => {
    const named: BlueprintSource = {
      id: 'src_named',
      name: 'named registry',
      source: '/tmp/registry',
      status: 'ready',
    };
    const unnamed: BlueprintSource = {
      id: 'src_unnamed',
      name: '',
      source: 'https://github.com/org/blueprints.git',
      status: '',
    };

    expect(blueprintSourceName(named)).toBe('named registry');
    expect(blueprintSourceName(unnamed)).toBe('https://github.com/org/blueprints.git');
    expect(blueprintSourceStatus(named)).toBe('ready');
    expect(blueprintSourceStatus(unnamed)).toBe('unknown');
  });

  it('maps source statuses to the row dot class', () => {
    expect(blueprintSourceDotClass('ready')).toBe('bps__dot bps__dot--ok');
    expect(blueprintSourceDotClass('ok')).toBe('bps__dot bps__dot--ok');
    expect(blueprintSourceDotClass('installed')).toBe('bps__dot bps__dot--ok');
    expect(blueprintSourceDotClass('error')).toBe('bps__dot bps__dot--error');
    expect(blueprintSourceDotClass('unknown')).toBe('bps__dot bps__dot--unknown');
    expect(blueprintSourceDotClass(undefined)).toBe('bps__dot bps__dot--unknown');
  });

  it('groups installed blueprint provenance under matching sources', () => {
    const groups = blueprintSourceGroups(
      [
        {
          id: 'src_main',
          name: 'main registry',
          source: 'https://github.com/org/blueprints.git',
          ref: 'main',
          status: 'ready',
        },
      ],
      [
        {
          id: 'earthscope-gnss-region',
          name: 'EarthScope GNSS Region',
          metadata: {
            install: {
              source: 'https://github.com/org/blueprints.git',
              ref: 'main',
              commit: 'abcdef1234567890',
            },
          },
        },
      ],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.blueprints.map((bp) => bp.id)).toEqual(['earthscope-gnss-region']);
  });
});
