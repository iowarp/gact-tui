import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from './attachments';

afterEach(cleanup);

describe('AttachmentHoverCard', () => {
  it('closes when a scroll moves its trigger', async () => {
    render(
      <AttachmentHoverCard defaultOpen>
        <AttachmentHoverCardTrigger>paper.pdf</AttachmentHoverCardTrigger>
        <AttachmentHoverCardContent>Conversion complete</AttachmentHoverCardContent>
      </AttachmentHoverCard>,
    );
    expect(screen.getByText('Conversion complete')).toBeInTheDocument();

    fireEvent.scroll(window);

    await waitFor(() => expect(screen.queryByText('Conversion complete')).not.toBeInTheDocument());
  });
});

describe('composer attachments', () => {
  it('uses a real media tile for images instead of an inline filename chip', () => {
    render(
      <Attachments variant="composer">
        <Attachment
          data={{
            filename: 'field-map.png',
            id: 'image-1',
            mediaType: 'image/png',
            type: 'file',
            url: 'blob:field-map',
          }}
        >
          <AttachmentPreview />
          <AttachmentInfo showMediaType />
        </Attachment>
      </Attachments>,
    );

    expect(screen.getByRole('img', { name: 'field-map.png' })).toHaveAttribute('width', '144');
    expect(document.querySelector('[data-attachment-variant]')).toHaveAttribute(
      'data-attachment-variant',
      'composer',
    );
    expect(screen.queryByText('field-map.png')).not.toBeInTheDocument();
  });

  it('uses a visual metadata tile for non-image files', () => {
    render(
      <Attachments variant="composer">
        <Attachment
          data={{
            filename: 'field-notes.md',
            id: 'file-1',
            mediaType: 'text/markdown',
            type: 'file',
            url: 'blob:field-notes',
          }}
        >
          <AttachmentPreview />
          <AttachmentInfo showMediaType />
        </Attachment>
      </Attachments>,
    );

    expect(screen.getByText('field-notes.md')).toBeVisible();
    expect(screen.getByText('text/markdown')).toBeVisible();
    const attachment = document.querySelector('[data-attachment-variant]');
    expect(attachment).toHaveAttribute(
      'data-attachment-category',
      'document',
    );
    expect(attachment).toHaveClass('size-36');
    expect(attachment).not.toHaveClass('h-14', 'w-60');
  });
});
