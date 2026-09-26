import { describe, expect, it } from 'vitest';
import { toolPresentationSchema } from './index.js';

// Fixtures below are the REAL shape clio-agent serializes (verified against
// ToolPresentation.model_dump(exclude_none=True) for the view_image/view_pdf
// `workspace_file` block, tool_result_presentation.py): every declared
// PresentationBlock field rides along with its falsy default, not just the
// fields this block type cares about.
const IMAGE_BLOCK_FIXTURE = {
  summary: '',
  blocks: [
    {
      id: 'workspace-file',
      type: 'workspace_file',
      media_type: 'image/png',
      text: '',
      label: '',
      language: '',
      workspace_id: 'ws_abc',
      path: 'renders/page-1.png',
      sha256: 'a'.repeat(64),
      pages: [],
      uri: '',
      command: '',
      timed_out: false,
      status: '',
      detail: '',
      items: [],
      action_label: '',
    },
  ],
};

const PDF_BLOCK_FIXTURE = {
  summary: '',
  blocks: [
    {
      id: 'workspace-file',
      type: 'workspace_file',
      media_type: 'application/pdf',
      text: '',
      label: '',
      language: '',
      workspace_id: 'ws_pdf',
      path: 'doc.pdf',
      sha256: 'b'.repeat(64),
      pages: [2, 3],
      uri: '',
      command: '',
      timed_out: false,
      status: '',
      detail: '',
      items: [],
      action_label: '',
    },
  ],
};

describe('workspace_file presentation block', () => {
  it('parses the real view_image serialized shape', () => {
    const parsed = toolPresentationSchema.parse(IMAGE_BLOCK_FIXTURE);
    const block = parsed.blocks[0];
    expect(block).toMatchObject({
      id: 'workspace-file',
      type: 'workspace_file',
      workspace_id: 'ws_abc',
      path: 'renders/page-1.png',
      media_type: 'image/png',
      sha256: 'a'.repeat(64),
    });
    expect(block?.pages).toEqual([]);
  });

  it('parses the real view_pdf serialized shape, keeping the resolved pages', () => {
    const parsed = toolPresentationSchema.parse(PDF_BLOCK_FIXTURE);
    const block = parsed.blocks[0];
    expect(block).toMatchObject({
      id: 'workspace-file',
      type: 'workspace_file',
      workspace_id: 'ws_pdf',
      path: 'doc.pdf',
      media_type: 'application/pdf',
      sha256: 'b'.repeat(64),
      pages: [2, 3],
    });
  });

  it('parses a workspace_file block whose optional fields are entirely absent', () => {
    const parsed = toolPresentationSchema.parse({
      summary: '',
      blocks: [{ id: 'workspace-file', type: 'workspace_file' }],
    });
    const block = parsed.blocks[0];
    expect(block?.type).toBe('workspace_file');
    expect(block?.workspace_id).toBeUndefined();
    expect(block?.path).toBeUndefined();
    expect(block?.sha256).toBeUndefined();
    expect(block?.pages).toBeUndefined();
  });

  it('rejects a non-positive page number', () => {
    expect(() =>
      toolPresentationSchema.parse({
        summary: '',
        blocks: [{ id: 'workspace-file', type: 'workspace_file', pages: [0] }],
      }),
    ).toThrow();
  });
});
