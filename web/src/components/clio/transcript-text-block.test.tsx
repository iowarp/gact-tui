import { createHash } from 'node:crypto';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TranscriptTextBlock } from './transcript-text-block';

vi.mock('./grounded-message-response', () => ({
  GroundedMessageResponse: ({ children }: { children: string }) => <p>{children}</p>,
}));
vi.mock('./streaming-text', () => ({
  ClioStreamingText: ({ text }: { text: string }) => <p>{text}</p>,
}));
afterEach(cleanup);

it('binds Unicode source revisions and withdraws them while content is streaming', () => {
  const text = '**North** 🧭 is not the rendered plain text.';
  const block = { id: 'part-1', type: 'text' as const, text, streaming: false };
  const { container, rerender } = render(<TranscriptTextBlock block={block} messageId="message-1" />);
  const node = container.querySelector('[data-slot="message-text"]');
  expect(node).toHaveAttribute('data-part-id', 'part-1');
  expect(node).toHaveAttribute('data-message-id', 'message-1');
  expect(node).toHaveAttribute('data-content-revision', createHash('sha256').update(text).digest('hex'));
  rerender(<TranscriptTextBlock block={{ ...block, text: `${text} More`, streaming: true }} messageId="message-1" />);
  expect(node).not.toHaveAttribute('data-content-revision');
  rerender(<TranscriptTextBlock block={{ ...block, text: `${text} More` }} messageId="message-1" />);
  expect(node).toHaveAttribute('data-content-revision', createHash('sha256').update(`${text} More`).digest('hex'));
});
