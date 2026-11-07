import { agentResolutionSchema, type AgentEntry } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  agentDisplayName,
  capabilitySummary,
  pluginContributions,
  provenanceLabel,
  removalPreviewReason,
  removedPluginReason,
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

  it('says why a plugin left: a requirement, its pack, or an empty pack', () => {
    expect(removedPluginReason({ id: 'pdf', reason: 'cascade', because: 'document-runtime' })).toBe(
      'Left with document-runtime, which it requires',
    );
    expect(removedPluginReason({ id: 'pdf', reason: 'removed', because: 'documents' })).toBe(
      'Left with its pack documents',
    );
    expect(removedPluginReason({ id: 'documents', reason: 'pack_empty', because: '' })).toBe(
      'Left because none of its members remain',
    );
    expect(removalPreviewReason({ reason: 'pack_empty', because: '' })).toBe(
      'none of its members remain',
    );
    expect(removalPreviewReason({ reason: 'cascade', because: 'shell' })).toBe('requires shell');
    expect(removalPreviewReason({ reason: 'removed', because: '' })).toBe('leaves with it');
  });

  it('separates deferred tools and servers from listed ones, counting both', () => {
    const resolution = agentResolutionSchema.parse({
      agent: { ref: 'clio/standard', id: 'standard' },
      tools: [
        { name: 'create_a2ui_surface', plugin: 'visuals' },
        { name: 'capture_a2ui_surface', plugin: 'visuals', defer: true },
        { name: 'shell_bash', plugin: 'shell', defer: null },
      ],
      mcp_servers: {
        home: { plugin: 'visuals', spec: { type: 'stdio' }, defer: true },
        web: { plugin: 'visuals', spec: { type: 'stdio' } },
      },
    });
    const visuals = pluginContributions(resolution, 'visuals');
    expect(visuals.tools).toEqual(['create_a2ui_surface']);
    expect(visuals.deferredTools).toEqual(['capture_a2ui_surface']);
    expect(visuals.mcpServers).toEqual([
      { name: 'home', type: 'stdio', deferred: true },
      { name: 'web', type: 'stdio', deferred: false },
    ]);
    expect(capabilitySummary(visuals)).toBe('2 tools, 2 MCP servers');
    expect(pluginContributions(resolution, 'shell').tools).toEqual(['shell_bash']);
  });
});
