import type { MessageBlock, WorkspaceResource } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TranscriptResourceAttachment,
  TranscriptResourceAttachments,
} from './transcript-resource-attachment';

const repository = vi.hoisted(() => ({ resourcePreview: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://clio.test' } }),
}));

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
    name:
      detectedMime === 'application/pdf'
        ? 'paper.pdf'
        : detectedMime.startsWith('image/')
          ? 'diagram.png'
          : 'notes.md',
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
beforeEach(() => {
  repository.resourcePreview.mockReset();
  repository.resourcePreview.mockResolvedValue(new Uint8Array([1, 2, 3]));
});

function renderAttachment(element: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

describe('TranscriptResourceAttachment availability', () => {
  it('opens an attachment with the complete adjacent message group', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const first = resource('application/pdf', processing('complete'));
    const second = {
      ...first,
      id: 'res_2',
      client_upload_id: 'upload_2',
      name: 'appendix.pdf',
    };
    renderAttachment(
      <TranscriptResourceAttachments
        blocks={[block, { ...block, id: 'part_2', name: 'appendix.pdf', resource_id: 'res_2' }]}
        onOpen={onOpen}
        resources={{ res_1: first, res_2: second }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open paper.pdf' }));

    expect(onOpen).toHaveBeenCalledWith(first, [first, second]);
    const openPaper = screen.getByRole('button', { name: 'Open paper.pdf' });
    expect(openPaper).toHaveClass('size-full', 'flex-col');
    expect(openPaper.closest('[data-attachment-variant]')).toHaveClass('size-36');
    const attachmentTray = screen.getByRole('group', { name: '2 message attachments' });
    expect(attachmentTray).toHaveClass('w-max', 'min-w-full');
    expect(attachmentTray.closest('[data-slot="scroll-area"]')).toHaveClass('rounded-2xl');
  });

  it('separates active upload from conversion waiting in the expanded status', async () => {
    const user = userEvent.setup();
    renderAttachment(
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
    renderAttachment(
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
    renderAttachment(
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

  it('renders a natively delivered image as a preview tile with its live status', async () => {
    renderAttachment(
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

    const status = screen.getByRole('img', { name: 'Attachment status: Ready' });
    expect(status).toBeVisible();
    expect(status).toHaveAttribute('data-overlay', 'true');
    expect(status.parentElement).not.toHaveClass('bg-background/85');
    expect(status.querySelector('svg')).toHaveClass('text-black');
    const preview = await screen.findByRole('img', { name: 'diagram.png' });
    expect(preview).toHaveAttribute('src', 'blob:test-3');
    expect(preview).toHaveAttribute('width', '144');
    expect(repository.resourcePreview).toHaveBeenCalledWith('ws_1', 'res_1', expect.anything());
  });

  it('does not claim an image reached the model without a native delivery decision', () => {
    renderAttachment(
      <TranscriptResourceAttachment
        block={{ ...block, name: 'diagram.png', media_type: 'image/png' }}
        resource={resource('image/png', processing('not_started'))}
      />,
    );

    expect(screen.getByRole('img', { name: 'Attachment status: Waiting' })).toBeVisible();
  });

  it('marks a failed PDF conversion unavailable when no derivative survived', () => {
    renderAttachment(
      <TranscriptResourceAttachment
        block={block}
        resource={resource('application/pdf', processing('failed'))}
      />,
    );

    expect(screen.getByRole('img', { name: 'Attachment status: Unavailable' })).toBeVisible();
  });
});
