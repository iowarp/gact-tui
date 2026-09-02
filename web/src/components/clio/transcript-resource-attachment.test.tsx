import type { MessageBlock, WorkspaceResource } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TranscriptResourceAttachment } from './transcript-resource-attachment';

const block: Extract<MessageBlock, { type: 'resource' }> = {
  id: 'part_1',
  type: 'resource',
  resource_id: 'res_1',
  resource_revision: '1',
  workspace_id: 'ws_1',
  name: 'paper.pdf',
  media_type: 'application/pdf',
};

function resource(
  detectedMime: string,
  processing: WorkspaceResource['processing'],
): WorkspaceResource {
  return {
    id: 'res_1',
    workspace_id: 'ws_1',
    client_upload_id: 'upload_1',
    revision: 1,
    name: detectedMime === 'application/pdf' ? 'paper.pdf' : 'notes.md',
    claimed_mime: detectedMime,
    detected_mime: detectedMime,
    detection_source: 'signature',
    declared_size: 42,
    received_size: 42,
    sha256: 'abc',
    state: 'ready',
    failure: '',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    completed_at: '2026-09-01T00:00:00Z',
    mime_mismatch: false,
    processing,
  };
}

function processing(
  state: NonNullable<WorkspaceResource['processing']>['state'],
  derivativesAvailable = false,
): NonNullable<WorkspaceResource['processing']> {
  return {
    workspace_id: 'ws_1',
    resource_id: 'res_1',
    resource_revision: 1,
    source_sha256: 'abc',
    processor: state === 'not_started' ? '' : 'clio-web-search-docling',
    processor_url: state === 'not_started' ? '' : 'http://127.0.0.1:8089',
    job_id: '',
    query_tool: 'workspace_resource_inspect',
    state,
    progress: derivativesAvailable ? 100 : 0,
    derivatives_available: derivativesAvailable,
    failure: state === 'failed' ? { message: 'Docling could not read the document.' } : {},
    cancellation: {},
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };
}

afterEach(cleanup);

describe('TranscriptResourceAttachment availability', () => {
  it('separates active upload from conversion waiting in the expanded status', async () => {
    const user = userEvent.setup();
    render(
      <TranscriptResourceAttachment
        block={block}
        resource={{ ...resource('application/pdf', processing('not_started')), state: 'uploading' }}
      />,
    );

    const attachment = screen.getByText('paper.pdf').closest('[data-slot="hover-card-trigger"]');
    expect(attachment).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Attachment status: Processing' })).toBeVisible();
    await user.hover(attachment!);
    expect(await screen.findByRole('status', { name: 'Upload status: In progress' })).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Conversion status: Waiting for upload' }),
    ).toBeVisible();
  });

  it('does not call an unconverted PDF ready merely because its bytes are retained', () => {
    render(
      <TranscriptResourceAttachment
        block={block}
        resource={resource('application/pdf', processing('not_started'))}
      />,
    );

    expect(screen.getByRole('img', { name: 'Attachment status: Waiting' })).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Attachment status: Ready' })).not.toBeInTheDocument();
  });

  it('marks a retained text resource ready without requiring a derivative', async () => {
    const user = userEvent.setup();
    render(
      <TranscriptResourceAttachment
        block={{ ...block, name: 'notes.md', media_type: 'text/markdown' }}
        resource={resource('text/markdown', processing('not_started'))}
      />,
    );

    expect(screen.getByRole('img', { name: 'Attachment status: Ready' })).toBeVisible();
    await user.hover(screen.getByText('notes.md'));
    expect(await screen.findByRole('status', { name: 'Upload status: Complete' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Conversion status: Not required' })).toBeVisible();
  });

  it('marks a natively delivered image ready from the live route decision', () => {
    render(
      <TranscriptResourceAttachment
        block={{
          ...block,
          name: 'diagram.png',
          media_type: 'image/png',
          delivery: {
            representation: 'native',
            evidence_source: 'live_handshake',
            reason: 'selected model accepts image input',
          },
        }}
        resource={resource('image/png', processing('not_started'))}
      />,
    );

    expect(screen.getByRole('img', { name: 'Attachment status: Ready' })).toBeVisible();
  });

  it('does not claim an image reached the model without a native delivery decision', () => {
    render(
      <TranscriptResourceAttachment
        block={{ ...block, name: 'diagram.png', media_type: 'image/png' }}
        resource={resource('image/png', processing('not_started'))}
      />,
    );

    expect(screen.getByRole('img', { name: 'Attachment status: Waiting' })).toBeVisible();
  });

  it('marks a failed PDF conversion unavailable when no derivative survived', () => {
    render(
      <TranscriptResourceAttachment
        block={block}
        resource={resource('application/pdf', processing('failed'))}
      />,
    );

    expect(screen.getByRole('img', { name: 'Attachment status: Unavailable' })).toBeVisible();
  });
});
