/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: message_block.json
 */
import { z } from 'zod';
import type { MessageBlock } from './_models.js';

export const messageBlockGeneratedSchema: z.ZodType<MessageBlock> = z.discriminatedUnion('type', [
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      streaming: z.union([z.boolean(), z.null()]).default(null),
      text: z.string(),
      type: z.literal('text'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      default_collapsed: z.union([z.boolean(), z.null()]).default(null),
      id: z.string(),
      provider_source: z.union([z.string(), z.null()]).default(null),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      source: z.union([z.string(), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      streaming: z.union([z.boolean(), z.null()]).default(null),
      text: z.string(),
      type: z.literal('reasoning'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      thought: z.union([z.string(), z.null()]).default(null),
      tool_id: z.string(),
      type: z.literal('tool'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      detail: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      title: z.string(),
      type: z.literal('plan'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      task_id: z.string(),
      type: z.literal('task'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      subagent_id: z.string(),
      type: z.literal('subagent'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      artifact_id: z.string(),
      channel: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      type: z.literal('artifact'),
    })
    .strict(),
  z
    .object({
      actions: z.array(
        z
          .object({
            behavior: z
              .object({
                handle_id: z.union([z.string(), z.null()]).default(null),
                kind: z.string(),
                reason: z.union([z.string(), z.null()]).default(null),
              })
              .catchall(z.any()),
            enabled: z.boolean().default(true),
            id: z.string(),
            label: z.string(),
          })
          .strict(),
      ),
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      detail: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      severity: z.union([z.string(), z.null()]).default(null),
      source: z.union([z.string(), z.null()]).default(null),
      status: z.union([z.string(), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      title: z.string(),
      type: z.literal('action_card'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      surface_id: z.string(),
      type: z.literal('a2ui'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      label: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      type: z.literal('citation'),
      uri: z.string(),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      path: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      type: z.literal('diff'),
      unified_diff: z.string(),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      code: z.string(),
      id: z.string(),
      message: z.string(),
      recoverable: z.boolean(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      type: z.literal('error'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      detail: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      label: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      type: z.literal('routing'),
    })
    .strict(),
]);

export const messageBlockTypes = [
  'text',
  'reasoning',
  'tool',
  'plan',
  'task',
  'subagent',
  'artifact',
  'action_card',
  'a2ui',
  'citation',
  'diff',
  'error',
  'routing',
] as const;
