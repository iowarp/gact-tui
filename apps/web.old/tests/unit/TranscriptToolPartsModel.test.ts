import type { Message, PartText, PartToolResult } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  commandResultInfo,
  metadataToolDiffs,
  toolResultBody,
} from '../../src/components/TranscriptToolPartsModel.js';

describe('TranscriptToolPartsModel', () => {
  it('extracts tool result body from output or content blocks', () => {
    expect(toolResultBody({ type: 'tool_result', output: 'done' } as PartToolResult)).toBe('done');
    expect(
      toolResultBody({
        type: 'tool_result',
        content: [
          { type: 'text', text: 'alpha' },
          { type: 'tool_result', output: 'beta' },
          { type: 'image' },
        ],
      } as PartToolResult),
    ).toBe('alpha\nbeta\n[image]');
    expect(toolResultBody({ type: 'tool_result' } as PartToolResult)).toBe('');
  });

  it('recognizes synthetic command result text and strips slash command prefixes', () => {
    expect(
      commandResultInfo(
        {
          type: 'text',
          text: 'ignored',
          metadata: { synthetic: 'command_result', command: '/status' },
        } as PartText,
        '  [/status]\nready',
      ),
    ).toEqual({ command: '/status', text: 'ready' });
    expect(
      commandResultInfo(
        {
          type: 'text',
          text: 'ignored',
          metadata: { synthetic: 'command_result', command: 'status' },
        } as PartText,
        'ready',
      ),
    ).toEqual({ command: 'status', text: 'ready' });
    expect(commandResultInfo({ type: 'text', text: 'plain' } as PartText, 'plain')).toBeNull();
  });

  it('recovers metadata diffs from fs_propose_edit tool results', () => {
    const msg = {
      id: 'm1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'done' }],
      metadata: {
        tools_called: [
          {
            name: 'fs_propose_edit',
            args: { filepath: 'fallback.ts' },
            result: JSON.stringify({
              path: 'src/app.ts',
              unified_diff: '--- a\n+++ b',
              new_content: 'next',
            }),
          },
          {
            tool_name: 'fs_propose_edit',
            args: { path: 'fallback.ts' },
            result: {
              unified_diff: '--- c\n+++ d',
            },
          },
        ],
      },
    } as Message;
    expect(metadataToolDiffs(msg)).toEqual([
      {
        id: 'metadata-diff-m1-0',
        type: 'file_diff',
        path: 'src/app.ts',
        unified_diff: '--- a\n+++ b',
        after: 'next',
      },
      {
        id: 'metadata-diff-m1-1',
        type: 'file_diff',
        path: 'fallback.ts',
        unified_diff: '--- c\n+++ d',
        after: undefined,
      },
    ]);
  });

  it('deduplicates recovered diffs and defers to explicit file_diff parts', () => {
    const duplicateTool = {
      name: 'fs_propose_edit',
      result: {
        path: 'src/app.ts',
        unified_diff: '--- a\n+++ b',
      },
    };
    expect(
      metadataToolDiffs({
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'done' }],
        metadata: { tools_called: [duplicateTool, duplicateTool] },
      } as Message),
    ).toHaveLength(1);
    expect(
      metadataToolDiffs({
        id: 'm2',
        role: 'assistant',
        parts: [{ type: 'file_diff', path: 'src/app.ts', unified_diff: '--- a\n+++ b' }],
        metadata: { tools_called: [duplicateTool] },
      } as Message),
    ).toEqual([]);
  });
});
