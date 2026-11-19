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
      completed_at: z.union([z.string(), z.null()]).default(null),
      default_collapsed: z.union([z.boolean(), z.null()]).default(null),
      duration_ms: z.union([z.number().gte(0), z.null()]).default(null),
      id: z.string(),
      provider_source: z.union([z.string(), z.null()]).default(null),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      source: z.union([z.string(), z.null()]).default(null),
      started_at: z.union([z.string(), z.null()]).default(null),
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
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      call_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      compaction_id: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      metadata: z
        .union([
          z
            .object({
              compacted_message_ids: z.union([z.array(z.string()), z.null()]).default(null),
              derived_from: z.union([z.array(z.string()), z.null()]).default(null),
              kept_message_ids: z.union([z.array(z.string()), z.null()]).default(null),
              system_prompt: z.union([z.string(), z.null()]).default(null),
            })
            .strict(),
          z.null(),
        ])
        .default(null),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      source: z.string(),
      stream_source: z.union([z.string(), z.null()]).default(null),
      text: z.string(),
      trigger: z.union([z.enum(['auto', 'manual']), z.null()]).default(null),
      try_index: z.union([z.number().int().gte(0), z.null()]).default(null),
      type: z.literal('injection'),
      variants_id: z.union([z.string(), z.null()]).default(null),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      code: z.union([z.string(), z.null()]).default(null),
      compaction_id: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      metadata: z
        .union([
          z
            .object({
              hook: z.union([z.string(), z.null()]).default(null),
              revises: z.union([z.string(), z.null()]).default(null),
            })
            .strict(),
          z.null(),
        ])
        .default(null),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      source: z.string(),
      stream_source: z.union([z.string(), z.null()]).default(null),
      text: z.string(),
      trigger: z.union([z.enum(['auto', 'manual']), z.null()]).default(null),
      type: z.literal('notice'),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      delivery: z
        .union([
          z
            .object({
              evidence_source: z.union([z.string(), z.null()]).default(null),
              reason: z.union([z.string(), z.null()]).default(null),
              representation: z.enum([
                'native',
                'bounded_tools',
                'structured_document',
                'sandbox',
                'retrieval',
                'metadata_only',
              ]),
            })
            .strict(),
          z.null(),
        ])
        .default(null),
      id: z.string(),
      media_type: z.string(),
      name: z.string(),
      resource_id: z.string(),
      resource_revision: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      type: z.literal('resource'),
      workspace_id: z.string(),
    })
    .strict(),
  z
    .object({
      agent_id: z.union([z.string(), z.null()]).default(null),
      channel: z.union([z.string(), z.null()]).default(null),
      id: z.string(),
      label: z.string(),
      media_type: z.string(),
      navigation: z.record(z.string()).optional(),
      ref_id: z.string(),
      ref_kind: z.enum([
        'workspace_file',
        'artifact',
        'session',
        'agent_run',
        'evidence_source',
        'context_frame',
        'diff',
        'plan',
      ]),
      revision: z.string(),
      sequence: z.union([z.number().int().gt(0), z.null()]).default(null),
      stream_source: z.union([z.string(), z.null()]).default(null),
      type: z.literal('context_reference'),
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
  'injection',
  'notice',
  'resource',
  'context_reference',
] as const;
