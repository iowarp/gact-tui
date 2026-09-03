import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
} from './attachments';

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
