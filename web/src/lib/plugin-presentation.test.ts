import type { AgentEntry } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  agentDisplayName,
  provenanceLabel,
  unwrapFragmentText,
  userAgentId,
} from './plugin-presentation';

const agents = [
  { ref: 'clio/standard', id: 'standard', name: 'CLIO', kind: 'agent', plugins: [] },
  { ref: 'user/mine', id: 'mine', name: 'Mine', kind: 'user', plugins: [] },
] as unknown as AgentEntry[];

describe('plugin presentation', () => {
  it('labels every provenance source in words', () => {
    expect(provenanceLabel({ source: 'core', via: 'core', label: 'core' })).toBe('Core');
    expect(provenanceLabel({ source: 'agent', via: 'standard', label: 'standard' })).toBe(
      'From standard',
    );
    expect(provenanceLabel({ source: 'pack', via: 'documents', label: 'pack documents' })).toBe(
      'In pack documents',
    );
    expect(provenanceLabel({ source: 'required', via: 'pdf', label: 'required by pdf' })).toBe(
      'Required by pdf',
    );
    expect(provenanceLabel({ source: 'user', via: 'user', label: 'user' })).toBe('Added by you');
  });

  it('names a parent agent from its ref, a ranged id, or falls back to the id', () => {
    expect(agentDisplayName('clio/standard', agents)).toBe('CLIO');
    expect(agentDisplayName('standard@^1', agents)).toBe('CLIO');
    expect(agentDisplayName('lab/unknown@1.2', agents)).toBe('unknown');
  });

  it('suggests a user agent id from its name', () => {
    expect(userAgentId('HDF5 analyst')).toBe('hdf5-analyst');
  });

  it('joins wrapped prompt lines into paragraphs and keeps Markdown blocks', () => {
    const text = [
      'Use `prepare_execution_runtime` when managed executable',
      'paths are needed.',
      '',
      '- one item',
      '- another item',
      '```',
      'code line',
      'second code line',
      '```',
      'Last paragraph',
      'continues here.',
      '## Heading',
      'Body under it.',
    ].join('\n');
    expect(unwrapFragmentText(text)).toBe(
      [
        'Use `prepare_execution_runtime` when managed executable paths are needed.',
        '',
        '- one item',
        '- another item',
        '```',
        'code line',
        'second code line',
        '```',
        'Last paragraph continues here.',
        '## Heading',
        'Body under it.',
      ].join('\n'),
    );
  });
});
