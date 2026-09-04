import { describe, expect, it } from 'vitest';
import {
  A2UI_VERSION,
  a2uiComponentSchema,
  a2uiSurfaceSchema,
  capabilitiesSchema,
  messageBlockSchema,
  messageSchema,
  runStateSchema,
  toolInvocationSchema,
} from './index.js';

describe('forward-compatible wire enums', () => {
  it('retains message metadata used to classify internal resume envelopes', () => {
    expect(
      messageSchema.parse({
        id: 'msg_resume',
        session_id: 'sess_1',
        role: 'user',
        created_at: '2026-09-04T00:00:00Z',
        blocks: [{ id: 'block_1', type: 'text', text: 'Answer' }],
        metadata: { ask_user_resume: true, ask_user_question_id: 'ques_1' },
      }).metadata,
    ).toEqual({ ask_user_resume: true, ask_user_question_id: 'ques_1' });
  });

  it('maps future enum values to an explicit unknown state', () => {
    expect(runStateSchema.parse('paused_by_provider')).toBe('unknown');
    expect(
      messageSchema.parse({
        id: 'msg_1',
        session_id: 'sess_1',
        role: 'delegate',
        created_at: '2026-08-27T12:00:00Z',
        blocks: [
          {
            id: 'block_1',
            type: 'future_visualization',
            payload: { retained: true },
          },
        ],
      }).role,
    ).toBe('unknown');
    expect(
      messageSchema.parse({
        id: 'msg_2',
        session_id: 'sess_1',
        role: 'assistant',
        created_at: '2026-08-27T12:00:00Z',
        blocks: [{ id: 'block_1', type: 'future_visualization', payload: { retained: true } }],
      }).blocks[0],
    ).toMatchObject({ type: 'unknown', original_type: 'future_visualization' });
    expect(
      toolInvocationSchema.parse({
        id: 'tool_1',
        session_id: 'sess_1',
        name: 'future_tool',
        state: 'paused',
      }).state,
    ).toBe('unknown');
    expect(
      a2uiSurfaceSchema.parse({
        id: 'surface_1',
        session_id: 'sess_1',
        catalog_id: 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
        protocol_version: A2UI_VERSION,
        revision: 1,
        state: 'superseded',
        messages: [],
      }).state,
    ).toBe('unknown');
  });

  it('degrades a malformed known block without disguising what the service sent', () => {
    expect(messageBlockSchema.parse({ id: 'block_1', type: 'text' })).toEqual({
      id: 'block_1',
      type: 'unknown',
      original_type: 'text',
      raw: { id: 'block_1', type: 'text' },
    });
    expect(
      messageBlockSchema.parse({
        id: 'block_4',
        type: 'text',
        text: 'Grounded answer',
        citation_ids: ['cite_1'],
      }),
    ).toEqual({ id: 'block_4', type: 'text', text: 'Grounded answer' });
    expect(
      messageBlockSchema.parse({
        id: 'block_2',
        type: 'reasoning',
        text: 'Grounded thought',
        source: 'provider',
      }),
    ).toEqual({
      id: 'block_2',
      type: 'reasoning',
      text: 'Grounded thought',
      source: 'provider',
    });
    expect(
      messageBlockSchema.parse({
        id: 'resource_1',
        type: 'resource',
        resource_id: 'res_1',
        resource_revision: '1',
        workspace_id: 'ws_1',
        name: 'paper.pdf',
        media_type: 'application/pdf',
        delivery: {
          representation: 'native',
          evidence_source: 'live_handshake',
          reason: 'selected model accepts this resource natively',
        },
      }),
    ).toMatchObject({
      type: 'resource',
      name: 'paper.pdf',
      delivery: { representation: 'native', evidence_source: 'live_handshake' },
    });
    expect(
      messageBlockSchema.parse({ id: 'resource_2', type: 'resource', resource_id: 'res_2' }),
    ).toEqual({
      id: 'resource_2',
      type: 'unknown',
      original_type: 'resource',
      raw: { id: 'resource_2', type: 'resource', resource_id: 'res_2' },
    });
    expect(
      messageBlockSchema.parse({
        id: 'app_1',
        type: 'mcp_app',
        app_instance_id: 'instance_1',
        resource_uri: 'ui://vigil/viewer',
        source_server: 'vigil',
        tool_name: 'vigil_open_viewer',
        data_ref: 'opaque-reference',
        mime_type: 'text/html;profile=mcp-app',
        height: 420,
        future_hint: 'ignored',
      }),
    ).toEqual({
      id: 'app_1',
      type: 'mcp_app',
      app_instance_id: 'instance_1',
      resource_uri: 'ui://vigil/viewer',
      source_server: 'vigil',
      tool_name: 'vigil_open_viewer',
      data_ref: 'opaque-reference',
      mime_type: 'text/html;profile=mcp-app',
      height: 420,
    });
    expect(
      messageBlockSchema.parse({
        id: 'reference_1',
        type: 'context_reference',
        ref_kind: 'artifact',
        ref_id: 'artifact_1',
        label: 'Review notes.md',
        revision: 'v2',
        media_type: 'text/markdown',
        navigation: { artifact_id: 'artifact_1' },
      }),
    ).toMatchObject({
      type: 'context_reference',
      ref_kind: 'artifact',
      label: 'Review notes.md',
      navigation: { artifact_id: 'artifact_1' },
    });
  });

  it('keeps a resource attachment readable when the service adds a field', () => {
    expect(
      messageBlockSchema.parse({
        id: 'resource_3',
        type: 'resource',
        resource_id: 'res_3',
        resource_revision: '2',
        workspace_id: 'ws_1',
        name: 'stations.csv',
        media_type: 'text/csv',
        sha256_v2: 'blake3:cafe',
        delivery: {
          representation: 'structured_document',
          reason: 'converted for a model without native CSV support',
          evidence_generated_at: '2026-08-27T12:00:00Z',
        },
      }),
    ).toMatchObject({
      type: 'resource',
      name: 'stations.csv',
      delivery: { representation: 'structured_document' },
    });
  });

  it('uses the shared closed A2UI component vocabulary and limits', () => {
    expect(
      a2uiComponentSchema.parse({
        id: 'consent',
        component: 'CheckBox',
        label: 'Include uncertain stations',
        value: false,
      }),
    ).toMatchObject({ component: 'CheckBox' });
    expect(
      a2uiComponentSchema.safeParse({
        id: 'consent',
        component: 'Checkbox',
        label: 'Include uncertain stations',
        value: false,
      }).success,
    ).toBe(false);
    expect(
      a2uiComponentSchema.safeParse({
        id: 'map',
        component: 'clio.map.v1',
        points: Array.from({ length: 501 }, (_, index) => ({
          id: `station-${index}`,
          label: `Station ${index}`,
          latitude: 34,
          longitude: -118,
        })),
      }).success,
    ).toBe(false);
  });

  it('preserves structured capability vocabulary values', () => {
    const result = capabilitiesSchema.parse({
      gact_versions: ['0.3'],
      a2ui_versions: ['0.9.1'],
      replay: { supported: true },
      capabilities: {
        attachments: true,
        x_clio_cancellation: 'cooperative',
        x_clio_document_artifacts: { formats: ['markdown', 'pdf'] },
      },
      model_catalog: {
        source: 'server',
        observed_at: '2026-08-27T12:00:00Z',
        stale: false,
      },
    });

    expect(result.capabilities).toMatchObject({
      attachments: true,
      x_clio_cancellation: 'cooperative',
      x_clio_document_artifacts: { formats: ['markdown', 'pdf'] },
    });
  });
});
