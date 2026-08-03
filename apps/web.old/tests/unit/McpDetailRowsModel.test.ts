import { describe, expect, it } from 'vitest';
import {
  mcpAsyncErrorMessage,
  mcpPromptRenderButtonLabel,
  mcpPromptRenderedText,
  mcpResourcePreviewButtonLabel,
  mcpResourcePreviewText,
  mcpResourceSubscribeButtonLabel,
} from '../../src/routes/discovery/McpDetailRowsModel.js';

describe('McpDetailRowsModel', () => {
  it('formats rendered prompt messages', () => {
    expect(
      mcpPromptRenderedText([
        { role: 'user', content: { text: 'hello' } },
        { role: 'assistant', content: { text: null } },
      ]),
    ).toBe('USER\nhello\n\nASSISTANT\n[non-text]');
    expect(mcpPromptRenderedText([])).toBe('(empty)');
    expect(mcpPromptRenderedText(undefined)).toBe('(empty)');
  });

  it('formats resource preview content', () => {
    expect(
      mcpResourcePreviewText([
        { text: 'alpha' },
        { mimeType: 'image/png' },
        {},
      ]),
    ).toBe('alpha\n[image/png]\n[binary]');
    expect(mcpResourcePreviewText([])).toBe('(empty)');
    expect(mcpResourcePreviewText(undefined)).toBe('(empty)');
  });

  it('normalizes async errors', () => {
    expect(mcpAsyncErrorMessage(new Error('failed'))).toBe('failed');
    expect(mcpAsyncErrorMessage('failed')).toBe('failed');
  });

  it('labels row action buttons', () => {
    expect(mcpPromptRenderButtonLabel(true, false)).toBe('…');
    expect(mcpPromptRenderButtonLabel(false, true)).toBe('Hide');
    expect(mcpPromptRenderButtonLabel(false, false)).toBe('Render');
    expect(mcpResourcePreviewButtonLabel(true, false)).toBe('…');
    expect(mcpResourcePreviewButtonLabel(false, true)).toBe('Hide');
    expect(mcpResourcePreviewButtonLabel(false, false)).toBe('Preview');
    expect(mcpResourceSubscribeButtonLabel(true)).toBe('✓ Subscribed');
    expect(mcpResourceSubscribeButtonLabel(false)).toBe('Subscribe');
  });
});
