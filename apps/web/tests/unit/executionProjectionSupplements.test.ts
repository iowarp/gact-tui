import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import type { ProjectedExecutionNode } from '../../src/components/executionProjectionPreview.js';
import {
  assistantSupplementNodes,
  assistantSupplementNodesByTurn,
  dedupeProjectedSupplements,
} from '../../src/components/executionProjectionSupplements.js';

function message(message: Partial<Message>): Message {
  return message as Message;
}

describe('executionProjectionSupplements', () => {
  it('keeps assistant text supplements only when they carry artifacts', () => {
    expect(
      assistantSupplementNodes(
        message({
          role: 'assistant',
          parts: [{ type: 'text', text: 'ordinary response' }],
        }),
      ),
    ).toEqual([]);
    expect(
      assistantSupplementNodes(
        message({
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: 'Generated /tmp/station_axis.png\nCLIO typed workflow state:\n{"hidden":true}',
            },
          ],
        }),
      ),
    ).toEqual([
      {
        kind: 'text',
        agent: 'main',
        depth: 0,
        text: 'Generated /tmp/station_axis.png',
      },
    ]);
  });

  it('adds expert handoff supplements when the report preview carries an artifact', () => {
    expect(
      assistantSupplementNodes(
        message({
          role: 'assistant',
          parts: [
            {
              type: 'expert_handoff',
              text: 'plot generated',
              metadata: {
                agent_id: 'visualization',
                parent_id: 'main',
                structured: {
                  workflow_state: {
                    visualization: {
                      artifact: {
                        kind: 'plot',
                        path: '/tmp/station_axis.png',
                        status: 'ready',
                      },
                    },
                  },
                },
              },
            },
          ],
        }),
      ),
    ).toEqual([
      {
        kind: 'report',
        agent: 'visualization',
        parent: 'main',
        depth: 1,
        text: 'kind: plot\npath: /tmp/station_axis.png\nshow full image\nstatus: ready',
        structured: {
          workflow_state: {
            visualization: {
              artifact: {
                kind: 'plot',
                path: '/tmp/station_axis.png',
                status: 'ready',
              },
            },
          },
        },
      },
    ]);
  });

  it('adds image part supplements', () => {
    expect(
      assistantSupplementNodes(
        message({
          role: 'assistant',
          parts: [{ type: 'image', uri: '/tmp/plot.png' } as never],
        }),
      ),
    ).toEqual([
      {
        kind: 'report',
        agent: 'artifact',
        depth: 1,
        text: 'image artifact\n/tmp/plot.png\nshow full image',
      },
    ]);
  });

  it('groups supplements under the current user turn', () => {
    const grouped = assistantSupplementNodesByTurn([
      message({ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'plot it' }] }),
      message({
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Generated /tmp/plot.png' }],
      }),
      message({ id: 'u2', role: 'user', parts: [{ type: 'text', text: 'hello' }] }),
      message({
        id: 'a2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'plain response' }],
      }),
    ]);
    expect([...grouped.keys()]).toEqual(['u1']);
    expect(grouped.get('u1')?.[0]?.text).toBe('Generated /tmp/plot.png');
  });

  it('deduplicates supplement nodes against existing projected text', () => {
    const existing: ProjectedExecutionNode[] = [
      { kind: 'text', agent: 'main', depth: 0, text: 'Generated /tmp/plot.png' },
    ];
    const supplements: ProjectedExecutionNode[] = [
      { kind: 'text', agent: 'main', depth: 0, text: 'Generated /tmp/plot.png' },
      { kind: 'report', agent: 'artifact', depth: 1, text: 'image artifact\n/tmp/other.png' },
    ];
    expect(dedupeProjectedSupplements(existing, supplements)).toEqual([
      existing[0],
      supplements[1],
    ]);
  });
});
